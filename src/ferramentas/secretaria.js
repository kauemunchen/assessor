import * as gcal from '../integracoes/google-calendar.js';
const mapaEv = (e) => ({ id: e.id, categoria: e.categoria, titulo: e.summary, inicio: e.start?.dateTime || e.start?.date, fim: e.end?.dateTime || e.end?.date, local: e.location, meet: e.hangoutLink, descricao: (e.description || '').slice(0, 200) });
import { db } from '../db/index.js';

// Declarações no formato function-calling do Gemini
export function ferramentas(_conta) {
  return [
    { name: 'criar_evento', description: 'Cria compromisso no Google Agenda do dono. categoria = marcador/calendário (ex.: Financeiro PF, Financeiro PJ, Profissional, Família, Saúde); se o dono não disser, deduza pelo contexto ou deixe vazio (Principal).', parameters: { type: 'OBJECT', properties: { titulo: { type: 'STRING' }, categoria: { type: 'STRING' }, inicio: { type: 'STRING', description: 'YYYY-MM-DDTHH:MM' }, fim: { type: 'STRING' }, local: { type: 'STRING' }, convidados: { type: 'ARRAY', items: { type: 'STRING' } }, meet: { type: 'BOOLEAN' }, lembrete_min: { type: 'NUMBER' } }, required: ['titulo', 'inicio'] } },
    { name: 'listar_agenda', description: 'Lista compromissos de um período (padrão: próximos 90 dias). Datas ISO YYYY-MM-DD.', parameters: { type: 'OBJECT', properties: { inicio: { type: 'STRING' }, fim: { type: 'STRING' }, categoria: { type: 'STRING', description: 'filtrar por marcador' } } } },
    { name: 'listar_categorias', description: 'Lista os marcadores (calendários) da agenda do dono', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'criar_categoria', description: 'Cria um marcador (calendário) novo na agenda', parameters: { type: 'OBJECT', properties: { nome: { type: 'STRING' } }, required: ['nome'] } },
    { name: 'buscar_evento', description: 'Busca compromissos pelo texto (nome de pessoa, lugar, tipo: "Dedi", "dentista", "consulta") nos próximos 365 dias. Use para "quando é minha próxima X com Y".', parameters: { type: 'OBJECT', properties: { texto: { type: 'STRING' }, dias: { type: 'NUMBER' }, categoria: { type: 'STRING' } }, required: ['texto'] } },
    { name: 'mover_evento', description: 'Altera data/hora/título/local de um evento', parameters: { type: 'OBJECT', properties: { event_id: { type: 'STRING' }, inicio: { type: 'STRING' }, fim: { type: 'STRING' }, titulo: { type: 'STRING' }, local: { type: 'STRING' } }, required: ['event_id'] } },
    { name: 'cancelar_evento', description: 'Cancela um evento (requer confirmação)', parameters: { type: 'OBJECT', properties: { event_id: { type: 'STRING' } }, required: ['event_id'] } },
    { name: 'criar_lembrete', description: 'Cria lembrete pontual ou recorrente', parameters: { type: 'OBJECT', properties: { texto: { type: 'STRING' }, quando: { type: 'STRING', description: 'YYYY-MM-DDTHH:MM' }, recorrencia: { type: 'STRING', description: 'diario|semanal|mensal|null' } }, required: ['texto', 'quando'] } },
    { name: 'registrar_retorno', description: 'Registra quem deve resposta a quem', parameters: { type: 'OBJECT', properties: { pessoa: { type: 'STRING' }, assunto: { type: 'STRING' }, direcao: { type: 'STRING', description: 'devo_responder|aguardo_resposta' } }, required: ['pessoa', 'assunto', 'direcao'] } },
  ];
}
export const requerConfirmacao = new Set(['cancelar_evento', 'enviar_mensagem_terceiro']);

export async function executar(nome, a, conta, ctx) {
  switch (nome) {
    case 'criar_evento': return gcal.criarEvento(conta.id, { titulo: a.titulo, inicio: a.inicio, fim: a.fim, local: a.local, convidados: a.convidados || [], meet: !!a.meet, lembreteMin: a.lembrete_min ?? 30, categoria: a.categoria });
    case 'listar_agenda': return (await gcal.listarEventos(conta.id, { inicio: a.inicio ? new Date(a.inicio).toISOString() : undefined, fim: a.fim ? new Date(a.fim + 'T23:59:59').toISOString() : new Date(Date.now() + 90 * 864e5).toISOString(), max: 100, categoria: a.categoria })).map(mapaEv);
    case 'listar_categorias': return gcal.listarCalendarios(conta.id);
    case 'criar_categoria': return gcal.obterOuCriarCalendario(conta.id, a.nome);
    case 'buscar_evento': return (await gcal.buscarEventos(conta.id, a.texto, a.dias || 365, a.categoria)).map(mapaEv);
    case 'mover_evento': return { id: await gcal.atualizarEvento(conta.id, a.event_id, a) };
    case 'cancelar_evento': await gcal.cancelarEvento(conta.id, a.event_id); return { ok: true };
    case 'criar_lembrete': { const r = db.prepare('INSERT INTO lembretes (conta_id, modulo, texto, quando, recorrencia, destino_chat_id) VALUES (?,?,?,?,?,?)').run(conta.id, 'secretaria', a.texto, a.quando, a.recorrencia || null, ctx.chatId); return { id: r.lastInsertRowid }; }
    case 'registrar_retorno': { const r = db.prepare('INSERT INTO retornos (conta_id, pessoa, assunto, direcao) VALUES (?,?,?,?)').run(conta.id, a.pessoa, a.assunto, a.direcao); return { id: r.lastInsertRowid }; }
    default: throw new Error(`secretaria.${nome}: não implementada`);
  }
}
