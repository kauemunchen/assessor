import * as secretaria from './secretaria.js';
import * as producao from './producao.js';
import * as documentos from './documentos.js';
import * as financeiro from './financeiro.js';
import * as social from './social.js';
const MAPA = { secretaria, producao, documentos, financeiro, social };
const CONSULTAR = { name: 'consultar_assessor', description: 'Pede algo a outro assessor da equipe e recebe a resposta dele em texto. Use quando o pedido do dono depende de outro módulo (ex.: Secretária precisa de um dado que está nos Documentos; Documentos precisa marcar algo na agenda). modulo: secretaria|documentos|financeiro|producao|social.', parameters: { type: 'OBJECT', properties: { modulo: { type: 'STRING' }, pedido: { type: 'STRING', description: 'o pedido completo, com todos os detalhes que o dono deu' } }, required: ['modulo', 'pedido'] } };

/** Diretor usa as ferramentas de todos os módulos ativos; os demais usam as suas + consultar_assessor. */
export function ferramentasDe(modulo, conta, ativos = []) {
  if (modulo === 'diretor') return ativos.filter(m => MAPA[m]).flatMap(m => MAPA[m].ferramentas(conta));
  const proprias = MAPA[modulo]?.ferramentas(conta) || [];
  return ativos.filter(m => m !== modulo && MAPA[m]).length ? [...proprias, CONSULTAR] : proprias;
}
/** A que módulo pertence a ferramenta (para o Diretor e para confirmações). */
export function moduloDaFerramenta(nome, modulo) {
  if (nome === 'consultar_assessor') return modulo;
  if (MAPA[modulo]?.ferramentas({ id: 0 }).some(f => f.name === nome)) return modulo;
  return Object.keys(MAPA).find(m => MAPA[m].ferramentas({ id: 0 }).some(f => f.name === nome)) || modulo;
}
export function precisaConfirmar(modulo, nome) { const m = moduloDaFerramenta(nome, modulo); return MAPA[m]?.requerConfirmacao?.has(nome) || false; }
export function executarFerramenta(modulo, nome, args, conta, ctx) { const m = moduloDaFerramenta(nome, modulo); return MAPA[m].executar(nome, args, conta, ctx); }
