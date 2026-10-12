import * as gcal from '../integracoes/google-calendar.js';
import { db } from '../db/index.js';

// Declarações no formato function-calling do Gemini
export function ferramentas(_conta) {
  return [
    { name: 'criar_evento', description: 'Cria compromisso no Google Agenda do dono', parameters: { type: 'OBJECT', properties: { titulo: { type: 'STRING' }, inicio: { type: 'STRING', description: 'YYYY-MM-DDTHH:MM' }, fim: { type: 'STRING' }, local: { type: 'STRING' }, convidados: { type: 'ARRAY', items: { type: 'STRING' } }, meet: { type: 'BOOLEAN' }, lembrete_min: { type: 'NUMBER' } }, required: ['titulo', 'inicio'] } },
    { name: 'listar_agenda', description: 'Lista compromissos de um período', parameters: { type: 'OBJECT', properties: { inicio: { type: 'STRING' }, fim: { type: 'STRING' } } } },
    { name: 'mover_evento', description: 'Altera data/hora/título/local de um evento', parameters: { type: 'OBJECT', properties: { event_id: { type: 'STRING' }, inicio: { type: 'STRING' }, fim: { type: 'STRING' }, titulo: { type: 'STRING' }, local: { type: 'STRING' } }, required: ['event_id'] } },
    { name: 'cancelar_evento', description: 'Cancela um evento (requer confirmação)', parameters: { type: 'OBJECT', properties: { event_id: { type: 'STRING' } }, required: ['event_id'] } },
    { name: 'criar_lembrete', description: 'Cria lembrete pontual ou recorrente', parameters: { type: 'OBJECT', properties: { texto: { type: 'STRING' }, quando: { type: 'STRING', description: 'YYYY-MM-DDTHH:MM' }, recorrencia: { type: 'STRING', description: 'diario|semanal|mensal|null' } }, required: ['texto', 'quando'] } },
    { name: 'registrar_retorno', description: 'Registra quem deve resposta a quem', parameters: { type: 'OBJECT', properties: { pessoa: { type: 'STRING' }, assunto: { type: 'STRING' }, direcao: { type: 'STRING', description: 'devo_responder|aguardo_resposta' } }, required: ['pessoa', 'assunto', 'direcao'] } },
  ];
}
export const requerConfirmacao = new Set(['cancelar_evento', 'enviar_mensagem_terceiro']);

export async function executar(nome, a, conta, ctx) {
  switch (nome) {
    case 'criar_evento': return gcal.criarEvento(conta.id, { titulo: a.titulo, inicio: a.inicio, fim: a.fim, local: a.local, convidados: a.convidados || [], meet: !!a.meet, lembreteMin: a.lembrete_min ?? 30 });
    case 'listar_agenda': return (await gcal.listarEventos(conta.id, { inicio: a.inicio, fim: a.fim })).map(e => ({ id: e.id, titulo: e.summary, inicio: e.start?.dateTime || e.start?.date, local: e.location, meet: e.hangoutLink }));
    case 'mover_evento': return { id: await gcal.atualizarEvento(conta.id, a.event_id, a) };
    case 'cancelar_evento': await gcal.cancelarEvento(conta.id, a.event_id); return { ok: true };
    case 'criar_lembrete': { const r = db.prepare('INSERT INTO lembretes (conta_id, modulo, texto, quando, recorrencia, destino_chat_id) VALUES (?,?,?,?,?,?)').run(conta.id, 'secretaria', a.texto, a.quando, a.recorrencia || null, ctx.chatId); return { id: r.lastInsertRowid }; }
    case 'registrar_retorno': { const r = db.prepare('INSERT INTO retornos (conta_id, pessoa, assunto, direcao) VALUES (?,?,?,?)').run(conta.id, a.pessoa, a.assunto, a.direcao); return { id: r.lastInsertRowid }; }
    default: throw new Error(`secretaria.${nome}: não implementada`);
  }
}
