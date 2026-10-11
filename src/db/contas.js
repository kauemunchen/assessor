import { db } from './index.js';
const NOMES = { diretor: 'Diretor', secretaria: 'Secretária', producao: 'Produção', documentos: 'Documentos', financeiro: 'Financeiro', social: 'Social' };
export async function obterConta(chatId) {
  return db.prepare('SELECT c.* FROM contas c JOIN usuarios u ON u.conta_id=c.id WHERE u.chat_id=?').get(chatId) || null;
}
export function modulosAtivos(contaId) {
  const ligados = db.prepare('SELECT modulo FROM modulos WHERE conta_id=? AND ligado=1').all(contaId).map(r => r.modulo);
  return ['diretor', ...ligados.filter(m => m !== 'diretor')];
}
export function configPersona(contaId, modulo) {
  const row = db.prepare('SELECT * FROM persona_config WHERE conta_id=? AND modulo=?').get(contaId, modulo);
  return row || { nome: NOMES[modulo], tratamento: 'primeiro nome', tom: 'direto', tamanho: 'curta', autonomia: 'confirma ação externa', perfil_analise: 'equilibrado', hora_resumo: '7h', hora_fechamento: '20h', hora_semana: '17h', hora_retornos: '18h', hora_checagem: '12h', padrao_tarde: '14h' };
}
