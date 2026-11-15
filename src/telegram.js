import { EVENT } from './config.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const menuLabel = (id) => EVENT.menus.find((m) => m.id === id)?.label || id;
const stopName = (id) => EVENT.bus.stops.find((s) => s.id === id)?.name || id;
const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const BUS = { out: 'solo ida', back: 'solo vuelta', both: 'ida y vuelta' };

const chatIds = (env) => String(env.TELEGRAM_CHAT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);

export async function send(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) return console.log(`[telegram → ${chatId}]\n${text}`); // en local, sin token
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('telegram', res.status, await res.text());
}

const broadcast = (env, text) => Promise.all(chatIds(env).map((id) => send(env, id, text)));

// Aviso de cada respuesta
export function notifyResponse(env, r) {
  const head = r.edited ? '✏️ <b>Cambio</b> · ' : '';
  if (!r.attending) return broadcast(env, `${head}❌ <b>${esc(r.label)}</b> no puede venir.${r.message ? `\n💬 «${esc(r.message)}»` : ''}`);

  const counts = {};
  for (const g of r.guests) counts[g.menu] = (counts[g.menu] || 0) + 1;
  const menus = Object.entries(counts).map(([id, n]) => `${menuLabel(id)} ×${n}`).join(', ');
  const kids = r.guests.filter((g) => g.isChild).length;
  const allergies = r.guests.filter((g) => g.allergies).map((g) => `${esc(g.name)} (${esc(g.allergies)})`);

  const lines = [
    `${head}✅ <b>${esc(r.label)}</b> confirma: ${pl(r.guests.length, 'persona', 'personas')}${kids ? ` (${pl(kids, 'niño', 'niños')})` : ''}`,
    `🍽 ${esc(menus)}`,
  ];
  if (allergies.length) lines.push(`⚠️ Alergias: ${allergies.join('; ')}`);
  lines.push(r.bus.type === 'none' ? '🚗 Sin autobús' : `🚌 ${BUS[r.bus.type]} desde ${esc(stopName(r.bus.stop))} · ${pl(r.bus.seats, 'plaza', 'plazas')}`);
  for (const s of r.songs) lines.push(`🎵 ${esc(s.title)}${s.artist ? ` — ${esc(s.artist)}` : ''}`);
  if (r.message) lines.push(`💬 «${esc(r.message)}»`);
  return broadcast(env, lines.join('\n'));
}

// ── comandos ────────────────────────────────────────────────

async function summary(env) {
  const db = env.DB;
  const [status, people, menus, bus, songs, allergies] = await Promise.all([
    db.prepare('SELECT status, COUNT(*) n FROM groups GROUP BY status').all(),
    db.prepare(`SELECT SUM(1 - is_child) adults, SUM(is_child) kids FROM guests JOIN groups g ON g.id = group_id WHERE g.status = 'yes'`).first(),
    db.prepare(`SELECT menu, COUNT(*) n FROM guests JOIN groups g ON g.id = group_id WHERE g.status = 'yes' GROUP BY menu ORDER BY n DESC`).all(),
    db.prepare(`SELECT bus_stop_id stop,
                  SUM(CASE WHEN bus_type IN ('out','both') THEN bus_seats ELSE 0 END) ida,
                  SUM(CASE WHEN bus_type IN ('back','both') THEN bus_seats ELSE 0 END) vuelta
                FROM groups WHERE status = 'yes' AND bus_type != 'none' GROUP BY bus_stop_id`).all(),
    db.prepare(`SELECT COUNT(*) n FROM songs s JOIN groups g ON g.id = s.group_id WHERE g.status = 'yes'`).first(),
    db.prepare(`SELECT COUNT(*) n FROM guests JOIN groups g ON g.id = group_id WHERE g.status = 'yes' AND allergies IS NOT NULL`).first(),
  ]);
  const st = Object.fromEntries(status.results.map((r) => [r.status, r.n]));
  const lines = [
    '<b>Resumen de la boda</b>',
    `✅ Vienen: ${pl(st.yes || 0, 'respuesta', 'respuestas')} · ${pl(people?.adults || 0, 'adulto', 'adultos')}, ${pl(people?.kids || 0, 'niño', 'niños')}`,
    `❌ No vienen: ${pl(st.no || 0, 'respuesta', 'respuestas')}`,
    `🪑 Plazas: ${(people?.adults || 0) + (people?.kids || 0)} de ${EVENT.capacity}`,
    '',
    '<b>Menús</b>',
    ...(menus.results.length ? menus.results.map((m) => `· ${menuLabel(m.menu)}: ${m.n}`) : ['· Todavía nada']),
    `⚠️ Personas con alergias: ${allergies?.n || 0}`,
    '',
    '<b>Autobús</b>',
    ...(bus.results.length ? bus.results.map((b) => `· ${esc(stopName(b.stop))}: ${b.ida} ida, ${b.vuelta} vuelta`) : ['· Nadie todavía']),
    '',
    `🎵 Canciones propuestas: ${songs?.n || 0} (/canciones)`,
  ];
  return lines.join('\n');
}

async function songList(env) {
  const { results } = await env.DB.prepare(
    `SELECT s.title, s.artist, g.label FROM songs s JOIN groups g ON g.id = s.group_id WHERE g.status = 'yes' ORDER BY s.id`
  ).all();
  if (!results.length) return 'Nadie ha propuesto canciones todavía.';
  return [`<b>Canciones (${results.length})</b>`, ...results.map((s) => `· ${esc(s.title)}${s.artist ? ` — ${esc(s.artist)}` : ''} <i>(${esc(s.label)})</i>`)].join('\n');
}

async function allergyList(env) {
  const { results } = await env.DB.prepare(
    `SELECT gu.name, gu.allergies, g.label FROM guests gu JOIN groups g ON g.id = gu.group_id
     WHERE g.status = 'yes' AND gu.allergies IS NOT NULL ORDER BY g.label`
  ).all();
  if (!results.length) return 'Nadie ha indicado alergias.';
  return ['<b>Alergias</b>', ...results.map((a) => `· ${esc(a.name)} (${esc(a.label)}): ${esc(a.allergies)}`)].join('\n');
}

const HELP = [
  '<b>Comandos</b>',
  '/resumen — cuántos vienen, plazas, menús y autobús',
  '/canciones — lista para el DJ',
  '/alergias — lista para el catering',
].join('\n');

export async function handleTelegram(request, env) {
  if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await request.json().catch(() => ({}));
  const msg = update.message;
  if (!msg?.text) return new Response('ok');

  const chatId = String(msg.chat.id);
  // Solo respondemos a los chats autorizados (los novios)
  if (!chatIds(env).includes(chatId)) {
    await send(env, chatId, `Este bot es privado. Tu chat id es <code>${esc(chatId)}</code>.`);
    return new Response('ok');
  }

  const cmd = msg.text.trim().split(/[\s@]/)[0].toLowerCase();
  const handlers = { '/resumen': summary, '/canciones': songList, '/alergias': allergyList };
  const text = handlers[cmd] ? await handlers[cmd](env) : HELP;
  await send(env, chatId, text);
  return new Response('ok');
}
