#!/usr/bin/env node
// Teste automatizado: duas contas, dados cruzados, confirma que nenhuma vê o que é da outra.
// Uso: node scripts/testar-isolamento.js   (usa um banco temporário em /tmp; NÃO toca no banco de produção)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const banco = path.join(os.tmpdir(), `assessor-iso-${Date.now()}.db`);
process.env.DATABASE_URL = `sqlite:${banco}`; process.env.GEMINI_API_KEY ||= 'x'; process.env.TELEGRAM_BOT_TOKEN ||= '000:x';
const { migrar } = await import('../src/db/migrate.js'); migrar();
const { db } = await import('../src/db/index.js'); const cred = await import('../src/creditos/index.js');

const falhas = [];
const ok = (nome, cond, detalhe = '') => { console.log(`${cond ? '✓' : '✗'} ${nome}${detalhe ? ' — ' + detalhe : ''}`); if (!cond) falhas.push(nome); };
const criarConta = (nome, empresa, chat) => {
  const r = db.prepare('INSERT INTO contas (nome_dono, empresa) VALUES (?,?)').run(nome, empresa); const id = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO usuarios (conta_id, canal, chat_id, nome, papel) VALUES (?,?,?,?,?)').run(id, 'telegram', chat, nome, 'dono');
  db.prepare('INSERT INTO modulos (conta_id, modulo, ligado) VALUES (?,?,1)').run(id, 'secretaria');
  db.prepare('INSERT INTO modulos (conta_id, modulo, ligado) VALUES (?,?,1)').run(id, 'social');
  return id;
};
const A = criarConta('Alice', 'Alpha Ltda', '111'); const B = criarConta('Bob', 'Beta ME', '222');
cred.concederTrial(A); cred.concederTrial(B);

// Dados em A e em B — mesmas tabelas, nomes semelhantes para pegar vazamento
db.prepare('INSERT INTO posts (conta_id, formato, tema, legenda, status, data) VALUES (?,?,?,?,?,?)').run(A, 'post', 'Alpha', 'segredo A', 'rascunho', null);
db.prepare('INSERT INTO posts (conta_id, formato, tema, legenda, status, data) VALUES (?,?,?,?,?,?)').run(B, 'post', 'Beta', 'segredo B', 'rascunho', null);
db.prepare('INSERT INTO biblioteca (conta_id, url, tipo, descricao) VALUES (?,?,?,?)').run(A, 'https://a.com/1.jpg', 'imagem', 'foto A');
db.prepare('INSERT INTO biblioteca (conta_id, url, tipo, descricao) VALUES (?,?,?,?)').run(B, 'https://b.com/1.jpg', 'imagem', 'foto B');
db.prepare("INSERT INTO documentos (conta_id, titulo, empresa, tipo, status) VALUES (?,?,?,?, 'ativo')").run(A, 'Contrato A', 'Alpha', 'contrato');
db.prepare("INSERT INTO documentos (conta_id, titulo, empresa, tipo, status) VALUES (?,?,?,?, 'ativo')").run(B, 'Contrato B', 'Beta', 'contrato');
db.prepare('INSERT INTO cadastros (conta_id, nome, documento, campos_json) VALUES (?,?,?,?)').run(A, 'João A', '123', '{}');
db.prepare('INSERT INTO cadastros (conta_id, nome, documento, campos_json) VALUES (?,?,?,?)').run(B, 'João B', '456', '{}');
db.prepare('INSERT INTO memoria (conta_id, modulo, fato) VALUES (?,?,?)').run(A, 'social', 'nicho A');
db.prepare('INSERT INTO memoria (conta_id, modulo, fato) VALUES (?,?,?)').run(B, 'social', 'nicho B');
db.prepare('INSERT INTO pendencias (conta_id, chat_id, modulo, ferramenta, args) VALUES (?,?,?,?,?)').run(A, '111', 'secretaria', 'x', '{}');
db.prepare('INSERT INTO pendencias (conta_id, chat_id, modulo, ferramenta, args) VALUES (?,?,?,?,?)').run(B, '222', 'secretaria', 'y', '{}');

// 1) /api/me só traz a conta do chamador
const express = (await import('express')).default; const app = express(); app.use(express.json());
const criarCanal = (await import('../src/canal/index.js')).criarCanal; const http = (await import('node:http')).default; const srv = http.createServer(app);
const canal = criarCanal('telegram', app, srv); (await import('../src/canal/atual.js')).setCanal(canal);
const setupSessao = (contaId, chat) => { const tok = 'tok_' + chat; db.prepare('INSERT INTO web_sessoes (token, conta_id, chat_id) VALUES (?,?,?)').run(tok, contaId, chat); return tok; };
const tokA = setupSessao(A, '111'); const tokB = setupSessao(B, '222');
(await import('../src/canal/api-config.js')).rotasConfig(app); (await import('../src/canal/api-marca.js')).rotasMarca(app); (await import('../src/canal/api-dados.js')).rotasDados(app);
const porta = 3999; await new Promise(r => srv.listen(porta, r));
const api = async (tok, caminho, { metodo = 'GET', body, status = 200 } = {}) => { const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); ok(`HTTP ${metodo} ${caminho} com token ${tok.slice(-3)} → ${r.status}`, r.status === status); return j; };

const meA = await api(tokA, '/api/me'); ok('A vê a si mesma em /api/me', meA.conta.id === A, `id=${meA.conta.id}`);
const meB = await api(tokB, '/api/me'); ok('B vê a si mesma em /api/me', meB.conta.id === B, `id=${meB.conta.id}`);

const edA = await api(tokA, '/api/editorial'); ok('A só vê posts da A', edA.every(p => p.legenda === 'segredo A') && edA.length === 1);
const edB = await api(tokB, '/api/editorial'); ok('B só vê posts da B', edB.every(p => p.legenda === 'segredo B') && edB.length === 1);

const bA = await api(tokA, '/api/biblioteca'); ok('A só vê biblioteca da A', bA.every(x => x.descricao === 'foto A') && bA.length === 1);
const dB = await api(tokB, '/api/documentos'); ok('B só vê documentos da B', dB.docs.every(d => d.empresa === 'Beta') && dB.docs.length === 1);
const cA = await api(tokA, '/api/cadastros'); ok('A só vê cadastros da A', cA.every(x => x.documento === '123') && cA.length === 1);

// 2) Tentar modificar recurso da outra conta → 404
await api(tokA, '/api/editorial/' + db.prepare("SELECT id FROM posts WHERE conta_id=?").get(B).id, { metodo: 'POST', body: { legenda: 'invadido' }, status: 404 });
await api(tokA, '/api/biblioteca/' + db.prepare("SELECT id FROM biblioteca WHERE conta_id=?").get(B).id, { metodo: 'DELETE', status: 404 });

// 3) Verifica que a DB em si continua intacta (nada da B foi apagado nem alterado)
ok('post da B intocado', db.prepare("SELECT legenda FROM posts WHERE conta_id=?").get(B).legenda === 'segredo B');
ok('biblioteca da B intocada', db.prepare("SELECT COUNT(*) n FROM biblioteca WHERE conta_id=?").get(B).n === 1);

// 4) Créditos: debitar na A não altera saldo da B
const sA0 = cred.saldo(A), sB0 = cred.saldo(B); cred.debitar(A, 10, { motivo: 'teste' });
ok('débito em A não vaza para B', cred.saldo(A) === sA0 - 10 && cred.saldo(B) === sB0);

// 5) /api/creditos devolve apenas movimentos da conta
const crA = await api(tokA, '/api/creditos'); const crB = await api(tokB, '/api/creditos');
ok('histórico de créditos de A não cita B', !JSON.stringify(crA).includes('nicho B') && !JSON.stringify(crA).includes('Beta'));
ok('histórico de créditos de B não cita A', !JSON.stringify(crB).includes('nicho A') && !JSON.stringify(crB).includes('Alpha'));

// 6) Sem token nenhum endpoint responde
const semTok = await fetch(`http://127.0.0.1:${porta}/api/me`).then(r => r.status); ok('/api/me sem token → 401', semTok === 401);
const tokFake = await fetch(`http://127.0.0.1:${porta}/api/me`, { headers: { authorization: 'Bearer naoexiste' } }).then(r => r.status); ok('/api/me com token inválido → 401', tokFake === 401);

srv.close(); fs.unlinkSync(banco); try { fs.unlinkSync(banco + '-wal'); fs.unlinkSync(banco + '-shm'); } catch {}
console.log(`\n${falhas.length ? '❌ ' + falhas.length + ' falha(s)' : '✅ Isolamento OK'}`); process.exit(falhas.length ? 1 : 0);
