import fs from 'node:fs';
import { db } from './index.js';
import { prepararCreditos } from '../creditos/index.js';
export function migrar() {
  db.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const add = (t, c, def) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${def}`); } catch {} };
  add('posts', 'tema', 'TEXT'); add('posts', 'publicado_em', 'TEXT'); add('posts', 'gcal_event_id', 'TEXT');
  add('contas', 'drive_pasta_id', 'TEXT'); add('contas', 'empresas', 'TEXT');
  add('instagram_auth', 'expira_em', 'TEXT'); add('biblioteca', 'marcada_url', 'TEXT'); add('biblioteca', 'protegida', 'INTEGER DEFAULT 0'); add('biblioteca', 'descricao', 'TEXT'); add('biblioteca', 'usado_em', 'TEXT'); add('biblioteca', 'origem', 'TEXT'); add('biblioteca', 'largura', 'INTEGER'); add('biblioteca', 'altura', 'INTEGER'); add('biblioteca', 'duracao', 'REAL'); add('tarefas', 'usuario_id', 'INTEGER'); add('tarefas', 'descricao', 'TEXT'); add('tarefas', 'concluida_em', 'TEXT');
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ix_contas_email ON contas(email) WHERE email IS NOT NULL") } catch {}
  try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS ix_contas_doc ON contas(cpf_cnpj) WHERE cpf_cnpj IS NOT NULL") } catch {}
  add('usuarios', 'email', 'TEXT');
  add('usuarios', 'senha_hash', 'TEXT');
  add('usuarios', 'ultimo_login', 'TEXT');
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ix_usuarios_email ON usuarios(email) WHERE email IS NOT NULL') } catch {}
  prepararCreditos();
  try { import('../custos.js').then(c => c.prepararCustos()) } catch {}
}
if (process.argv[1]?.endsWith('migrate.js')) { migrar(); console.log('migrado'); }
