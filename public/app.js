(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const KEY = 'boda-codigo';
  const store = {
    get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
    set: (v) => { try { localStorage.setItem(KEY, v); } catch {} },
    clear: () => { try { localStorage.removeItem(KEY); } catch {} },
  };

  // ── Cuenta atrás ─────────────────────────────
  const cuenta = $('#cuenta');
  if (cuenta) {
    const fecha = new Date(cuenta.dataset.fecha);
    const hoy = new Date();
    const dias = Math.ceil((new Date(fecha.toDateString()) - new Date(hoy.toDateString())) / 864e5);
    cuenta.textContent =
      dias > 1 ? `Faltan ${dias} días.` : dias === 1 ? '¡Es mañana!' : dias === 0 ? '¡Es hoy!' : 'Gracias por venir.';
  }

  // ── Copiar IBAN ──────────────────────────────
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copiar]');
    if (!b) return;
    const txt = $('#' + b.dataset.copiar)?.textContent.trim();
    try { await navigator.clipboard.writeText(txt); b.textContent = 'Copiado'; setTimeout(() => (b.textContent = 'Copiar'), 2000); } catch {}
  });

  // ── Botón flotante ───────────────────────────
  const flotante = $('#flotante');
  const portada = $('.portada');
  const confirmar = $('#confirmar');
  if (flotante && 'IntersectionObserver' in window) {
    const vis = { portada: true, confirmar: false };
    const update = () => flotante.classList.toggle('visible', !vis.portada && !vis.confirmar && !state.done);
    new IntersectionObserver((es) => es.forEach((en) => {
      vis[en.target === portada ? 'portada' : 'confirmar'] = en.isIntersecting;
      update();
    }), { threshold: 0.05 }).observe(portada);
    new IntersectionObserver((es) => es.forEach((en) => { vis.confirmar = en.isIntersecting; update(); }), { threshold: 0.05 }).observe(confirmar);
    window.__updateFlotante = update;
  }

  // ── Formulario de confirmación ───────────────
  const root = $('#rsvp');
  const state = { config: null, invite: null, step: 0, data: null, done: false, sending: false, error: '' };

  const BUS = { none: 'No, gracias', out: 'Solo ida', back: 'Solo vuelta', both: 'Ida y vuelta' };
  const menuLabel = (id) => state.config.menus.find((m) => m.id === id)?.label || '';
  const stop = (id) => state.config.stops.find((s) => s.id === id);

  const steps = () => (state.data.attending === false ? ['asistencia', 'revisar'] : ['asistencia', 'personas', 'autobus', 'canciones', 'revisar']);

  async function api(path, opts) {
    const res = await fetch(path, opts);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'No hemos podido conectar. Revisa tu conexión y prueba otra vez.');
    return body;
  }

  async function init() {
    try {
      state.config = await api('/api/config');
    } catch (e) {
      root.innerHTML = `<p class="aviso-error">${esc(e.message)}</p>`;
      return;
    }
    const fromUrl = new URLSearchParams(location.search).get('c');
    const code = fromUrl || store.get();
    if (code) await openInvite(code, !fromUrl);
    else renderCode();
  }

  async function openInvite(code, silent) {
    root.innerHTML = '<p class="cargando">Abriendo vuestra invitación…</p>';
    try {
      const inv = await api('/api/invite/' + encodeURIComponent(code));
      store.set(inv.code);
      state.invite = inv;
      state.data = fromInvite(inv);
      state.step = 0;
      if (inv.status !== 'pending') renderAnswered();
      else renderStep();
    } catch (e) {
      if (silent) store.clear();
      renderCode(silent ? '' : e.message, code);
    }
  }

  function fromInvite(inv) {
    const guests = inv.guests.length
      ? inv.guests.map((g) => ({ ...g }))
      : [{ name: inv.contactName || '', isChild: false, menu: '', allergies: '' }];
    return {
      attending: inv.status === 'yes' ? true : inv.status === 'no' ? false : null,
      contactName: inv.contactName || (inv.guests[0]?.name ?? ''),
      phone: inv.phone,
      guests: guests.slice(0, inv.maxSeats),
      bus: { type: inv.bus.type || 'none', stop: inv.bus.stop || '', seats: inv.bus.seats || 0 },
      songs: inv.songs.map((s) => ({ title: s.title, artist: s.artist || '' })),
      message: inv.message,
    };
  }

  // ── Pantallas ────────────────────────────────

  function renderCode(error = '', value = '') {
    root.innerHTML = `
      <form id="f-codigo" novalidate>
        <div class="campo">
          <label for="codigo">Código de tu invitación
            <span class="ayuda">Está al final del enlace que os mandamos por WhatsApp.</span></label>
          <input id="codigo" name="codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(value)}" required>
        </div>
        <button class="boton boton--ancho" type="submit">Abrir mi invitación</button>
        ${error ? `<p class="aviso-error" role="alert">${esc(error)}</p>` : ''}
      </form>`;
    $('#f-codigo').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#codigo').value.trim();
      if (!v) return renderCode('Escribe el código para continuar.');
      openInvite(v, false);
    });
  }

  function greeting() {
    return `<p class="saludo">Hola, ${esc(state.invite.label)}</p>`;
  }

  function progress() {
    const list = steps();
    return `<div class="progreso" aria-hidden="true">
      ${list.map((_, i) => `<span class="progreso__pieza ${i < state.step ? 'hecho' : i === state.step ? 'actual' : ''}"></span>`).join('')}
      <span class="progreso__texto">Paso ${state.step + 1} de ${list.length}</span>
    </div>`;
  }

  function renderStep() {
    const name = steps()[state.step];
    const body = VIEWS[name]();
    const last = name === 'revisar';
    root.innerHTML = `
      ${state.step === 0 ? greeting() : ''}
      ${progress()}
      <form id="f-paso" novalidate>
        ${body}
        ${state.error ? `<p class="aviso-error" role="alert">${esc(state.error)}</p>` : ''}
        <div class="acciones">
          ${state.step > 0 ? '<button type="button" class="boton boton--secundario" data-accion="atras">Atrás</button>' : ''}
          <button type="submit" class="boton" ${state.sending ? 'disabled' : ''}>${last ? (state.sending ? 'Enviando…' : 'Enviar respuesta') : 'Siguiente'}</button>
        </div>
      </form>`;
    const form = $('#f-paso');
    form.addEventListener('submit', onNext);
    form.addEventListener('change', onChange);
    form.addEventListener('click', onClick);
  }

  const VIEWS = {
    asistencia() {
      const d = state.data;
      return `
        <h3 class="paso__titulo">¿Venís a la boda?</h3>
        <fieldset class="opciones opciones--2">
          <legend class="etiqueta" hidden>Asistencia</legend>
          <label class="opcion opcion--grande"><input type="radio" name="attending" value="si" ${d.attending === true ? 'checked' : ''}><span>Sí, allí estaremos</span></label>
          <label class="opcion opcion--grande"><input type="radio" name="attending" value="no" ${d.attending === false ? 'checked' : ''}><span>No podemos ir</span></label>
        </fieldset>
        <div class="campo">
          <label for="contactName">Tu nombre</label>
          <input id="contactName" name="contactName" type="text" autocomplete="name" maxlength="80" value="${esc(d.contactName)}">
        </div>
        <div class="campo">
          <label for="phone">Teléfono <span class="ayuda">Opcional. Solo para avisos de última hora.</span></label>
          <input id="phone" name="phone" type="tel" autocomplete="tel" maxlength="20" value="${esc(d.phone)}">
        </div>`;
    },

    personas() {
      const { guests } = state.data;
      const inv = state.invite;
      const menus = state.config.menus;
      const people = guests.map((g, i) => `
        <div class="persona" data-i="${i}">
          <div class="persona__cabecera">
            <span class="persona__num">Persona ${i + 1}</span>
            ${guests.length > 1 ? `<button type="button" class="quitar" data-accion="quitar" data-i="${i}">Quitar</button>` : ''}
          </div>
          <div class="campo">
            <label for="name-${i}">Nombre</label>
            <input id="name-${i}" name="name-${i}" type="text" maxlength="60" value="${esc(g.name)}" autocomplete="off">
          </div>
          ${inv.childrenAllowed ? `<label class="casilla"><input type="checkbox" name="child-${i}" ${g.isChild ? 'checked' : ''}> Es un niño o una niña</label>` : ''}
          <fieldset class="opciones opciones--2">
            <legend class="etiqueta">Menú</legend>
            ${menus.filter((m) => !m.kids || g.isChild).map((m) => `
              <label class="opcion"><input type="radio" name="menu-${i}" value="${esc(m.id)}" ${g.menu === m.id ? 'checked' : ''}><span>${esc(m.label)}</span></label>`).join('')}
          </fieldset>
          <details class="alergias" ${g.allergies ? 'open' : ''}>
            <summary>¿Alguna alergia o intolerancia?</summary>
            <div class="campo">
              <label for="allergies-${i}" class="ayuda">Solo se lo pasaremos al catering.</label>
              <input id="allergies-${i}" name="allergies-${i}" type="text" maxlength="200" value="${esc(g.allergies)}" placeholder="Por ejemplo: frutos secos, celiaquía">
            </div>
          </details>
        </div>`).join('');
      return `
        <h3 class="paso__titulo">¿Quiénes venís?</h3>
        <p class="ayuda">Vuestra invitación es para ${inv.maxSeats} ${inv.maxSeats === 1 ? 'persona' : 'personas'}.</p>
        ${people}
        ${guests.length < inv.maxSeats ? '<button type="button" class="boton boton--secundario boton--ancho" data-accion="añadir">Añadir persona</button>' : ''}`;
    },

    autobus() {
      const { bus, guests } = state.data;
      const stops = state.config.stops;
      return `
        <h3 class="paso__titulo">¿Necesitáis autobús?</h3>
        <fieldset class="opciones opciones--2">
          <legend class="etiqueta" hidden>Autobús</legend>
          ${Object.entries(BUS).map(([k, v]) => `
            <label class="opcion"><input type="radio" name="busType" value="${k}" ${bus.type === k ? 'checked' : ''}><span>${v}</span></label>`).join('')}
        </fieldset>
        ${bus.type !== 'none' ? `
          <fieldset class="opciones">
            <legend class="etiqueta">¿Desde qué parada?</legend>
            ${stops.map((s) => `
              <label class="opcion"><input type="radio" name="busStop" value="${esc(s.id)}" ${bus.stop === s.id ? 'checked' : ''}>
                <span>${esc(s.name)}<small>Sale a las ${esc(s.out)}. Vuelve a las ${esc(s.back)}.</small></span></label>`).join('')}
          </fieldset>
          <div class="campo">
            <span class="etiqueta" id="l-plazas">Plazas de autobús</span>
            <div class="contador" role="group" aria-labelledby="l-plazas">
              <button type="button" data-accion="menos" aria-label="Una plaza menos">−</button>
              <output id="plazas">${bus.seats || guests.length}</output>
              <button type="button" data-accion="mas" aria-label="Una plaza más">+</button>
            </div>
          </div>` : ''}`;
    },

    canciones() {
      const { songs, message } = state.data;
      const rows = Array.from({ length: state.config.maxSongs }, (_, i) => songs[i] || { title: '', artist: '' });
      return `
        <h3 class="paso__titulo">Una canción para la fiesta</h3>
        <p class="ayuda">Opcional. Hasta ${state.config.maxSongs}; el DJ las tendrá todas.</p>
        ${rows.map((s, i) => `
          <div class="cancion">
            <input type="text" name="song-${i}" maxlength="100" placeholder="Canción" aria-label="Canción ${i + 1}" value="${esc(s.title)}">
            <input type="text" name="artist-${i}" maxlength="80" placeholder="Artista" aria-label="Artista de la canción ${i + 1}" value="${esc(s.artist)}">
          </div>`).join('')}
        <div class="campo" style="margin-top:1.25rem">
          <label for="message">Un mensaje para nosotros <span class="ayuda">Opcional.</span></label>
          <textarea id="message" name="message" maxlength="600">${esc(message)}</textarea>
        </div>`;
    },

    revisar() {
      const d = state.data;
      if (d.attending === false) {
        return `
          <h3 class="paso__titulo">Os echaremos de menos</h3>
          <p>Vamos a apuntar que no podéis venir.</p>
          <div class="campo">
            <label for="message">¿Nos dejáis un mensaje? <span class="ayuda">Opcional.</span></label>
            <textarea id="message" name="message" maxlength="600">${esc(d.message)}</textarea>
          </div>`;
      }
      return `<h3 class="paso__titulo">Revisa y envía</h3>${summaryList()}`;
    },
  };

  function summaryList() {
    const d = state.data;
    if (d.attending === false) {
      return `<ul class="resumen"><li><b>Respuesta</b>No podéis venir</li>${d.message ? `<li><b>Mensaje</b>${esc(d.message)}</li>` : ''}</ul>`;
    }
    const s = stop(d.bus.stop);
    const songs = d.songs.filter((x) => x.title);
    return `<ul class="resumen">
      ${d.guests.map((g) => `<li><b>${g.isChild ? 'Niño o niña' : 'Persona'}</b>${esc(g.name)}, menú ${esc(menuLabel(g.menu).toLowerCase())}${g.allergies ? `. Alergias: ${esc(g.allergies)}` : ''}</li>`).join('')}
      <li><b>Autobús</b>${d.bus.type === 'none' ? 'No lo necesitáis' : `${BUS[d.bus.type]} desde ${esc(s?.name || '')}, ${d.bus.seats} ${d.bus.seats === 1 ? 'plaza' : 'plazas'}`}</li>
      ${songs.length ? `<li><b>Canciones</b>${songs.map((x) => esc(x.title + (x.artist ? ` (${x.artist})` : ''))).join('<br>')}</li>` : ''}
      ${d.message ? `<li><b>Mensaje</b>${esc(d.message)}</li>` : ''}
    </ul>`;
  }

  function renderAnswered() {
    const inv = state.invite;
    const d = state.data;
    root.innerHTML = `
      ${greeting()}
      <p>${d.attending ? `Ya nos dijisteis que venís. ¡Qué ganas!` : 'Ya nos dijisteis que no podéis venir.'}</p>
      ${summaryList()}
      ${inv.open
        ? '<button type="button" class="boton boton--secundario boton--ancho" id="cambiar">Cambiar mi respuesta</button>'
        : '<p class="ayuda">El plazo para cambiar la respuesta ya ha terminado. Si necesitáis algo, escribidnos.</p>'}
      <p class="ayuda" style="margin-top:1rem"><a href="#" id="otro">¿No es vuestra invitación? Usar otro código</a></p>`;
    $('#cambiar')?.addEventListener('click', () => { state.step = 0; state.error = ''; renderStep(); scrollToForm(); });
    $('#otro').addEventListener('click', (e) => { e.preventDefault(); store.clear(); history.replaceState(null, '', location.pathname + '#confirmar'); renderCode(); });
  }

  function renderThanks() {
    const d = state.data;
    state.done = true;
    window.__updateFlotante?.();
    root.innerHTML = `
      <div class="gracias">
        <div class="gracias__flor" aria-hidden="true"></div>
        <p class="saludo">${d.attending ? `¡Gracias, ${esc(d.contactName)}!` : `Gracias por avisar, ${esc(d.contactName)}`}</p>
        <p>Respuesta enviada. ${d.attending ? 'Nos vemos en Villa Delia.' : 'Os echaremos de menos.'}</p>
      </div>
      ${summaryList()}
      <button type="button" class="boton boton--secundario boton--ancho" id="cambiar">Cambiar mi respuesta</button>`;
    $('#cambiar').addEventListener('click', () => { state.step = 0; state.done = false; renderStep(); scrollToForm(); });
    scrollToForm();
  }

  const scrollToForm = () => confirmar.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

  // ── Lectura y validación ─────────────────────

  function collect() {
    const f = $('#f-paso');
    if (!f) return;
    const d = state.data;
    const val = (n) => f.elements[n]?.value ?? '';
    const name = steps()[state.step];
    if (name === 'asistencia') {
      const a = f.querySelector('[name=attending]:checked')?.value;
      d.attending = a === 'si' ? true : a === 'no' ? false : null;
      d.contactName = val('contactName').trim();
      d.phone = val('phone').trim();
    }
    if (name === 'personas') {
      d.guests = d.guests.map((g, i) => ({
        name: val(`name-${i}`).trim(),
        isChild: !!f.elements[`child-${i}`]?.checked,
        menu: f.querySelector(`[name="menu-${i}"]:checked`)?.value || '',
        allergies: val(`allergies-${i}`).trim(),
      }));
      // si deja de ser niño, fuera el menú infantil
      d.guests.forEach((g) => { if (!g.isChild && state.config.menus.find((m) => m.id === g.menu)?.kids) g.menu = ''; });
    }
    if (name === 'autobus') {
      d.bus.type = f.querySelector('[name=busType]:checked')?.value || 'none';
      d.bus.stop = f.querySelector('[name=busStop]:checked')?.value || d.bus.stop || '';
      const out = $('#plazas');
      d.bus.seats = out ? Number(out.textContent) : 0;
    }
    if (name === 'canciones') {
      d.songs = Array.from({ length: state.config.maxSongs }, (_, i) => ({ title: val(`song-${i}`).trim(), artist: val(`artist-${i}`).trim() }));
      d.message = val('message').trim();
    }
    if (name === 'revisar' && d.attending === false) d.message = val('message').trim();
  }

  function validate() {
    const d = state.data;
    const name = steps()[state.step];
    if (name === 'asistencia') {
      if (d.attending === null) return ['Dinos si venís o no.', '[name=attending]'];
      if (!d.contactName) return ['Escribe tu nombre.', '#contactName'];
    }
    if (name === 'personas') {
      const i = d.guests.findIndex((g) => !g.name);
      if (i >= 0) return [`Falta el nombre de la persona ${i + 1}.`, `#name-${i}`];
      const j = d.guests.findIndex((g) => !g.menu);
      if (j >= 0) return [`Elige el menú de ${d.guests[j].name}.`, `[name="menu-${j}"]`];
    }
    if (name === 'autobus' && d.bus.type !== 'none') {
      if (!d.bus.stop) return ['Elige la parada del autobús.', '[name=busStop]'];
      d.bus.seats = Math.min(Math.max(d.bus.seats || d.guests.length, 1), d.guests.length);
    }
    return null;
  }

  function showError(msg, sel) {
    state.error = msg;
    renderStep();
    const el = sel && $(sel, root);
    if (el) { if (el.matches('input[type=text],input[type=tel]')) el.classList.add('invalido'); el.focus({ preventScroll: false }); }
    state.error = '';
  }

  // ── Eventos ──────────────────────────────────

  async function onNext(e) {
    e.preventDefault();
    if (state.sending) return;
    collect();
    const err = validate();
    if (err) return showError(...err);
    if (steps()[state.step] === 'revisar') return submit();
    if (steps()[state.step] === 'personas' && !state.data.bus.seats) state.data.bus.seats = state.data.guests.length;
    state.step += 1;
    renderStep();
    scrollToForm();
  }

  function onChange(e) {
    const n = e.target.name || '';
    if (n === 'attending' || n.startsWith('child-') || n === 'busType') {
      collect();
      if (n === 'busType' && !state.data.bus.seats) state.data.bus.seats = state.data.guests.length;
      const focus = n.startsWith('child-') ? n : null;
      renderStep();
      if (focus) $(`[name="${focus}"]`)?.focus();
    }
  }

  function onClick(e) {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const a = b.dataset.accion;
    if (a === 'atras') { collect(); state.step -= 1; renderStep(); scrollToForm(); }
    if (a === 'añadir') { collect(); state.data.guests.push({ name: '', isChild: false, menu: '', allergies: '' }); renderStep(); $(`#name-${state.data.guests.length - 1}`)?.focus(); }
    if (a === 'quitar') { collect(); state.data.guests.splice(Number(b.dataset.i), 1); renderStep(); }
    if (a === 'mas' || a === 'menos') {
      const out = $('#plazas');
      const max = state.data.guests.length;
      out.textContent = Math.min(max, Math.max(1, Number(out.textContent) + (a === 'mas' ? 1 : -1)));
    }
  }

  async function submit() {
    const d = state.data;
    state.sending = true;
    renderStep();
    try {
      await api('/api/rsvp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: state.invite.code,
          attending: d.attending,
          contactName: d.contactName,
          phone: d.phone,
          guests: d.attending ? d.guests : [],
          bus: d.attending ? d.bus : { type: 'none' },
          songs: d.attending ? d.songs.filter((s) => s.title) : [],
          message: d.message,
        }),
      });
      state.sending = false;
      state.invite.status = d.attending ? 'yes' : 'no';
      renderThanks();
    } catch (err) {
      state.sending = false;
      showError(err.message);
    }
  }

  init();
})();
