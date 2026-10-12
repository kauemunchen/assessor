import fs from 'node:fs';
import { db } from './index.js';
export function migrar() {
  db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const add = (t, c, def) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); } catch {} };
  add('posts', 'tema', 'TEXT'); add('posts', 'publicado_em', 'TEXT');
}
if (process.argv[1]?.endsWith('migrate.js')) { migrar(); console.log('migrado'); }
