import { EVENT } from './config.js';
import { renderHome } from './render.js';
import { notifyResponse, handleTelegram } from './telegram.js';

// Cómo funciona el acceso:
//  · Hay UN código para todos (el de la invitación), guardado como secreto RSVP_CODE.
//  · Con él cualquiera puede enviar una respuesta nueva, hasta llenar EVENT.capacity plazas.
//  · Cada respuesta recibe su propio enlace (?r=XXXX) para cambiarla después.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (pathname === '/' || pathname === '/index.html') {
        const asset = await env.ASSETS.fetch(new URL('/', url));
        return renderHome(asset, env, url);
      }
      if (pathname === '/calendar.ics') return calendar(env);
      if (pathname === '/api/config' && request.method === 'GET') return json(publicConfig());

      if (pathname === '/api/acceso' && request.method === 'POST') {
        if (await limited(request, env)) return tooMany();
        return checkAccess(request, env);
      }
      if (pathname.startsWith('/api/respuesta/') && request.method === 'GET') {
        if (await limited(request, env)) return tooMany();
        return getResponse(env, decodeURIComponent(pathname.slice('/api/respuesta/'.length)));
      }
      if (pathname === '/api/rsvp' && request.method === 'POST') {
        if (await limited(request, env)) return tooMany();
        return saveRsvp(request, env, ctx);
      }
      if (pathname === '/telegram/webhook' && request.method === 'POST') {
        return handleTelegram(request, env);
      }
      if (pathname.startsWith('/api/') || pathname.startsWith('/telegram/')) {
        return json({ error: 'No encontrado' }, 404);
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      console.error(err);
      return json({ error: 'Algo ha fallado en el servidor. Prueba otra vez en un momento.' }, 500);
    }
  },
};

// ── utilidades ──────────────────────────────────────────────

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
const tooMany = () => json({ error: 'Demasiados intentos. Espera un minuto y vuelve a probar.' }, 429);

// "Paula y Carlos 2027" → "PAULAYCARLOS2027"
const normalize = (c) =>
  String(c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isOpen = () => Date.now() <= Date.parse(EVENT.rsvpDeadline);
const validAccess = (env, code) => !!env.RSVP_CODE && normalize(code) === normalize(env.RSVP_CODE);

const TOKEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => TOKEN_CHARS[b % TOKEN_CHARS.length]).join('');
}

async function limited(request, env) {
  if (!env.RL) return false;
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const { success } = await env.RL.limit({ key: ip });
  return !success;
}

async function seatsTaken(env, exceptGroupId = 0) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) n FROM guests gu JOIN groups g ON g.id = gu.group_id WHERE g.status = 'yes' AND g.id != ?`
  ).bind(exceptGroupId).first();
  return row?.n || 0;
}

function publicConfig() {
  return {
    music: EVENT.music,
    stops: EVENT.bus.stops.map(({ id, name, out, back }) => ({ id, name, out, back })),
    maxSongs: EVENT.maxSongs,
    maxPerResponse: EVENT.maxPerResponse,
    deadline: EVENT.rsvpDeadline,
    open: isOpen(),
  };
}

// ── acceso con el código de la boda ─────────────────────────

async function checkAccess(request, env) {
  const { code } = await request.json().catch(() => ({}));
  if (!env.RSVP_CODE) return json({ error: 'El formulario todavía no está abierto.' }, 503);
  if (!validAccess(env, code)) return json({ error: 'Ese código no es correcto. Lo tenéis en la invitación.' }, 403);
  const free = EVENT.capacity - (await seatsTaken(env));
  if (free <= 0) return json({ error: 'Ya estamos completos. Si crees que es un error, escríbenos.' }, 409);
  return json({ ok: true, free, open: isOpen() });
}

// ── respuesta ya enviada (para verla o cambiarla) ───────────

async function loadGroup(env, token) {
  const group = await env.DB.prepare('SELECT * FROM groups WHERE code = ?').bind(token).first();
  if (!group) return null;
  const [guests, songs] = await Promise.all([
    env.DB.prepare('SELECT name, is_child, menu, allergies FROM guests WHERE group_id = ? ORDER BY id').bind(group.id).all(),
    env.DB.prepare('SELECT title, artist FROM songs WHERE group_id = ? ORDER BY id').bind(group.id).all(),
  ]);
  return { group, guests: guests.results, songs: songs.results };
}

async function getResponse(env, raw) {
  const token = normalize(raw).slice(0, 12);
  const data = token && (await loadGroup(env, token));
  if (!data) return json({ error: 'No encontramos esa respuesta. Revisa el enlace.' }, 404);
  const { group: g, guests, songs } = data;
  return json({
    token: g.code,
    label: g.label,
    maxSeats: g.max_seats,
    childrenAllowed: !!g.children_allowed,
    status: g.status,
    contactName: g.contact_name || '',
    phone: g.phone || '',
    bus: { type: g.bus_type, stop: g.bus_stop_id, seats: g.bus_seats },
    message: g.message || '',
    guests: guests.map((x) => ({ name: x.name, isChild: !!x.is_child, allergies: x.allergies || '' })),
    songs,
    open: isOpen(),
  });
}

// ── guardar respuesta (nueva o cambio) ──────────────────────

async function saveRsvp(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'No hemos podido leer el formulario.' }, 400);
  }
  if (!isOpen()) return json({ error: 'El plazo para confirmar ya ha terminado. Escríbenos si necesitas cambiar algo.' }, 403);

  // ¿Cambio de una respuesta existente o respuesta nueva?
  let existing = null;
  if (body.token) {
    existing = await loadGroup(env, normalize(body.token).slice(0, 12));
    if (!existing) return json({ error: 'No encontramos esa respuesta. Revisa el enlace.' }, 404);
  } else if (!validAccess(env, body.access)) {
    return json({ error: 'Ese código no es correcto. Lo tenéis en la invitación.' }, 403);
  }
  const g = existing?.group;
  const maxSeats = g?.max_seats || EVENT.maxPerResponse;
  const childrenAllowed = g ? !!g.children_allowed : true;

  const attending = body.attending === true;
  const contactName = clean(body.contactName, 80);
  const phone = clean(body.phone, 20).replace(/[^\d+ ]/g, '');
  const message = clean(body.message, 600);
  if (!contactName) return json({ error: 'Falta tu nombre.' }, 400);

  let guests = [];
  let bus = { type: 'none', stop: null, seats: 0 };
  let songs = [];

  if (attending) {
    guests = (Array.isArray(body.guests) ? body.guests : []).map((x) => ({
      name: clean(x?.name, 60),
      isChild: childrenAllowed ? x?.isChild === true : false,
      allergies: clean(x?.allergies, 200),
    }));
    if (guests.length < 1) return json({ error: 'Añade al menos una persona.' }, 400);
    if (guests.length > maxSeats) return json({ error: `Como máximo ${maxSeats} personas por respuesta. Si sois más, enviad otra.` }, 400);
    for (const p of guests) {
      if (!p.name) return json({ error: 'Falta el nombre de alguna persona.' }, 400);
    }

    const free = EVENT.capacity - (await seatsTaken(env, g?.id || 0));
    if (guests.length > free) {
      return json({ error: free > 0 ? `Solo quedan ${free} plazas. Escríbenos y lo vemos.` : 'Ya estamos completos. Escríbenos y lo vemos.' }, 409);
    }

    const b = body.bus || {};
    const type = ['none', 'out', 'back', 'both'].includes(b.type) ? b.type : 'none';
    if (type !== 'none') {
      if (!EVENT.bus.stops.some((s) => s.id === b.stop)) return json({ error: 'Elige la parada del autobús.' }, 400);
      const seats = Math.trunc(Number(b.seats));
      if (!(seats >= 1 && seats <= guests.length)) return json({ error: `Las plazas de autobús no pueden ser más que las personas que venís (${guests.length}).` }, 400);
      bus = { type, stop: b.stop, seats };
    }

    songs = (Array.isArray(body.songs) ? body.songs : [])
      .map((s) => ({ title: clean(s?.title, 100), artist: clean(s?.artist, 80) }))
      .filter((s) => s.title)
      .slice(0, EVENT.maxSongs);
  }

  const now = new Date().toISOString();
  let groupId = g?.id;
  let token = g?.code;

  if (!g) {
    // respuesta nueva: se crea su grupo con un enlace propio
    token = newToken();
    const row = await env.DB.prepare(
      `INSERT INTO groups (code, label, max_seats, children_allowed, status, contact_name, phone, responded_at, updated_at)
       VALUES (?, ?, ?, 1, 'pending', ?, ?, ?, ?) RETURNING id`
    ).bind(token, contactName, maxSeats, contactName, phone || null, now, now).first();
    groupId = row.id;
  }

  const stmts = [
    env.DB.prepare(
      `UPDATE groups SET status = ?, label = CASE WHEN ? THEN ? ELSE label END, contact_name = ?, phone = ?, bus_type = ?, bus_stop_id = ?,
       bus_seats = ?, message = ?, responded_at = COALESCE(responded_at, ?), updated_at = ? WHERE id = ?`
    ).bind(attending ? 'yes' : 'no', g ? 0 : 1, contactName, contactName, phone || null, bus.type, bus.stop, bus.seats, message || null, now, now, groupId),
    env.DB.prepare('DELETE FROM songs WHERE group_id = ?').bind(groupId),
    ...songs.map((s) => env.DB.prepare('INSERT INTO songs (group_id, title, artist, created_at) VALUES (?, ?, ?, ?)').bind(groupId, s.title, s.artist || null, now)),
    env.DB.prepare('INSERT INTO response_log (group_id, payload, created_at) VALUES (?, ?, ?)').bind(
      groupId,
      JSON.stringify({ attending, contactName, phone, guests, bus, songs, message }),
      now
    ),
  ];
  // Si no viene, conservamos los nombres por si cambia de idea.
  if (attending) {
    stmts.push(env.DB.prepare('DELETE FROM guests WHERE group_id = ?').bind(groupId));
    for (const p of guests) {
      stmts.push(
        env.DB.prepare('INSERT INTO guests (group_id, name, is_child, menu, allergies) VALUES (?, ?, ?, ?, ?)').bind(
          groupId, p.name, p.isChild ? 1 : 0, null, p.allergies || null
        )
      );
    }
  }
  await env.DB.batch(stmts);

  ctx.waitUntil(
    notifyResponse(env, { label: contactName, attending, edited: !!g && g.status !== 'pending', guests, bus, songs, message }).catch((e) =>
      console.error('telegram', e)
    )
  );
  return json({ ok: true, token });
}

// ── calendario ──────────────────────────────────────────────

function calendar(env) {
  const start = new Date(EVENT.date);
  const end = new Date(start.getTime() + 11 * 3600 * 1000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1');
  const [a, b] = EVENT.couple;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//boda//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:boda-${fmt(start)}@${new URL(env.PUBLIC_URL || 'https://boda.local').hostname}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(`Boda de ${a} y ${b}`)}`,
    `LOCATION:${esc(`${EVENT.venue.name}, ${EVENT.venue.address}`)}`,
    `DESCRIPTION:${esc(env.PUBLIC_URL || '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return new Response(ics, {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="boda.ics"' },
  });
}
