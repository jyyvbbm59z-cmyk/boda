import { EVENT } from './config.js';
import { renderHome } from './render.js';
import { notifyResponse, handleTelegram } from './telegram.js';

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

      if (pathname.startsWith('/api/invite/') && request.method === 'GET') {
        if (await limited(request, env)) return json({ error: 'Demasiados intentos. Espera un minuto.' }, 429);
        return getInvite(env, decodeURIComponent(pathname.slice('/api/invite/'.length)));
      }
      if (pathname === '/api/rsvp' && request.method === 'POST') {
        if (await limited(request, env)) return json({ error: 'Demasiados intentos. Espera un minuto.' }, 429);
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

const normalizeCode = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isOpen = () => Date.now() <= Date.parse(EVENT.rsvpDeadline);

async function limited(request, env) {
  if (!env.RL) return false;
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const { success } = await env.RL.limit({ key: ip });
  return !success;
}

function publicConfig() {
  return {
    menus: EVENT.menus,
    stops: EVENT.bus.stops.map(({ id, name, out, back }) => ({ id, name, out, back })),
    maxSongs: EVENT.maxSongs,
    deadline: EVENT.rsvpDeadline,
    open: isOpen(),
  };
}

// ── invitación ──────────────────────────────────────────────

async function loadGroup(env, code) {
  const group = await env.DB.prepare('SELECT * FROM groups WHERE code = ?').bind(code).first();
  if (!group) return null;
  const [guests, songs] = await Promise.all([
    env.DB.prepare('SELECT name, is_child, menu, allergies FROM guests WHERE group_id = ? ORDER BY id').bind(group.id).all(),
    env.DB.prepare('SELECT title, artist FROM songs WHERE group_id = ? ORDER BY id').bind(group.id).all(),
  ]);
  return { group, guests: guests.results, songs: songs.results };
}

async function getInvite(env, rawCode) {
  const code = normalizeCode(rawCode);
  const data = code && (await loadGroup(env, code));
  if (!data) return json({ error: 'No encontramos ese código. Revisa el enlace o escríbenos.' }, 404);
  const { group: g, guests, songs } = data;
  return json({
    code: g.code,
    label: g.label,
    maxSeats: g.max_seats,
    childrenAllowed: !!g.children_allowed,
    status: g.status,
    contactName: g.contact_name || '',
    phone: g.phone || '',
    bus: { type: g.bus_type, stop: g.bus_stop_id, seats: g.bus_seats },
    message: g.message || '',
    guests: guests.map((x) => ({ name: x.name, isChild: !!x.is_child, menu: x.menu || '', allergies: x.allergies || '' })),
    songs,
    open: isOpen(),
  });
}

// ── confirmación ────────────────────────────────────────────

async function saveRsvp(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'No hemos podido leer el formulario.' }, 400);
  }

  const code = normalizeCode(body.code);
  const data = code && (await loadGroup(env, code));
  if (!data) return json({ error: 'No encontramos ese código. Revisa el enlace o escríbenos.' }, 404);
  if (!isOpen()) return json({ error: 'El plazo para confirmar ya ha terminado. Escríbenos si necesitas cambiar algo.' }, 403);

  const g = data.group;
  const attending = body.attending === true;
  const contactName = clean(body.contactName, 80);
  const phone = clean(body.phone, 20).replace(/[^\d+ ]/g, '');
  const message = clean(body.message, 600);
  if (!contactName) return json({ error: 'Falta tu nombre.' }, 400);

  let guests = [];
  let bus = { type: 'none', stop: null, seats: 0 };
  let songs = [];

  if (attending) {
    const menuIds = new Map(EVENT.menus.map((m) => [m.id, m]));
    guests = (Array.isArray(body.guests) ? body.guests : []).map((x) => ({
      name: clean(x?.name, 60),
      isChild: g.children_allowed ? x?.isChild === true : false,
      menu: clean(x?.menu, 30),
      allergies: clean(x?.allergies, 200),
    }));
    if (guests.length < 1) return json({ error: 'Añade al menos una persona.' }, 400);
    if (guests.length > g.max_seats) return json({ error: `Vuestra invitación es para ${g.max_seats} personas como máximo.` }, 400);
    for (const p of guests) {
      if (!p.name) return json({ error: 'Falta el nombre de alguna persona.' }, 400);
      const menu = menuIds.get(p.menu);
      if (!menu) return json({ error: `Elige el menú de ${p.name}.` }, 400);
      if (menu.kids && !p.isChild) return json({ error: `El menú ${menu.label.toLowerCase()} es solo para niños (${p.name}).` }, 400);
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
  const wasAnswered = g.status !== 'pending';
  const stmts = [
    env.DB.prepare(
      `UPDATE groups SET status = ?, contact_name = ?, phone = ?, bus_type = ?, bus_stop_id = ?, bus_seats = ?,
       message = ?, responded_at = COALESCE(responded_at, ?), updated_at = ? WHERE id = ?`
    ).bind(attending ? 'yes' : 'no', contactName, phone || null, bus.type, bus.stop, bus.seats, message || null, now, now, g.id),
    env.DB.prepare('DELETE FROM songs WHERE group_id = ?').bind(g.id),
    ...songs.map((s) => env.DB.prepare('INSERT INTO songs (group_id, title, artist, created_at) VALUES (?, ?, ?, ?)').bind(g.id, s.title, s.artist || null, now)),
    env.DB.prepare('INSERT INTO response_log (group_id, payload, created_at) VALUES (?, ?, ?)').bind(
      g.id,
      JSON.stringify({ attending, contactName, phone, guests, bus, songs, message }),
      now
    ),
  ];
  // Si no viene, conservamos los nombres previstos por si cambia de idea.
  if (attending) {
    stmts.push(env.DB.prepare('DELETE FROM guests WHERE group_id = ?').bind(g.id));
    for (const p of guests) {
      stmts.push(
        env.DB.prepare('INSERT INTO guests (group_id, name, is_child, menu, allergies) VALUES (?, ?, ?, ?, ?)').bind(
          g.id, p.name, p.isChild ? 1 : 0, p.menu, p.allergies || null
        )
      );
    }
  }
  await env.DB.batch(stmts);

  ctx.waitUntil(
    notifyResponse(env, { label: g.label, attending, edited: wasAnswered, guests, bus, songs, message }).catch((e) => console.error('telegram', e))
  );
  return json({ ok: true });
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
