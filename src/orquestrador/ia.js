// Camada de IA: classificação e resposta com function-calling + confirmação de ações externas.
import { modelo } from '../integracoes/gemini.js';
import { ferramentasDe, executarFerramenta, precisaConfirmar } from '../ferramentas/index.js';
import { db } from '../db/index.js';
import { historicoRecente } from './memoria.js';
export { transcrever } from '../integracoes/gemini.js';

const PISTAS = {
  secretaria: /\b(agenda|agendar|marca|marcar|reuni[ãa]o|compromisso|lembra|lembrete|e-?mail|meet|hor[áa]rio|amanh[ãa]|semana|retorno|responder)\b/i,
  producao: /\b(op|ops|produ[çc][ãa]o|efici[êe]ncia|c[ée]lula|embarque|lan[çc]amento|costureira|agilfac)\b/i,
  documentos: /\b(contrato|documento|arquivo|cadastro|alvar[áa]|certid[ãa]o|ap[óo]lice|guarda|pasta)\b/i,
  financeiro: /\b(paguei|pagar|recebi|receber|boleto|dre|caixa|extrato|conta|saldo|cobran[çc]a|nota fiscal|nfs|carteira|gasto|despesa|receita)\b/i,
  social: /\b(post|carrossel|legenda|hashtag|story|stories|reels?|instagram|publica|conte[úu]do|arte|marca d.?[áa]gua|identidade)\b/i,
};
export async function classificar(texto, ativos) {
  if (ativos.length === 1) return 'diretor';
  const hits = ativos.filter(m => PISTAS[m]?.test(texto));
  if (hits.length === 1) return hits[0];
  if (hits.length === 0 && /\b(o que voc[êe] faria|conselho|estrat[ée]gia|prioridade|an[áa]lise|ideia|processo)\b/i.test(texto)) return 'diretor';
  const r = await modelo({}, { rapido: true }).generateContent(`Classifique a mensagem em UM destes módulos: ${ativos.join(', ')}. Regras: agenda/reunião/lembrete/e-mail → secretaria; OP/produção/eficiência → producao; arquivo/contrato/cadastro → documentos; dinheiro/conta/pagamento/DRE → financeiro; post/instagram/conteúdo/carrossel/legenda/identidade da marca/story → social; pedido de opinião, conselho, estratégia, prioridade, "o que você faria", análise geral → diretor; o resto → diretor. Responda só o nome.\nMensagem: ${texto}`);
  const m = r.response.text().trim().toLowerCase();
  return ativos.includes(m) ? m : 'diretor';
}

const agoraBR = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });

export async function responder({ prompt, conta, modulo, msg }) {
  const decls = ferramentasDe(modulo, conta);
  const m = modelo({ systemInstruction: `${prompt}\n\nAGORA: ${agoraBR()} (America/Sao_Paulo). Datas relativas ("amanhã", "quinta") são calculadas a partir daqui e passadas às ferramentas no formato YYYY-MM-DDTHH:MM.

VERDADE: só prometa o que suas ferramentas fazem. Se não houver ferramenta para algo, diga "ainda não consigo fazer X" em uma linha. Nunca invente painéis, links, integrações ou etapas externas.

CONTEXTO: as mensagens anteriores desta conversa estão no histórico (respostas de outros assessores vêm marcadas com [módulo]). Use-as: se o dono responder "aprovar", "agenda", "ajusta", "sim", refere-se ao que foi proposto por último.

FORMATO (canal de mensagem, não é documento): sem títulos com #, sem tabelas, sem linhas ---. Negrito só com *uma palavra*. Listas com "-" e no máximo 5 itens. Resposta "curta" = até 6 linhas; "média" = até 12; "completa" = até 25. Vá direto ao ponto, sem introdução nem fechamento.`,
    tools: decls.length ? [{ functionDeclarations: decls }] : undefined });
  const corta = (t, n = 1800) => (t || '').length > n ? (t || '').slice(0, n) + ' […]' : (t || '');
  const contents = [];
  for (const h of historicoRecente(conta.id, 8)) {
    if (!h.entrada || !h.saida) continue;
    contents.push({ role: 'user', parts: [{ text: corta(h.entrada) }] });
    contents.push({ role: 'model', parts: [{ text: `[${h.modulo}] ` + corta(h.saida) }] });
  }
  contents.push({ role: 'user', parts: [{ text: msg.texto }] });
  let ultimoErro = null, assinaturaAnterior = '';
  for (let i = 0; i < 5; i++) {
    const r = await m.generateContent({ contents });
    const cand = r.response.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);
    if (!calls.length) return r.response.text();
    contents.push({ role: 'model', parts });
    const assinatura = JSON.stringify(calls);
    if (assinatura === assinaturaAnterior && ultimoErro) return `Não consegui: ${ultimoErro}`;
    assinaturaAnterior = assinatura;
    const respostas = [];
    for (const c of calls) {
      if (precisaConfirmar(modulo, c.name)) {
        db.prepare('INSERT INTO pendencias (conta_id, chat_id, modulo, ferramenta, args) VALUES (?,?,?,?,?)').run(conta.id, msg.chatId, modulo, c.name, JSON.stringify(c.args));
        return `Vou executar ${c.name} com ${JSON.stringify(c.args)}. Confirma? (sim/não)`;
      }
      let result;
      try { result = { result: await executarFerramenta(modulo, c.name, c.args, conta, { chatId: msg.chatId }) }; }
      catch (e) { result = { erro: e.message }; ultimoErro = e.message; console.error(`[tool] ${modulo}.${c.name}`, e.message); }
      respostas.push({ functionResponse: { name: c.name, response: result } });
    }
    contents.push({ role: 'user', parts: respostas });
  }
  return ultimoErro ? `Não consegui: ${ultimoErro}` : 'Não consegui concluir. Tente de novo com mais detalhes.';
}
