import * as gcal from '../integracoes/google-calendar.js';
import * as gmail from '../integracoes/gmail.js';
import * as gtasks from '../integracoes/google-tasks.js';
import * as equipe from '../orquestrador/equipe.js';
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
    { name: 'mover_evento', description: 'Altera data/hora/título/local de um evento (qualquer marcador). Passe titulo atual para referência.', parameters: { type: 'OBJECT', properties: { event_id: { type: 'STRING' }, inicio: { type: 'STRING' }, fim: { type: 'STRING' }, titulo: { type: 'STRING' }, local: { type: 'STRING' } }, required: ['event_id'] } },
    { name: 'cancelar_evento', description: 'Cancela um evento (requer confirmação). Passe também titulo para o dono saber qual é. Para cancelar vários, chame uma vez por evento na MESMA rodada.', parameters: { type: 'OBJECT', properties: { event_id: { type: 'STRING' }, titulo: { type: 'STRING' } }, required: ['event_id'] } },
    { name: 'criar_lembrete', description: 'Cria lembrete pontual ou recorrente', parameters: { type: 'OBJECT', properties: { texto: { type: 'STRING' }, quando: { type: 'STRING', description: 'YYYY-MM-DDTHH:MM' }, recorrencia: { type: 'STRING', description: 'diario|semanal|mensal|null' } }, required: ['texto', 'quando'] } },
    { name: 'ler_emails', description: 'Lista e-mails recentes do Gmail do dono (somente leitura). q = filtro Gmail (ex.: "newer_than:1d is:unread", "from:joao", "assunto"). Padrão: últimas 24h sem promoções/social.', parameters: { type: 'OBJECT', properties: { q: { type: 'STRING' }, max: { type: 'NUMBER' } } } },
    { name: 'ler_email', description: 'Lê o conteúdo completo de um e-mail pelo id (vindo de ler_emails)', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] } },
    { name: 'enviar_email', description: 'Envia e-mail pelo Gmail do dono. SEMPRE exige confirmação do dono (mostre para quem, assunto e texto completo antes). Para responder um e-mail existente, passe respondendo_id (mantém a conversa); para e para assunto podem ficar vazios nesse caso.', parameters: { type: 'OBJECT', properties: { para: { type: 'STRING' }, assunto: { type: 'STRING' }, texto: { type: 'STRING' }, cc: { type: 'STRING' }, respondendo_id: { type: 'STRING' } }, required: ['texto'] } },
    { name: 'criar_rascunho_email', description: 'Salva um rascunho na pasta Rascunhos do Gmail do dono (não envia). Útil quando ele quer revisar no celular antes.', parameters: { type: 'OBJECT', properties: { para: { type: 'STRING' }, assunto: { type: 'STRING' }, texto: { type: 'STRING' }, cc: { type: 'STRING' }, respondendo_id: { type: 'STRING' } }, required: ['texto'] } },
    { name: 'criar_tarefa', description: 'Cria tarefa no Google Tasks do dono (aparece no app Tarefas e na lateral do Gmail/Agenda). Use para "anota uma tarefa", "coloca na minha lista", "preciso fazer X até sexta". prazo = YYYY-MM-DD (Tasks só guarda a data). lista = nome da lista (opcional; cria se não existir).', parameters: { type: 'OBJECT', properties: { titulo: { type: 'STRING' }, notas: { type: 'STRING' }, prazo: { type: 'STRING' }, lista: { type: 'STRING' } }, required: ['titulo'] } },
    { name: 'listar_tarefas', description: 'Lista tarefas abertas do Google Tasks (todas as listas ou uma).', parameters: { type: 'OBJECT', properties: { lista: { type: 'STRING' }, concluidas: { type: 'BOOLEAN' } } } },
    { name: 'concluir_tarefa', description: 'Marca tarefa do Google Tasks como concluída (por id ou título exato).', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' } }, required: ['id'] } },
    { name: 'atualizar_tarefa', description: 'Altera título, notas ou prazo de uma tarefa do Google Tasks.', parameters: { type: 'OBJECT', properties: { id: { type: 'STRING' }, titulo: { type: 'STRING' }, notas: { type: 'STRING' }, prazo: { type: 'STRING' } }, required: ['id'] } },
    { name: 'enviar_recado', description: 'Manda um recado pelo Telegram para alguém da equipe do dono (pessoa já cadastrada via convite). Requer confirmação. Escreva o recado em nome do dono, claro e curto.', parameters: { type: 'OBJECT', properties: { pessoa: { type: 'STRING' }, texto: { type: 'STRING' } }, required: ['pessoa', 'texto'] } },
    { name: 'delegar_tarefa', description: 'Repassa uma tarefa para alguém da equipe pelo Telegram, com prazo (YYYY-MM-DD) e detalhes. A pessoa recebe, pode responder e marca "feito"; o dono é avisado. Requer confirmação.', parameters: { type: 'OBJECT', properties: { pessoa: { type: 'STRING' }, titulo: { type: 'STRING' }, prazo: { type: 'STRING' }, detalhes: { type: 'STRING' } }, required: ['pessoa', 'titulo'] } },
    { name: 'listar_pessoas', description: 'Lista as pessoas da equipe que estão no Telegram (para recados e tarefas).', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'listar_delegadas', description: 'Lista tarefas delegadas à equipe (abertas por padrão), opcionalmente de uma pessoa.', parameters: { type: 'OBJECT', properties: { pessoa: { type: 'STRING' }, status: { type: 'STRING', description: 'aberta|concluida|todas' } } } },
    { name: 'registrar_retorno', description: 'Registra quem deve resposta a quem', parameters: { type: 'OBJECT', properties: { pessoa: { type: 'STRING' }, assunto: { type: 'STRING' }, direcao: { type: 'STRING', description: 'devo_responder|aguardo_resposta' } }, required: ['pessoa', 'assunto', 'direcao'] } },
  ];
}
export const requerConfirmacao = new Set(['cancelar_evento', 'enviar_recado', 'delegar_tarefa', 'enviar_email']);

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
    case 'ler_emails': return gmail.listar(conta.id, { q: a.q, max: a.max || 15 });
    case 'ler_email': return gmail.ler(conta.id, a.id);
    case 'enviar_email': return gmail.enviar(conta.id, a);
    case 'criar_rascunho_email': return gmail.criarRascunho(conta.id, a);
    case 'criar_tarefa': return gtasks.criarTarefa(conta.id, a);
    case 'listar_tarefas': return gtasks.listarTarefas(conta.id, { lista: a.lista, concluidas: !!a.concluidas });
    case 'concluir_tarefa': return gtasks.concluirTarefa(conta.id, a.id);
    case 'atualizar_tarefa': return gtasks.atualizarTarefa(conta.id, a.id, a);
    case 'enviar_recado': return equipe.enviarRecado(conta, a);
    case 'delegar_tarefa': return equipe.delegarTarefa(conta, a);
    case 'listar_pessoas': return equipe.listarPessoas(conta.id).map(p => p.nome);
    case 'listar_delegadas': return equipe.listarDelegadas(conta.id, { pessoa: a.pessoa, status: a.status === 'todas' ? null : (a.status || 'aberta') });
    case 'registrar_retorno': { const r = db.prepare('INSERT INTO retornos (conta_id, pessoa, assunto, direcao) VALUES (?,?,?,?)').run(conta.id, a.pessoa, a.assunto, a.direcao); return { id: r.lastInsertRowid }; }
    default: throw new Error(`secretaria.${nome}: não implementada`);
  }
}
