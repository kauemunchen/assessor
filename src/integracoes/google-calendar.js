// Google Calendar por conta (OAuth do dono). Portado de crm_bot/google_calendar.py.
// Token do bot antigo (/opt/crm_bot/google_token.json) pode ser importado direto na tabela google_auth da conta do Kauê.
import { google } from 'googleapis';
import { db } from '../db/index.js';
const TZ = 'America/Sao_Paulo';

function clienteOAuth() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}
export function urlAutorizacao(contaId) {
  return clienteOAuth().generateAuthUrl({ access_type: 'offline', prompt: 'consent', state: String(contaId),
    scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.compose', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/tasks'] });
}
export async function salvarCodigo(contaId, code) {
  const { tokens } = await clienteOAuth().getToken({ code: String(code) });
  db.prepare('INSERT INTO google_auth (conta_id, token_json) VALUES (?,?) ON CONFLICT(conta_id) DO UPDATE SET token_json=excluded.token_json').run(contaId, JSON.stringify(tokens));
}
function servico(contaId) {
  const row = db.prepare('SELECT token_json FROM google_auth WHERE conta_id=?').get(contaId);
  if (!row) throw new Error('Google Agenda não conectado. Peça ao Diretor: "conectar Google".');
  const auth = clienteOAuth(); auth.setCredentials(JSON.parse(row.token_json));
  auth.on('tokens', (t) => { const atual = JSON.parse(row.token_json); db.prepare('UPDATE google_auth SET token_json=? WHERE conta_id=?').run(JSON.stringify({ ...atual, ...t }), contaId); });
  return google.calendar({ version: 'v3', auth });
}
const norm = (dt) => { if (!dt) return dt; dt = dt.replace(' ', 'T'); return dt.length === 16 ? dt + ':00' : dt; };

const CORES = { 'financeiro pf': '10', 'financeiro pj': '2', 'profissional': '9', 'família': '5', 'familia': '5', 'saúde': '11', 'saude': '11', 'pessoal': '6' };
export async function listarCalendarios(contaId) {
  const r = await servico(contaId).calendarList.list({ minAccessRole: 'writer' });
  return (r.data.items || []).map(c => ({ id: c.id, nome: c.summary, primario: !!c.primary, cor: c.backgroundColor }));
}
export async function obterOuCriarCalendario(contaId, nome) {
  const lista = await listarCalendarios(contaId);
  const achado = lista.find(c => c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (achado) return achado;
  const svc = servico(contaId);
  const r = await svc.calendars.insert({ requestBody: { summary: nome, timeZone: TZ } });
  const cor = CORES[nome.trim().toLowerCase()];
  if (cor) await svc.calendarList.patch({ calendarId: r.data.id, colorRgbFormat: false, requestBody: { colorId: cor } }).catch(() => {});
  return { id: r.data.id, nome: r.data.summary, primario: false };
}
async function idsCalendarios(contaId, categoria) {
  if (categoria) return [(await obterOuCriarCalendario(contaId, categoria)).id];
  return (await listarCalendarios(contaId)).map(c => c.id);
}
export async function listarEventos(contaId, { inicio, fim, max = 50, categoria } = {}) {
  const svc = servico(contaId); const cals = await listarCalendarios(contaId);
  const ids = categoria ? [(await obterOuCriarCalendario(contaId, categoria)).id] : cals.map(c => c.id);
  const todos = [];
  for (const id of ids) {
    const r = await svc.events.list({ calendarId: id, timeMin: inicio || new Date().toISOString(),
      timeMax: fim || new Date(Date.now() + 30 * 864e5).toISOString(), maxResults: max, singleEvents: true, orderBy: 'startTime' }).catch(() => ({ data: {} }));
    for (const e of r.data.items || []) todos.push({ ...e, categoria: cals.find(c => c.id === id)?.nome });
  }
  return todos.sort((a, b) => (a.start?.dateTime || a.start?.date).localeCompare(b.start?.dateTime || b.start?.date)).slice(0, max);
}
async function _listarEventosAntigo(contaId, { inicio, fim, max = 50 } = {}) {
  const r = await servico(contaId).events.list({ calendarId: 'primary', timeMin: inicio || new Date().toISOString(),
    timeMax: fim || new Date(Date.now() + 30 * 864e5).toISOString(), maxResults: max, singleEvents: true, orderBy: 'startTime' });
  return r.data.items || [];
}
export async function buscarEventos(contaId, texto, dias = 365, categoria) {
  const svc = servico(contaId); const cals = await listarCalendarios(contaId);
  const ids = await idsCalendarios(contaId, categoria);
  const todos = [];
  for (const id of ids) {
    const r = await svc.events.list({ calendarId: id, q: texto, timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + dias * 864e5).toISOString(), maxResults: 50, singleEvents: true, orderBy: 'startTime' }).catch(() => ({ data: {} }));
    for (const e of r.data.items || []) todos.push({ ...e, categoria: cals.find(c => c.id === id)?.nome });
  }
  return todos.sort((a, b) => (a.start?.dateTime || a.start?.date).localeCompare(b.start?.dateTime || b.start?.date));
}
export async function criarEvento(contaId, { titulo, inicio, fim, descricao = '', local = '', convidados = [], lembreteMin = 30, meet = false, categoria }) {
  const calendarId = categoria ? (await obterOuCriarCalendario(contaId, categoria)).id : 'primary';
  inicio = norm(inicio); fim = norm(fim) || new Date(new Date(inicio).getTime() + 36e5).toISOString().slice(0, 19);
  const body = { summary: titulo, description: descricao, location: local,
    start: { dateTime: inicio, timeZone: TZ }, end: { dateTime: fim, timeZone: TZ },
    attendees: convidados.filter(Boolean).map(email => ({ email })),
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: lembreteMin }] } };
  if (meet) body.conferenceData = { createRequest: { requestId: `km-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  const r = await servico(contaId).events.insert({ calendarId, requestBody: body, conferenceDataVersion: meet ? 1 : 0, sendUpdates: convidados.length ? 'all' : 'none' });
  return { id: r.data.id, link: r.data.htmlLink, meet: r.data.hangoutLink || null, categoria: categoria || 'Principal' };
}
/** Acha em qual calendário (marcador) o evento está. */
async function localizarEvento(contaId, eventId) {
  const svc = servico(contaId);
  for (const c of await listarCalendarios(contaId)) {
    try { const { data } = await svc.events.get({ calendarId: c.id, eventId }); if (data && data.status !== 'cancelled') return { calendarId: c.id, ev: data }; } catch {}
  }
  throw new Error('Evento não encontrado em nenhum marcador (já cancelado?).');
}
export async function atualizarEvento(contaId, eventId, campos) {
  const svc = servico(contaId); const { calendarId, ev } = await localizarEvento(contaId, eventId);
  if (campos.titulo) ev.summary = campos.titulo;
  if (campos.inicio) ev.start = { dateTime: norm(campos.inicio), timeZone: TZ };
  if (campos.fim) ev.end = { dateTime: norm(campos.fim), timeZone: TZ };
  if (campos.descricao != null) ev.description = campos.descricao;
  if (campos.local != null) ev.location = campos.local;
  return (await svc.events.update({ calendarId, eventId, requestBody: ev, sendUpdates: 'all' })).data.id;
}
export async function cancelarEvento(contaId, eventId) { const { calendarId, ev } = await localizarEvento(contaId, eventId); await servico(contaId).events.delete({ calendarId, eventId }); return { cancelado: ev.summary }; }
