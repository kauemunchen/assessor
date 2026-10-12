import 'dotenv/config';
import express from 'express';
import { criarCanal } from './canal/index.js';
import { tratarMensagem } from './orquestrador/roteador.js';
import { iniciarRotinas } from './rotinas/scheduler.js';
import { migrar } from './db/migrate.js';

migrar();
const app = express();
app.use(express.json());

const canal = criarCanal(process.env.CANAL || 'telegram', app);
canal.aoReceber(async (msg) => {
  try {
    const resposta = await tratarMensagem(msg, canal);
    if (resposta) await canal.enviar(msg.conta, msg.chatId, resposta);
  } catch (e) {
    console.error('[erro]', msg.chatId, e?.stack || e);
    await canal.enviar(msg.conta, msg.chatId, `⚠️ Deu erro aqui: ${String(e?.message || e).slice(0, 300)}`).catch(() => {});
  }
});

iniciarRotinas(canal);
app.get('/health', (_, res) => res.json({ ok: true }));
app.listen(process.env.PORT || 3000, () => console.log('assessor-km up'));

import { urlAutorizacao, salvarCodigo } from './integracoes/google-calendar.js';
app.get('/oauth/google/iniciar/:contaId', (req, res) => res.redirect(urlAutorizacao(req.params.contaId)));
app.get('/oauth/google/callback', async (req, res) => { await salvarCodigo(req.query.state, req.query.code); res.send('Google conectado. Pode voltar ao Telegram.'); });
