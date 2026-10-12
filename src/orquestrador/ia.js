// Camada de IA: classificação e resposta com function-calling + confirmação de ações externas.
import { modelo } from '../integracoes/gemini.js';
import { ferramentasDe, executarFerramenta, precisaConfirmar } from '../ferramentas/index.js';
import { db } from '../db/index.js';
export { transcrever } from '../integracoes/gemini.js';

export async function classificar(texto, ativos) {
  if (ativos.length === 1) return 'diretor';
  const r = await modelo().generateContent(`Classifique a mensagem em UM destes módulos: ${ativos.join(', ')}. Regras: agenda/reunião/lembrete/e-mail → secretaria; OP/produção/eficiência → producao; arquivo/contrato/cadastro → documentos; dinheiro/conta/pagamento/DRE → financeiro; post/instagram/conteúdo → social; o resto → diretor. Responda só o nome.\nMensagem: ${texto}`);
  const m = r.response.text().trim().toLowerCase();
  return ativos.includes(m) ? m : 'diretor';
}

export async function responder({ prompt, conta, modulo, msg }) {
  const decls = ferramentasDe(modulo, conta);
  const m = modelo({ systemInstruction: prompt, tools: decls.length ? [{ functionDeclarations: decls }] : undefined });
  const chat = m.startChat();
  let r = await chat.sendMessage(msg.texto);
  for (let i = 0; i < 5; i++) {
    const calls = r.response.functionCalls?.() || [];
    if (!calls.length) break;
    const results = [];
    for (const c of calls) {
      if (precisaConfirmar(modulo, c.name)) {
        db.prepare('INSERT INTO pendencias (conta_id, chat_id, modulo, ferramenta, args) VALUES (?,?,?,?,?)').run(conta.id, msg.chatId, modulo, c.name, JSON.stringify(c.args));
        return { texto: `Vou executar **${c.name}** com ${JSON.stringify(c.args)}. Confirma? (sim/não)` };
      }
      try { results.push({ functionResponse: { name: c.name, response: { result: await executarFerramenta(modulo, c.name, c.args, conta, { chatId: msg.chatId }) } } }); }
      catch (e) { results.push({ functionResponse: { name: c.name, response: { erro: e.message } } }); }
    }
    r = await chat.sendMessage(results);
  }
  return r.response.text();
}
