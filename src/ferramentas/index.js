import * as secretaria from './secretaria.js';
import * as producao from './producao.js';
import * as documentos from './documentos.js';
import * as financeiro from './financeiro.js';
import * as social from './social.js';
const MAPA = { secretaria, producao, documentos, financeiro, social };
export function ferramentasDe(modulo, conta) { return MAPA[modulo]?.ferramentas(conta) || []; }
export function precisaConfirmar(modulo, nome) { return MAPA[modulo]?.requerConfirmacao?.has(nome) || false; }
export function executarFerramenta(modulo, nome, args, conta, ctx) { return MAPA[modulo].executar(nome, args, conta, ctx); }
