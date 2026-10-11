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
  const resposta = await tratarMensagem(msg);
  if (resposta) await canal.enviar(msg.conta, msg.chatId, resposta);
});

iniciarRotinas(canal);
app.get('/health', (_, res) => res.json({ ok: true }));
app.listen(process.env.PORT || 3000, () => console.log('assessor-km up'));
