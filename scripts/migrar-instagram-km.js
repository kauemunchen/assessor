// Importa identidade, histórico e biblioteca do bot Instagram KM (dados.db) para a conta do dono no assessor.
// Uso (no VPS, dentro do container ou com node local): node scripts/migrar-instagram-km.js /root/bot/telegram-instagram-bot/dados.db <conta_id>
import Database from 'better-sqlite3';
import { db } from '../src/db/index.js';
import { migrar } from '../src/db/migrate.js';
const [origem, contaIdArg] = process.argv.slice(2);
if (!origem) { console.error('uso: node scripts/migrar-instagram-km.js <dados.db> [conta_id=1]'); process.exit(1); }
const contaId = Number(contaIdArg || 1);
migrar();
const o = new Database(origem, { readonly: true });
let n = 0;
for (const r of o.prepare('SELECT dados FROM identidade').all()) {
  const d = JSON.parse(r.dados);
  const novo = { perfil: d.nome, nicho: d.nicho, categoria: d.categoria, publico: d.publico, tom: d.tom, descricao: d.descricao };
  db.prepare('INSERT INTO social_identidade (conta_id, dados) VALUES (?,?) ON CONFLICT(conta_id) DO UPDATE SET dados=excluded.dados').run(contaId, JSON.stringify(novo)); n++;
}
console.log(`identidade: ${n}`); n = 0;
for (const h of o.prepare('SELECT dt, tema, legenda, hashtags, tipo FROM historico_posts ORDER BY id').all()) {
  db.prepare("INSERT INTO posts (conta_id, formato, tema, data, legenda, hashtags, status, publicado_em) VALUES (?,?,?,?,?,?,'publicado',?)").run(contaId, h.tipo || 'post', h.tema, h.dt, h.legenda, h.hashtags, h.dt); n++;
}
console.log(`histórico de posts: ${n}`); n = 0;
for (const b of o.prepare('SELECT nome, url, tipo, data FROM biblioteca').all()) {
  db.prepare('INSERT INTO biblioteca (conta_id, url, tipo, nome, criado_em) VALUES (?,?,?,?,?)').run(contaId, b.url, b.tipo, b.nome, b.data); n++;
}
console.log(`biblioteca: ${n}`);
const ag = o.prepare("SELECT id, conteudo, dt, status FROM agendamentos WHERE status NOT IN ('publicado','done')").all();
console.log(`agendamentos pendentes no bot antigo (revisar manualmente): ${ag.length}`);
