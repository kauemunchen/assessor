import { db } from '../db/index.js';
export function lerMemoria(contaId, modulo) {
  return db.prepare(`SELECT fato FROM memoria WHERE conta_id=? AND (modulo=? OR modulo='todos') ORDER BY criado_em DESC LIMIT 50`).all(contaId, modulo).map(r => r.fato);
}
export function gravarFato(contaId, modulo, fato) {
  db.prepare('INSERT INTO memoria (conta_id, modulo, fato) VALUES (?,?,?)').run(contaId, modulo, fato);
}
export async function registrarInteracao(contaId, modulo, msg, resposta) {
  db.prepare('INSERT INTO interacoes (conta_id, modulo, entrada, saida) VALUES (?,?,?,?)').run(contaId, modulo, msg.texto, typeof resposta === 'string' ? resposta : resposta.texto);
}
