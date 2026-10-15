import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { criarCanal } from './canal/index.js';
import { tratarMensagem } from './orquestrador/roteador.js';
import { comBotoes } from './orquestrador/botoes.js';
import { rotasConfig } from './canal/api-config.js';
import { rotasMarca } from './canal/api-marca.js';
import { rotasDados } from './canal/api-dados.js';
import { iniciarRotinas } from './rotinas/scheduler.js';
import { migrar } from './db/migrate.js';
import { setCanal } from './canal/atual.js';

migrar();
const app = express();
app.use(express.json({ limit: '2mb' }));
const servidor = http.createServer(app);
// App web (estático) em /app
app.use('/app', express.static(path.resolve('src/painel'), { index: 'index.html', extensions: ['html'] }));
app.use('/admin', express.static(path.resolve('src/painel/admin'), { index: 'index.html', extensions: ['html'] }));
app.get('/', (_, res) => res.redirect('/app'));

const canal = criarCanal(process.env.CANAL || 'telegram', app, servidor);
setCanal(canal);
rotasConfig(app);
rotasMarca(app);
rotasDados(app);
import('./canal/api-admin.js').then(a => a.rotasAdmin(app)).catch(e => console.error('admin', e.message));
import('./integracoes/asaas.js').then(a => a.rotaWebhook(app)).catch(e => console.error('asaas', e.message));
app.use('/api', (err, req, res, _next) => { console.error('[api]', req.path, err.message); res.status(500).json({ erro: err.message }); });
canal.aoReceber(async (msg) => {
  const t0 = Date.now(); canal.digitando?.(msg.chatId); const tick = setInterval(() => canal.digitando?.(msg.chatId), 4500);
  try {
    const resposta = await tratarMensagem(msg, canal);
    clearInterval(tick); console.log(`[tempo] ${msg.chatId} ${Date.now() - t0}ms`);
    if (resposta) await canal.enviar(msg.conta, msg.chatId, comBotoes(resposta));
  } catch (e) {
    clearInterval(tick); console.error('[erro]', msg.chatId, e?.stack || e);
    await canal.enviar(msg.conta, msg.chatId, `⚠️ Deu erro aqui: ${String(e?.message || e).slice(0, 300)}`).catch(() => {});
  }
});

iniciarRotinas(canal);
app.get('/health', (_, res) => res.json({ ok: true }));
servidor.listen(process.env.PORT || 3000, () => console.log('assessor-km up'));

import { urlAutorizacao, salvarCodigo } from './integracoes/google-calendar.js';
app.get('/oauth/google/iniciar/:contaId', (req, res) => res.redirect(urlAutorizacao(req.params.contaId)));
app.get('/oauth/google/callback', async (req, res) => {
  const { state, code, error } = req.query;
  if (error || !code) { console.error('[oauth] google retornou erro:', error || 'sem code', req.query); return res.status(400).send(`Google não autorizou: ${error || 'sem código'}. Volte ao Telegram e peça "conectar google" de novo.`); }
  try { await salvarCodigo(state, code); res.send('Google conectado. Pode voltar ao Telegram.'); }
  catch (e) { console.error('[oauth] falha ao salvar token:', e?.message); res.status(500).send(`Erro ao conectar: ${e?.message}`); }
});
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e?.stack || e));
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e?.stack || e));
