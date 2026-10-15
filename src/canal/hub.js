// Hub: Telegram + Web (PWA) como um canal só. Toda entrada e toda resposta aparece dos DOIS lados,
// independentemente do canal de origem. A tabela `mensagens` é a fonte da verdade por conta_id (web/app),
// e o Telegram recebe espelho via tg.enviar() usando o chat_id REAL do Telegram da conta.
import { TelegramCanal } from './telegram.js';
import { WebCanal } from './web.js';
import { db } from '../db/index.js';

const contaDe = (chatId) => db.prepare('SELECT conta_id FROM usuarios WHERE chat_id=?').get(String(chatId))?.conta_id;
const tgChatIdDaConta = (contaId) => contaId ? db.prepare("SELECT chat_id FROM usuarios WHERE conta_id=? AND canal='telegram' ORDER BY id ASC LIMIT 1").get(contaId)?.chat_id : null;
const temTelegram = (contaId) => !!tgChatIdDaConta(contaId);

export class HubCanal {
  constructor(app, servidor) {
    this.tg = new TelegramCanal(app); this.web = new WebCanal(app, servidor);
  }
  aoReceber(fn) {
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
        // espelha no Telegram usando o chat_id REAL do Telegram da conta (não o 'web:<id>' sintético)
        const tgId = tgChatIdDaConta(contaId);
        if (tgId) {
          const eco = msg.texto ? `💻 ${msg.texto}` : `💻 [${msg.tipo} enviado pela web]`;
          this.tg.enviar(null, tgId, eco).catch((err) => console.error('[hub] eco→tg falhou:', err.message));
        }
      }
      return fn(msg);
    });
  }
  async enviar(conta, chatId, resposta) {
    const contaId = contaDe(chatId);
    const r = typeof resposta === 'string' ? { texto: resposta } : resposta;
    const modulo = r.modulo || db.prepare('SELECT modulo FROM interacoes WHERE conta_id=? ORDER BY id DESC LIMIT 1').get(contaId || 0)?.modulo || null;
    if (contaId) this.web.registrar(contaId, { direcao: 'saida', canal: 'bot', modulo, tipo: r.video ? 'video' : r.foto ? 'imagem' : r.fotos ? 'fotos' : 'texto', texto: r.texto || '', midia: r.video ? { url: r.video, mime: 'video/mp4' } : r.foto ? { url: r.foto } : r.fotos ? { urls: r.fotos } : null, botoes: r.botoes || null });
    // resolve o chat_id REAL do Telegram para enviar; se a conta não tem Telegram (web-only), não tenta
    const tgId = String(chatId).startsWith('web:') ? tgChatIdDaConta(contaId) : String(chatId);
    if (tgId) return this.tg.enviar(conta, tgId, resposta);
    return null;
  }
  async digitando(chatId) {
    const contaId = contaDe(chatId);
    const tgId = String(chatId).startsWith('web:') ? tgChatIdDaConta(contaId) : String(chatId);
    if (tgId) this.tg.digitando(tgId);
    if (contaId) this.web.digitando(contaId);
  }
  async baixarMidia(ref) { return String(ref).startsWith('web:') ? this.web.baixarMidia(ref) : this.tg.baixarMidia(ref); }
}
