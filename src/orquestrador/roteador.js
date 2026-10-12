import { montarPrompt } from './montador-prompt.js';
import { transcrever, classificar, responder } from './ia.js';
import { obterConta, modulosAtivos } from '../db/contas.js';
import { executarFerramenta } from '../ferramentas/index.js';
import * as memoria from './memoria.js';
import { db } from '../db/index.js';
import { onboarding } from './onboarding.js';

export async function tratarMensagem(msg, canal) {
  const conta = await obterConta(msg.chatId);
  if (!conta) return onboarding(msg);

  if (msg.tipo === 'audio') msg.texto = await transcrever(await canal.baixarMidia(msg.midia.ref), msg.midia.mime);

  // confirmação de ação pendente
  const pend = db.prepare('SELECT * FROM pendencias WHERE chat_id=? ORDER BY id DESC LIMIT 1').get(msg.chatId);
  if (pend && /^(sim|ok|confirmo|pode|vai)\b/i.test(msg.texto.trim())) {
    db.prepare('DELETE FROM pendencias WHERE id=?').run(pend.id);
    try { const r = await executarFerramenta(pend.modulo, pend.ferramenta, JSON.parse(pend.args), conta, { chatId: msg.chatId }); return `✅ Feito. ${JSON.stringify(r)}`; }
    catch (e) { return `❌ Não consegui: ${e.message}`; }
  }
  if (pend && /^(n[aã]o|cancela|deixa)\b/i.test(msg.texto.trim())) { db.prepare('DELETE FROM pendencias WHERE id=?').run(pend.id); return 'Cancelado.'; }

  const ativos = modulosAtivos(conta.id);
  const modulo = await classificar(msg.texto, ativos);
  const prompt = montarPrompt({ modulo, conta, ativos });
  const resposta = await responder({ prompt, conta, modulo, msg });
  await memoria.registrarInteracao(conta.id, modulo, msg, resposta);
  return resposta;
}
