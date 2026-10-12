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
    scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/gmail.readonly'] });
}
export async function salvarCodigo(contaId, code) {
  const { tokens } = await clienteOAuth().getToken(code);
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

export async function listarEventos(contaId, { inicio, fim, max = 50 } = {}) {
  const r = await servico(contaId).events.list({ calendarId: 'primary', timeMin: inicio || new Date().toISOString(),
    timeMax: fim || new Date(Date.now() + 30 * 864e5).toISOString(), maxResults: max, singleEvents: true, orderBy: 'startTime' });
  return r.data.items || [];
}
export async function criarEvento(contaId, { titulo, inicio, fim, descricao = '', local = '', convidados = [], lembreteMin = 30, meet = false }) {
  inicio = norm(inicio); fim = norm(fim) || new Date(new Date(inicio).getTime() + 36e5).toISOString().slice(0, 19);
  const body = { summary: titulo, description: descricao, location: local,
    start: { dateTime: inicio, timeZone: TZ }, end: { dateTime: fim, timeZone: TZ },
    attendees: convidados.filter(Boolean).map(email => ({ email })),
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: lembreteMin }] } };
  if (meet) body.conferenceData = { createRequest: { requestId: `km-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  const r = await servico(contaId).events.insert({ calendarId: 'primary', requestBody: body, conferenceDataVersion: meet ? 1 : 0, sendUpdates: convidados.length ? 'all' : 'none' });
  return { id: r.data.id, link: r.data.htmlLink, meet: r.data.hangoutLink || null };
}
export async function atualizarEvento(contaId, eventId, campos) {
  const svc = servico(contaId); const { data: ev } = await svc.events.get({ calendarId: 'primary', eventId });
  if (campos.titulo) ev.summary = campos.titulo;
  if (campos.inicio) ev.start = { dateTime: norm(campos.inicio), timeZone: TZ };
  if (campos.fim) ev.end = { dateTime: norm(campos.fim), timeZone: TZ };
  if (campos.descricao != null) ev.description = campos.descricao;
  if (campos.local != null) ev.location = campos.local;
  return (await svc.events.update({ calendarId: 'primary', eventId, requestBody: ev, sendUpdates: 'all' })).data.id;
}
export async function cancelarEvento(contaId, eventId) { await servico(contaId).events.delete({ calendarId: 'primary', eventId }); }
