// Cada módulo exporta { declaracoes, executar(nome, args, conta) }. Regras duras vivem aqui, não no prompt.
import * as secretaria from './secretaria.js';
import * as producao from './producao.js';
import * as documentos from './documentos.js';
import * as financeiro from './financeiro.js';
import * as social from './social.js';
const MAPA = { secretaria, producao, documentos, financeiro, social };
export function ferramentasDe(modulo, conta) { return MAPA[modulo] ? MAPA[modulo].ferramentas(conta) : []; }
