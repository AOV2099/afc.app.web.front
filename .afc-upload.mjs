// Carga de horas a prod (temporal). Uso: ROOT=... MANIFEST=... node .afc-upload.mjs commit
import fs from 'node:fs';
import path from 'node:path';
import { request } from '@playwright/test';

if (process.argv[2] !== 'commit') throw new Error('Modo: commit');
const ROOT = process.env.ROOT;
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[${new Date().toLocaleTimeString('es-MX')}] ${msg}`);
const bitacora = path.join(ROOT, 'BITACORA_carga_prod.csv');
const done = new Set(fs.existsSync(bitacora) ? fs.readFileSync(bitacora, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split(',')[1]) : []);
if (!fs.existsSync(bitacora)) fs.writeFileSync(bitacora, '\uFEFFfecha,archivo,categoria,filas,ajustes_creados,alumnos,horas_acreditadas,filas_topadas_por_meta\n');

const api = await request.newContext({ baseURL: 'https://afc.ecosistemadigital.aragon.unam.mx' });
const login = await api.post('/api/login', { data: { email: 'admin@afc.com', password: 'AdminAfc' } });
if (!login.ok()) throw new Error(`login ${login.status()}`);
async function post(url, options) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await api.post(url, options);
    if (res.status() !== 429) return { status: res.status(), body: await res.json().catch(() => ({})) };
    log('límite de peticiones; espero 60 s'); await sleep(60_000);
  }
  throw new Error('429 persistente');
}

let index = 0;
for (const item of manifest) {
  index += 1;
  if (done.has(item.path)) { log(`${index}/${manifest.length} ya cargado, omito ${item.path}`); continue; }
  const pv = await post(`/api/admin/users/hours/import/preview?category=${item.category}`, { headers: { 'content-type': 'text/csv' }, data: fs.readFileSync(path.join(ROOT, item.path), 'utf8') });
  if (pv.status !== 200 || !pv.body?.ok || pv.body?.summary?.rows !== item.rows) { log(`ALTO: vista previa inválida en ${item.path} (${pv.status} ${pv.body?.message || ''}). No se cargó.`); process.exit(2); }
  const cm = await post(`/api/admin/users/hours/import/${encodeURIComponent(pv.body.import_id)}/commit`, {});
  if (cm.status !== 200 || !cm.body?.ok) { log(`ALTO: falló la carga de ${item.path} → ${cm.status} ${cm.body?.message || ''}`); process.exit(3); }
  fs.appendFileSync(bitacora, [new Date().toISOString(), item.path, item.category, item.rows, cm.body.adjusted ?? '', cm.body.users ?? '', cm.body.total_hours ?? '', cm.body.capped_rows ?? ''].join(',') + '\n');
  log(`${index}/${manifest.length} CARGADO ${item.path} (${cm.body.adjusted} ajustes, ${cm.body.total_hours} h, ${cm.body.capped_rows} topadas)`);
  await sleep(6_500);
}
log('Terminado.');
