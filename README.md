# Web de la boda

Web para el móvil que anuncia la boda en Villa Delia y recoge las confirmaciones: quién viene, el menú de cada uno, alergias, autobús y canciones. Cada respuesta llega al momento por Telegram.

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

Comandos: `/resumen`, `/pendientes` (con el enlace de cada uno para reenviárselo), `/canciones`, `/alergias`.

### Invitados

Haz un `invitados.csv` (se puede exportar desde Excel con `;`) siguiendo `scripts/ejemplo.csv`:

```
grupo;plazas;nombres;telefono;codigo
Familia García;4;Pepe García/Marisa López/Lucía*/Pablo*;600111222;
```

- `nombres` separados por `/`; los niños con `*` al final (así su formulario ofrece menú infantil).
- `codigo` vacío: el script lo crea y lo guarda en el CSV.

```bash
npm run invitados -- invitados.csv
npx wrangler d1 execute boda --remote --file invitados.sql
```

Sale `invitaciones.csv` con el enlace de cada grupo y un enlace de WhatsApp con el mensaje ya escrito. Si añades gente, edita el CSV y repite: los códigos se mantienen y no se duplica nada. Estos ficheros tienen datos personales y no se suben al repo (`.gitignore`).

## Cambiar textos

Edita `src/config.js` y `npm run deploy`. Si cambias nombres o fecha, regenera la imagen que sale al compartir el enlace:

```bash
pip install playwright && playwright install chromium
python3 scripts/og.py "Carlos" "Nombre" "24.04.2027"
```

## Probar en local

```bash
npm run db:migrate:local
cp scripts/ejemplo.csv invitados.csv && npm run invitados -- invitados.csv
npx wrangler d1 execute boda --local --file invitados.sql
npm run dev        # http://localhost:8787/?c=<código de invitaciones.csv>
```

Sin token de Telegram, los avisos se escriben en la consola.

## Próximo paso

Panel `/admin` con el resumen, la lista de invitados y las exportaciones CSV para catering, autobús y DJ (fase 2 de la spec).
