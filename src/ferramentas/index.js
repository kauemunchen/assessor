import * as secretaria from './secretaria.js';
import * as producao from './producao.js';
import * as documentos from './documentos.js';
import * as financeiro from './financeiro.js';
import * as social from './social.js';
const MAPA = { secretaria, producao, documentos, financeiro, social };
const CONSULTAR = { name: 'consultar_assessor', description: 'ÚLTIMO RECURSO: pede algo a outro assessor e recebe a resposta em texto. Só use quando o pedido é claramente do domínio de OUTRO módulo (um dado que está num documento arquivado; um lançamento financeiro; um post). NUNCA use para o que suas próprias ferramentas fazem (agenda, e-mail, tarefas são da Secretária; arquivos são de Documentos). Uma chamada por pedido. modulo: secretaria|documentos|financeiro|producao|social.', parameters: { type: 'OBJECT', properties: { modulo: { type: 'STRING' }, pedido: { type: 'STRING', description: 'o pedido completo, com todos os detalhes que o dono deu' } }, required: ['modulo', 'pedido'] } };

// Ligar um assessor que está desligado: o próprio dono liga (com um toque em "Sim"), sem precisar do suporte.
const NOMES_ASSESSOR = { secretaria: 'Olga (Secretária: agenda, e-mails, planilhas)', social: 'MIA (conteúdo, posts, stories, artigos)', documentos: 'Estag (documentos e vencimentos)', financeiro: 'Tina (financeiro)' };
const LIGAR = { name: 'ligar_assessor', description: 'Liga um assessor que está DESLIGADO na conta quando o pedido do dono é do domínio dele (ex.: pediu conteúdo/artigo/post e a MIA está desligada). O sistema mostra o botão de confirmação; não mande procurar o suporte para isso.', parameters: { type: 'OBJECT', properties: { modulo: { type: 'STRING', enum: Object.keys(NOMES_ASSESSOR) }, pedido_original: { type: 'STRING', description: 'o que o dono pediu, para retomar depois de ligar' } }, required: ['modulo'] } };
const EQUIPE = {
  ferramentas: () => [LIGAR], requerConfirmacao: new Set(['ligar_assessor']),
  async executar(nome, a, conta) {
    if (!NOMES_ASSESSOR[a.modulo]) throw new Error('assessor inválido');
    const { db } = await import('../db/index.js');
    db.prepare('INSERT INTO modulos (conta_id, modulo, ligado) VALUES (?,?,1) ON CONFLICT(conta_id, modulo) DO UPDATE SET ligado=1').run(conta.id, a.modulo);
    const extra = { social: 'Para publicar no Instagram ela vai pedir para conectar a conta; textos e artigos já funcionam.', documentos: 'Para arquivar no Drive é preciso conectar o Google (diga "conectar google").', financeiro: 'Na primeira vez a Tina pergunta as carteiras (empresas e pessoal).' }[a.modulo] || '';
    return { ok: true, ligado: NOMES_ASSESSOR[a.modulo], observacao: extra, proximo_passo: a.pedido_original ? `Diga que já ligou e pergunte se pode fazer agora: "${a.pedido_original}" (o dono só precisa responder "pode").` : 'Diga que já ligou e o que o dono pode pedir.' };
  },
};

/** Diretor usa as ferramentas de todos os módulos ativos; os demais usam as suas + consultar_assessor. */
export function ferramentasDe(modulo, conta, ativos = []) {
  const desligados = Object.keys(NOMES_ASSESSOR).filter(m => !ativos.includes(m)); const ligar = desligados.length ? [LIGAR] : [];
  if (modulo === 'diretor') return [...ativos.filter(m => MAPA[m]).flatMap(m => MAPA[m].ferramentas(conta)), ...ligar];
  const proprias = MAPA[modulo]?.ferramentas(conta) || [];
  return [...(ativos.filter(m => m !== modulo && MAPA[m]).length ? [...proprias, CONSULTAR] : proprias), ...ligar];
}
/** A que módulo pertence a ferramenta (para o Diretor e para confirmações). */
export function moduloDaFerramenta(nome, modulo) {
  if (nome === 'consultar_assessor') return modulo;
  if (nome === 'ligar_assessor') return 'equipe';
  if (MAPA[modulo]?.ferramentas({ id: 0 }).some(f => f.name === nome)) return modulo;
  return Object.keys(MAPA).find(m => MAPA[m].ferramentas({ id: 0 }).some(f => f.name === nome)) || modulo;
}
export function precisaConfirmar(modulo, nome) { const m = moduloDaFerramenta(nome, modulo); return (m === 'equipe' ? EQUIPE : MAPA[m])?.requerConfirmacao?.has(nome) || false; }
export function executarFerramenta(modulo, nome, args, conta, ctx) { const m = moduloDaFerramenta(nome, modulo); return (m === 'equipe' ? EQUIPE : MAPA[m]).executar(nome, args, conta, ctx); }
