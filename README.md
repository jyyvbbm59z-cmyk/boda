# Web de la boda

Web para el móvil que anuncia la boda de Paula y Carlos en Villa Delia y recoge las confirmaciones: quién viene, el menú de cada uno, alergias, autobús y canciones. Cada respuesta llega al momento por Telegram.

Funciona en Cloudflare Workers con D1, dentro del plan gratuito.

## Cómo está hecha

| Carpeta | Qué hay |
|---|---|
| `src/config.js` | **Todos los textos y datos**: nombres, fecha, horario, menús, paradas del bus, preguntas. Lo marcado `PENDIENTE` es provisional. |
| `src/index.js` | La API: invitación, confirmación y calendario. |
| `src/telegram.js` | Avisos y comandos del bot. |
| `src/render.js` | Mete los textos de `config.js` en la portada. |
| `public/` | La página (HTML, CSS, JS, azulejo, fuentes). |
| `migrations/` | Tablas de D1. |
| `scripts/` | Importar invitados y generar la imagen de WhatsApp. |

## Puesta en marcha

```bash
npm install
npx wrangler login

# 1. Base de datos: copia el database_id que devuelve en wrangler.jsonc
npx wrangler d1 create boda
npm run db:migrate

# 2. Pon tu dominio en wrangler.jsonc (PUBLIC_URL y routes) y despliega
npm run deploy
```

### Bot de Telegram

1. Crea el bot con [@BotFather](https://t.me/BotFather) (`/newbot`) y copia el token.
2. Guarda los secretos:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # cualquier cadena larga inventada
   npx wrangler secret put TELEGRAM_CHAT_ID          # de momento pon 0
   ```
3. Conecta el bot a la web:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://boda.tudominio.es/telegram/webhook&secret_token=<WEBHOOK_SECRET>"
   ```
4. Escríbele al bot desde tu Telegram: te contestará con tu chat id. Ponlo en `TELEGRAM_CHAT_ID` (los dos, separados por comas, o el id de un grupo donde estéis los dos con el bot).

Comandos: `/resumen` (plazas ocupadas, menús, autobús), `/canciones`, `/alergias`.

### Código de la boda

Hay **un único código para todos**, el que ponéis en la invitación. Se guarda como secreto:

```bash
npx wrangler secret put RSVP_CODE      # p. ej. "Paula y Carlos" (da igual mayúsculas, tildes o espacios)
```

- Quien lo tenga puede confirmar. Entra con `https://…/?c=CODIGO` o escribiéndolo en la web.
- Da igual cómo se escriba: mayúsculas, minúsculas, tildes o espacios.
- Hay un máximo de **200 plazas** en total y **6 personas por respuesta** (`capacity` y `maxPerResponse` en `src/config.js`).
- Al confirmar, cada uno recibe **su propio enlace** (`?r=XXXX`) para cambiar la respuesta. El móvil lo recuerda solo.
- Sin `RSVP_CODE` puesto, el formulario está cerrado.

*Opcional:* si queréis apuntar a alguien a mano con sus nombres ya puestos, `npm run invitados -- invitados.csv` (ver `scripts/ejemplo.csv`) crea respuestas vacías con su enlace propio.

## Cambiar textos

Edita `src/config.js` y `npm run deploy`. Si cambias nombres o fecha, regenera la imagen que sale al compartir el enlace:

```bash
pip install playwright && playwright install chromium
python3 scripts/og.py "Paula" "Carlos" "22 de mayo 2027 — 13:00h."
```

## Probar en local

```bash
npm run db:migrate:local
echo 'RSVP_CODE=prueba' > .dev.vars
npm run dev        # http://localhost:8787/?c=prueba
```

Sin token de Telegram, los avisos se escriben en la consola.

## Próximo paso

Panel `/admin` con el resumen, la lista de invitados y las exportaciones CSV para catering, autobús y DJ (fase 2 de la spec).
