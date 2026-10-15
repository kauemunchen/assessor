// Hub: Telegram + Web como um canal só. Tudo que entra por um lado aparece no outro; respostas vão para os dois.
import { TelegramCanal } from './telegram.js';
import { WebCanal } from './web.js';
import { db } from '../db/index.js';

export class HubCanal {
  constructor(app, servidor) {
    this.tg = new TelegramCanal(app); this.web = new WebCanal(app, servidor);
  }
  aoReceber(fn) {
    const contaDe = (chatId) => db.prepare('SELECT conta_id FROM usuarios WHERE chat_id=?').get(chatId)?.conta_id;
    this.tg.aoReceber(async (msg) => {
      const contaId = contaDe(msg.chatId);
      if (contaId && !msg.botao) this.web.registrar(contaId, { direcao: 'entrada', canal: 'telegram', tipo: msg.tipo, texto: msg.texto || (msg.tipo !== 'texto' ? `[${msg.tipo}]` : ''), midia: msg.midia ? { mime: msg.midia.mime, nome: msg.midia.nome, ref: msg.midia.ref } : null });
      if (contaId && msg.botao) this.web.registrar(contaId, { direcao: 'entrada', canal: 'telegram', tipo: 'texto', texto: msg.texto });
      return fn(msg);
    });
    this.web.aoReceber(async (msg) => {
      const contaId = contaDe(msg.chatId);
      if (contaId) {
        this.web.registrar(contaId, { direcao: 'entrada', canal: 'web', tipo: msg.tipo, texto: msg.texto || (msg.tipo !== 'texto' ? `[${msg.tipo}]` : ''), midia: msg.midia });
        // espelha no Telegram o que foi dito pela web
        const eco = msg.texto ? `💻 ${msg.texto}` : `💻 [${msg.tipo} enviado pela web]`;
        this.tg.enviar(null, msg.chatId, eco).catch(() => {});
      }
      return fn(msg);
    });
  }
  async enviar(conta, chatId, resposta) {
    const contaId = db.prepare('SELECT conta_id FROM usuarios WHERE chat_id=?').get(String(chatId))?.conta_id;
    const r = typeof resposta === 'string' ? { texto: resposta } : resposta;
    const modulo = r.modulo || db.prepare('SELECT modulo FROM interacoes WHERE conta_id=? ORDER BY id DESC LIMIT 1').get(contaId || 0)?.modulo || null;
    if (contaId) this.web.registrar(contaId, { direcao: 'saida', canal: 'bot', modulo, tipo: r.video ? 'video' : r.foto ? 'imagem' : r.fotos ? 'fotos' : 'texto', texto: r.texto || '', midia: r.video ? { url: r.video, mime: 'video/mp4' } : r.foto ? { url: r.foto } : r.fotos ? { urls: r.fotos } : null, botoes: r.botoes || null });
    return this.tg.enviar(conta, chatId, resposta);
  }
  async digitando(chatId) { this.tg.digitando(chatId); const c = db.prepare('SELECT conta_id FROM usuarios WHERE chat_id=?').get(String(chatId))?.conta_id; if (c) this.web.digitando(c); }
  async baixarMidia(ref) { return String(ref).startsWith('web:') ? this.web.baixarMidia(ref) : this.tg.baixarMidia(ref); }
}
