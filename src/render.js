import { EVENT } from './config.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TZ = 'Europe/Madrid';
const longDate = (iso) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
const shortDate = (iso) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)).replace(/\//g, '.');
const dayMonth = (iso) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, day: 'numeric', month: 'long' }).format(new Date(iso));
const cardDate = (iso) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('es-ES', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value])
  );
  return `${p.day} de ${p.month} ${p.year} — ${p.hour}:${p.minute}h.`;
};
const time = (iso) => new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function blocks() {
  const schedule = EVENT.schedule
    .map(
      (s) => `<li class="hora">
        <time class="hora__t">${esc(s.time)}</time>
        <div><p class="hora__titulo">${esc(s.title)}</p><p class="hora__texto">${esc(s.text)}</p></div>
      </li>`
    )
    .join('');

  const stops = EVENT.bus.stops
    .map(
      (s) => `<li class="parada">
        <p class="parada__nombre">${esc(s.name)}</p>
        <p class="parada__horas">Sale a las ${esc(s.out)}. Vuelve a las ${esc(s.back)}.</p>
        <a class="enlace" href="${esc(s.mapsUrl)}" target="_blank" rel="noopener">Ver la parada en el mapa</a>
      </li>`
    )
    .join('');

  const faq = EVENT.faq
    .map((f) => `<details class="faq"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
    .join('');

  const gift = EVENT.gift.iban
    ? `<section class="seccion" id="regalo" aria-labelledby="t-regalo">
        <h2 class="titulo" id="t-regalo">Regalo</h2>
        <p>${esc(EVENT.gift.text)}</p>
        <div class="iban"><code id="iban">${esc(EVENT.gift.iban)}</code>
          <button type="button" class="boton boton--secundario" data-copiar="iban">Copiar</button></div>
      </section>`
    : '';

  const music = EVENT.music
    ? `<audio id="musica" src="/${esc(EVENT.music.replace(/^\//, ''))}" loop preload="none"></audio>
      <button type="button" class="musica" id="boton-musica" aria-pressed="false" aria-label="Poner música">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>
      </button>`
    : '';

  return { schedule, stops, faq, gift, music };
}


export async function renderHome(asset, env, url) {
  const [a, b] = EVENT.couple;
  const b_ = blocks();
  const base = (env.PUBLIC_URL || url.origin).replace(/\/$/, '');
  const tokens = {
    A: esc(a),
    B: esc(b),
    TITLE: esc(`¡Nos casamos!`),
    DESCRIPTION: esc(`${longDate(EVENT.date)} en ${EVENT.venue.name}, ${EVENT.venue.town}. Confirma tu asistencia aquí.`),
    DATE_ISO: esc(EVENT.date),
    DATE_LONG: esc(longDate(EVENT.date).replace(/^./, (c) => c.toUpperCase())),
    DATE_SHORT: esc(shortDate(EVENT.date)),
    DATE_CARD: esc(cardDate(EVENT.date)),
    TIME: esc(time(EVENT.date)),
    DEADLINE: esc(dayMonth(EVENT.rsvpDeadline)),
    VENUE: esc(EVENT.venue.name),
    TOWN: esc(EVENT.venue.town),
    ADDRESS: esc(EVENT.venue.address),
    MAPS: esc(EVENT.venue.mapsUrl),
    WAZE: esc(EVENT.venue.wazeUrl),
    PARKING: esc(EVENT.venue.parking),
    INTRO: esc(EVENT.intro),
    BUS_NOTE: esc(EVENT.bus.note),
    BASE: esc(base),
    SCHEDULE: b_.schedule,
    STOPS: b_.stops,
    FAQ: b_.faq,
    GIFT: b_.gift,
    MUSIC: b_.music,
  };
  const html = (await asset.text()).replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in tokens ? tokens[k] : m));
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}
