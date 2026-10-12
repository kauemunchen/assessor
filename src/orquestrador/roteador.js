import { montarPrompt } from './montador-prompt.js';
import { transcrever, classificar, responder } from './ia.js';
import { obterConta, modulosAtivos } from '../db/contas.js';
import { executarFerramenta } from '../ferramentas/index.js';
import * as memoria from './memoria.js';
import { db } from '../db/index.js';
import { onboarding } from './onboarding.js';
import { governanca } from './governanca.js';

export async function tratarMensagem(msg, canal) {
  const conta = await obterConta(msg.chatId);
  if (!conta) return onboarding(msg);

  if (msg.tipo === 'audio') {
    await canal.enviar(msg.conta, msg.chatId, '🎧 Ouvindo…');
    const bytes = await canal.baixarMidia(msg.midia.ref);
    console.log(`[audio] ${msg.chatId} ${msg.midia.mime} ${bytes.byteLength} bytes`);
    msg.texto = await transcrever(bytes, msg.midia.mime);
    console.log(`[audio] transcrição: ${msg.texto.slice(0, 120)}`);
    if (!msg.texto) return 'Não consegui entender o áudio. Pode repetir ou escrever?';
    await canal.enviar(msg.conta, msg.chatId, `📝 "${msg.texto}"`);
  }
  if (msg.tipo === 'imagem' || msg.tipo === 'arquivo') {
    msg.texto = (msg.texto ? msg.texto + '\n' : '') + `[${msg.tipo} recebido: ${msg.midia?.mime || ''}; leitura de ${msg.tipo} entra na v2]`;
  }
  if (!msg.texto?.trim()) return 'Recebi uma mensagem vazia.';

  // confirmação de ação pendente
  const pend = db.prepare('SELECT * FROM pendencias WHERE chat_id=? ORDER BY id DESC LIMIT 1').get(msg.chatId);
  if (pend && /^(sim|ok|confirmo|pode|vai)\b/i.test(msg.texto.trim())) {
    db.prepare('DELETE FROM pendencias WHERE id=?').run(pend.id);
    try { const r = await executarFerramenta(pend.modulo, pend.ferramenta, JSON.parse(pend.args), conta, { chatId: msg.chatId }); return `✅ Feito. ${JSON.stringify(r)}`; }
    catch (e) { return `❌ Não consegui: ${e.message}`; }
  }
  if (pend && /^(n[aã]o|cancela|deixa)\b/i.test(msg.texto.trim())) { db.prepare('DELETE FROM pendencias WHERE id=?').run(pend.id); return 'Cancelado.'; }

  const gov = governanca(msg, conta); if (gov) return gov;

  const ativos = modulosAtivos(conta.id);
  const modulo = await classificar(msg.texto, ativos);
  console.log(`[msg] ${msg.chatId} → ${modulo}: ${msg.texto.slice(0, 80)}`);
  const prompt = montarPrompt({ modulo, conta, ativos });
  const resposta = await responder({ prompt, conta, modulo, msg });
  await memoria.registrarInteracao(conta.id, modulo, msg, resposta);
  return resposta;
}
