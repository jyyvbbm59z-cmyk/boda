(() => {
  'use strict';

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    clear: (k) => { try { localStorage.removeItem(k); } catch {} },
  };
  const ACCESO = 'boda-acceso';   // el código de la invitación
  const TOKEN = 'boda-respuesta'; // el enlace propio de la respuesta ya enviada

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

  // ── Música de fondo ──────────────────────────
  // Los móviles no dejan sonar nada hasta que la persona toca la pantalla:
  // arranca con el primer toque (salvo que la haya quitado) y el botón la para.
  const audio = $('#musica');
  const botonMusica = $('#boton-musica');
  if (audio && botonMusica) {
    const OFF = 'boda-musica-off';
    const pintar = () => {
      const on = !audio.paused;
      botonMusica.setAttribute('aria-pressed', String(on));
      botonMusica.setAttribute('aria-label', on ? 'Quitar música' : 'Poner música');
      botonMusica.classList.toggle('sonando', on);
    };
    const subir = () => {
      audio.volume = 0;
      const t = setInterval(() => { audio.volume = Math.min(0.6, audio.volume + 0.05); if (audio.volume >= 0.6) clearInterval(t); }, 120);
    };
    const tocar = () => audio.play().then(subir).catch(() => {}).finally(pintar);
    botonMusica.addEventListener('click', () => {
      if (audio.paused) { store.clear(OFF); tocar(); }
      else { audio.pause(); store.set(OFF, '1'); pintar(); }
    });
    const primerToque = (e) => {
      if (e.target.closest('#boton-musica')) return;
      if (!store.get(OFF) && audio.paused) tocar();
    };
    document.addEventListener('pointerdown', primerToque, { once: true });
    document.addEventListener('keydown', primerToque, { once: true });
    audio.addEventListener('pause', pintar);
    audio.addEventListener('play', pintar);

    // Si la web pasa a segundo plano (otra app, pantalla bloqueada…), se calla;
    // al volver, sigue donde iba salvo que la hubieran quitado.
    let pausadaPorSalir = false;
    const salir = () => { if (!audio.paused) { pausadaPorSalir = true; audio.pause(); } };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) salir();
      else if (pausadaPorSalir && !store.get(OFF)) { pausadaPorSalir = false; tocar(); }
    });
    window.addEventListener('pagehide', salir);
  }

  // ── Formulario de confirmación ───────────────
  const root = $('#rsvp');
  const state = { config: null, invite: null, access: '', step: 0, data: null, done: false, sending: false, error: '' };

  const BUS = { none: 'No, gracias', out: 'Solo ida', back: 'Solo vuelta', both: 'Ida y vuelta' };
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
    const q = new URLSearchParams(location.search);
    const token = q.get('r') || store.get(TOKEN);
    if (token) return openResponse(token, !q.get('r'));
    const code = q.get('c') || store.get(ACCESO);
    if (code) return enter(code, true);
    renderCode();
  }

  // Abre una respuesta ya enviada (para verla o cambiarla)
  async function openResponse(token, silent) {
    root.innerHTML = '<p class="cargando">Abriendo vuestra respuesta…</p>';
    try {
      const inv = await api('/api/respuesta/' + encodeURIComponent(token));
      store.set(TOKEN, inv.token);
      state.invite = inv;
      state.data = fromInvite(inv);
      state.step = 0;
      if (inv.status !== 'pending') renderAnswered();
      else renderStep();
    } catch (e) {
      if (silent) { store.clear(TOKEN); return init(); }
      renderCode(e.message);
    }
  }

  // Entra con el código de la invitación y empieza una respuesta nueva
  async function enter(code, silent) {
    root.innerHTML = '<p class="cargando">Un momento…</p>';
    try {
      await api('/api/acceso', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
      store.set(ACCESO, code);
      state.access = code;
      state.invite = { token: '', label: '', maxSeats: state.config.maxPerResponse, childrenAllowed: true, status: 'pending', open: state.config.open };
      state.data = {
        attending: null, contactName: '', phone: '',
        guests: [{ name: '', isChild: false, allergies: '' }],
        bus: { type: 'none', stop: '', seats: 0 }, songs: [], message: '',
      };
      state.step = 0;
      renderStep();
    } catch (e) {
      store.clear(ACCESO);
      renderCode(silent ? '' : e.message, silent ? '' : code);
    }
  }

  function fromInvite(inv) {
    const guests = inv.guests.length
      ? inv.guests.map((g) => ({ ...g }))
      : [{ name: inv.contactName || '', isChild: false, allergies: '' }];
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
          <label for="codigo">Código de la invitación
            <span class="ayuda">Lo encontraréis en la invitación.</span></label>
          <input id="codigo" name="codigo" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(value)}" required>
        </div>
        <button class="boton boton--ancho" type="submit">Entrar</button>
        ${error ? `<p class="aviso-error" role="alert">${esc(error)}</p>` : ''}
      </form>`;
    $('#f-codigo').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#codigo').value.trim();
      if (!v) return renderCode('Escribe el código para continuar.');
      enter(v, false);
    });
  }

  function greeting() {
    return `<p class="saludo">${state.invite.label ? `Hola, ${esc(state.invite.label)}` : '¡Hola!'}</p>`;
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
        <p class="ayuda">Hasta ${inv.maxSeats} personas en esta respuesta. Si sois más, enviad otra.</p>
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
      const song = songs[0] ? [songs[0].title, songs[0].artist].filter(Boolean).join(' — ') : '';
      return `
        <h3 class="paso__titulo">Una canción para la fiesta</h3>
        <div class="campo">
          <label for="song" class="ayuda">Opcional. Se la pasaremos al DJ.</label>
          <input type="text" id="song" name="song" maxlength="120" placeholder="Por ejemplo: Mediterráneo, de Serrat" value="${esc(song)}">
        </div>
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
      ${d.guests.map((g) => `<li><b>${g.isChild ? 'Niño o niña' : 'Persona'}</b>${esc(g.name)}${g.allergies ? `. Alergias: ${esc(g.allergies)}` : ''}</li>`).join('')}
      <li><b>Autobús</b>${d.bus.type === 'none' ? 'No lo necesitáis' : `${BUS[d.bus.type]} desde ${esc(s?.name || '')}, ${d.bus.seats} ${d.bus.seats === 1 ? 'plaza' : 'plazas'}`}</li>
      ${songs.length ? `<li><b>Canción</b>${songs.map((x) => esc([x.title, x.artist].filter(Boolean).join(' — '))).join('<br>')}</li>` : ''}
      ${d.message ? `<li><b>Mensaje</b>${esc(d.message)}</li>` : ''}
    </ul>`;
  }

  function renderAnswered() {
    const inv = state.invite;
    const d = state.data;
    root.innerHTML = `
      ${greeting()}
      <p>${d.attending ? 'Ya nos has enviado tu respuesta. ¡Qué ganas de veros!' : 'Ya nos has enviado tu respuesta: esta vez no podéis venir. Os echaremos de menos.'}</p>
      ${summaryList()}
      ${inv.open
        ? '<button type="button" class="boton boton--secundario boton--ancho" id="cambiar">Cambiar mi respuesta</button>'
        : '<p class="ayuda">El plazo para cambiar la respuesta ya ha terminado. Si necesitáis algo, escribidnos.</p>'}
      ${ownLink()}
      <p class="ayuda" style="margin-top:1rem"><a href="#" id="otro">Enviar otra respuesta (de otra familia)</a></p>`;
    $('#cambiar')?.addEventListener('click', () => { state.step = 0; state.error = ''; renderStep(); scrollToForm(); });
    bindCopy();
    $('#otro').addEventListener('click', (e) => {
      e.preventDefault();
      store.clear(TOKEN);
      history.replaceState(null, '', location.pathname + '#confirmar');
      const code = store.get(ACCESO);
      code ? enter(code, true) : renderCode();
    });
  }

  function renderThanks() {
    const d = state.data;
    state.done = true;
    root.innerHTML = `
      <div class="gracias">
        <p class="saludo">${d.attending ? `¡Gracias, ${esc(d.contactName)}!` : `Gracias por avisar, ${esc(d.contactName)}`}</p>
        <p>Respuesta enviada. ${d.attending ? 'Nos vemos en Villa Delia.' : 'Os echaremos de menos.'}</p>
      </div>
      ${ownLink()}
      ${summaryList()}
      <button type="button" class="boton boton--secundario boton--ancho" id="cambiar">Cambiar mi respuesta</button>`;
    $('#cambiar').addEventListener('click', () => { state.step = 0; state.done = false; renderStep(); scrollToForm(); });
    bindCopy();
    scrollToForm();
  }

  // Enlace propio para cambiar la respuesta: se lo pueden mandar por WhatsApp
  // (a sí mismos, con «Tú» o «Mensaje a ti mismo») o copiarlo.
  function ownLink() {
    const url = `${location.origin}/?r=${state.invite.token}`;
    const pareja = [...document.querySelectorAll('.nombres__uno, .nombres__dos')].map((n) => n.textContent.trim()).join(' y ');
    const texto = `Mi respuesta para la boda de ${pareja}. Para verla o cambiarla: ${url}`;
    return `<div class="enlace-propio">
      <p class="enlace-propio__titulo">Guarda tu enlace</p>
      <p class="ayuda">Con él puedes ver o cambiar tu respuesta desde cualquier móvil.</p>
      <a class="boton boton--whatsapp boton--ancho" href="https://wa.me/?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Guardar en WhatsApp</a>
      <p class="enlace-propio__url"><a href="${esc(url)}" id="mi-enlace">${esc(url.replace(/^https?:\/\//, ''))}</a></p>
      <button type="button" class="boton boton--secundario" id="copiar-enlace">Copiar enlace</button>
    </div>`;
  }
  function bindCopy() {
    $('#copiar-enlace')?.addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText($('#mi-enlace').href); e.target.textContent = 'Copiado'; } catch {}
    });
  }

  const scrollToForm = () => $('#confirmar').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

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
        allergies: val(`allergies-${i}`).trim(),
      }));
    }
    if (name === 'autobus') {
      d.bus.type = f.querySelector('[name=busType]:checked')?.value || 'none';
      d.bus.stop = f.querySelector('[name=busStop]:checked')?.value || d.bus.stop || '';
      const out = $('#plazas');
      d.bus.seats = out ? Number(out.textContent) : 0;
    }
    if (name === 'canciones') {
      const song = val('song').trim();
      d.songs = song ? [{ title: song, artist: '' }] : [];
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
    if (steps()[state.step] === 'asistencia' && !state.data.guests[0].name) state.data.guests[0].name = state.data.contactName;
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
    if (a === 'añadir') { collect(); state.data.guests.push({ name: '', isChild: false, allergies: '' }); renderStep(); $(`#name-${state.data.guests.length - 1}`)?.focus(); }
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
      const res = await api('/api/rsvp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token: state.invite.token || undefined,
          access: state.invite.token ? undefined : state.access,
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
      state.invite.token = res.token;
      state.invite.label = state.invite.label || d.contactName;
      state.invite.status = d.attending ? 'yes' : 'no';
      store.set(TOKEN, res.token);
      renderThanks();
    } catch (err) {
      state.sending = false;
      showError(err.message);
    }
  }

  init();
})();
