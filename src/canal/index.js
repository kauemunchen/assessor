// Interface única de canal. Trocar Telegram por WhatsApp = trocar o adaptador.
// Cada adaptador implementa: aoReceber(fn), enviar(conta, chatId, texto|{texto, botoes, arquivo}), baixarMidia(ref)
import { TelegramCanal } from './telegram.js';
import { WhatsAppCanal } from './whatsapp.js';
import { HubCanal } from './hub.js';

export function criarCanal(nome, app, servidor) {
  if (nome === 'whatsapp') return new WhatsAppCanal(app);
  if (servidor) return new HubCanal(app, servidor); // Telegram + Web
  return new TelegramCanal(app);
}

/** Mensagem normalizada que o orquestrador recebe
 * { conta, chatId, remetente, tipo: 'texto'|'audio'|'imagem'|'arquivo', texto?, midia?: {ref, mime}, recebidoEm }
 */
