import fs from 'node:fs';
import { db } from './index.js';
export function migrar() { db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')); }
if (process.argv[1]?.endsWith('migrate.js')) { migrar(); console.log('migrado'); }
