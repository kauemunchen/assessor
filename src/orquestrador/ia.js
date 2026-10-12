// Camada de IA: classificação e resposta com function-calling + confirmação de ações externas.
import { modelo } from '../integracoes/gemini.js';
import { ferramentasDe, executarFerramenta, precisaConfirmar } from '../ferramentas/index.js';
import { db } from '../db/index.js';
export { transcrever } from '../integracoes/gemini.js';

export async function classificar(texto, ativos) {
  if (ativos.length === 1) return 'diretor';
  const r = await modelo().generateContent(`Classifique a mensagem em UM destes módulos: ${ativos.join(', ')}. Regras: agenda/reunião/lembrete/e-mail → secretaria; OP/produção/eficiência → producao; arquivo/contrato/cadastro → documentos; dinheiro/conta/pagamento/DRE → financeiro; post/instagram/conteúdo → social; pedido de opinião, conselho, estratégia, prioridade, "o que você faria", análise geral → diretor; o resto → diretor. Responda só o nome.\nMensagem: ${texto}`);
  const m = r.response.text().trim().toLowerCase();
  return ativos.includes(m) ? m : 'diretor';
}

const agoraBR = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });

export async function responder({ prompt, conta, modulo, msg }) {
  const decls = ferramentasDe(modulo, conta);
  const m = modelo({ systemInstruction: `${prompt}\n\nAGORA: ${agoraBR()} (America/Sao_Paulo). Datas relativas ("amanhã", "quinta") são calculadas a partir daqui e passadas às ferramentas no formato YYYY-MM-DDTHH:MM.

FORMATO (canal de mensagem, não é documento): sem títulos com #, sem tabelas, sem linhas ---. Negrito só com *uma palavra*. Listas com "-" e no máximo 5 itens. Resposta "curta" = até 6 linhas; "média" = até 12; "completa" = até 25. Vá direto ao ponto, sem introdução nem fechamento.`,
    tools: decls.length ? [{ functionDeclarations: decls }] : undefined });
  const contents = [{ role: 'user', parts: [{ text: msg.texto }] }];
  for (let i = 0; i < 5; i++) {
    const r = await m.generateContent({ contents });
    const cand = r.response.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);
    if (!calls.length) return r.response.text();
    contents.push({ role: 'model', parts });
    const respostas = [];
    for (const c of calls) {
      if (precisaConfirmar(modulo, c.name)) {
        db.prepare('INSERT INTO pendencias (conta_id, chat_id, modulo, ferramenta, args) VALUES (?,?,?,?,?)').run(conta.id, msg.chatId, modulo, c.name, JSON.stringify(c.args));
        return `Vou executar ${c.name} com ${JSON.stringify(c.args)}. Confirma? (sim/não)`;
      }
      let result;
      try { result = { result: await executarFerramenta(modulo, c.name, c.args, conta, { chatId: msg.chatId }) }; }
      catch (e) { result = { erro: e.message }; }
      respostas.push({ functionResponse: { name: c.name, response: result } });
    }
    contents.push({ role: 'user', parts: respostas });
  }
  return 'Não consegui concluir. Tente de novo com mais detalhes.';
}
