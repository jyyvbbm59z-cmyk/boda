#!/usr/bin/env node
// Convierte la lista de invitados (CSV) en SQL para D1 y en una lista de enlaces.
//
//   npm run invitados -- invitados.csv
//
// Columnas del CSV (separado por ; o ,  — la primera fila es la cabecera):
//   grupo     Cómo se llama el grupo en la web: "Familia García", "Ana y Luis"
//   plazas    Número máximo de personas
//   nombres   Nombres previstos separados por "/". Los niños, con * al final: "Pepe/Ana/Lucía*"
//   telefono  Opcional. Para el botón de WhatsApp (con o sin +34)
//   codigo    Déjalo vacío: el script lo genera y lo escribe en el mismo CSV.
//
// Genera:
//   invitados.sql       → npx wrangler d1 execute boda --remote --file invitados.sql
//   invitaciones.csv    → grupo, código, enlace y enlace de WhatsApp con el mensaje escrito
//
// Se puede volver a ejecutar cuando añadas gente: los códigos ya asignados se
// mantienen y los grupos que ya existen solo se actualizan (no se duplican).

import { readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

const file = process.argv[2];
if (!file) {
  console.error('Uso: npm run invitados -- invitados.csv');
  process.exit(1);
}

const PUBLIC_URL = (process.env.PUBLIC_URL || readPublicUrl() || 'https://boda.tudominio.es').replace(/\/$/, '');
const SAFE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function readPublicUrl() {
  try {
    return readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').match(/"PUBLIC_URL"\s*:\s*"([^"]+)"/)?.[1];
  } catch {
    return null;
  }
}

// ── CSV ─────────────────────────────────────────────────────
const raw = readFileSync(file, 'utf8').replace(/^﻿/, '');
const delim = (raw.split('\n')[0].match(/;/g) || []).length >= (raw.split('\n')[0].match(/,/g) || []).length ? ';' : ',';

function parse(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const [header, ...rows] = parse(raw);
const col = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), i]));
for (const need of ['grupo', 'plazas']) {
  if (!(need in col)) {
    console.error(`Falta la columna "${need}" en la cabecera del CSV.`);
    process.exit(1);
  }
}
if (!('codigo' in col)) { col.codigo = header.length; header.push('codigo'); }

const get = (r, k) => (k in col ? String(r[col[k]] ?? '').trim() : '');
const used = new Set(rows.map((r) => get(r, 'codigo').toUpperCase()).filter(Boolean));

function newCode(label) {
  const base = label
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^(familia|fam\.?|los|las|el|la)\s+/i, '')
    .toUpperCase().replace(/[^A-Z]/g, '')
    .slice(0, 4) || 'BODA';
  let code;
  do {
    code = base + Array.from({ length: 3 }, () => SAFE[randomInt(SAFE.length)]).join('');
  } while (used.has(code));
  used.add(code);
  return code;
}

// ── SQL ─────────────────────────────────────────────────────
const s = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const sql = ['-- Generado por scripts/import-guests.mjs'];
const links = [['grupo', 'codigo', 'enlace', 'whatsapp']];
let groups = 0, people = 0;

for (const r of rows) {
  const label = get(r, 'grupo');
  if (!label) continue;
  const seats = Math.max(1, parseInt(get(r, 'plazas'), 10) || 1);
  const names = get(r, 'nombres').split('/').map((n) => n.trim()).filter(Boolean)
    .map((n) => ({ name: n.replace(/\*$/, '').trim(), child: n.endsWith('*') }));
  const children = names.some((n) => n.child) || /^s[ií]/i.test(get(r, 'ninos'));
  const phone = get(r, 'telefono').replace(/[^\d+]/g, '');
  let code = get(r, 'codigo').toUpperCase();
  if (!code) { code = newCode(label); r[col.codigo] = code; }

  sql.push(
    `INSERT INTO groups (code, label, max_seats, children_allowed, phone) VALUES (${s(code)}, ${s(label)}, ${seats}, ${children ? 1 : 0}, ${s(phone)})
  ON CONFLICT(code) DO UPDATE SET label = excluded.label, max_seats = excluded.max_seats, children_allowed = excluded.children_allowed, phone = COALESCE(groups.phone, excluded.phone);`
  );
  if (names.length) {
    // Solo se cargan los nombres previstos si el grupo todavía no tiene personas
    sql.push(
      `INSERT INTO guests (group_id, name, is_child) SELECT g.id, v.column1, v.column2 FROM groups g, (VALUES ${names
        .slice(0, seats)
        .map((n) => `(${s(n.name)}, ${n.child ? 1 : 0})`)
        .join(', ')}) v
  WHERE g.code = ${s(code)} AND NOT EXISTS (SELECT 1 FROM guests WHERE group_id = g.id);`
    );
  }

  const url = `${PUBLIC_URL}/?r=${code}`;
  const text = `¡Hola! Nos casamos y nos encantaría que vinierais. Aquí tenéis toda la información y el formulario para confirmar: ${url}`;
  const waPhone = phone ? (phone.startsWith('+') ? phone.slice(1) : phone.length === 9 ? '34' + phone : phone) : '';
  links.push([label, code, url, `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`]);
  groups++;
  people += seats;
}

const toCsv = (rs) => rs.map((r) => r.map((c) => (/[";,\n]/.test(String(c ?? '')) ? `"${String(c).replace(/"/g, '""')}"` : c ?? '')).join(delim)).join('\n') + '\n';

writeFileSync('invitados.sql', sql.join('\n') + '\n');
writeFileSync('invitaciones.csv', '﻿' + toCsv(links));
writeFileSync(file, '﻿' + toCsv([header, ...rows])); // guarda los códigos nuevos

console.log(`${groups} grupos, ${people} plazas.`);
console.log('→ invitados.sql     npx wrangler d1 execute boda --remote --file invitados.sql');
console.log('→ invitaciones.csv  enlaces y WhatsApp de cada grupo');
