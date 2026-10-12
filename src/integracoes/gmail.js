// Gmail somente leitura (escopo gmail.readonly já autorizado no "conectar google").
import { google } from 'googleapis';
import { db } from '../db/index.js';
function auth(contaId) {
  const row = db.prepare('SELECT token_json FROM google_auth WHERE conta_id=?').get(contaId);
  if (!row) throw new Error('Google não conectado. Diga "conectar google".');
  const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  a.setCredentials(JSON.parse(row.token_json));
  const tok = JSON.parse(row.token_json);
  if (!(tok.scope || '').includes('gmail')) throw new Error('A autorização atual não inclui o Gmail. Diga "conectar google" de novo e aceite a leitura de e-mail.');
  return google.gmail({ version: 'v1', auth: a });
}
const header = (m, n) => (m.payload?.headers || []).find(h => h.name.toLowerCase() === n)?.value || '';
function corpo(payload) {
  const partes = []; const walk = (p) => { if (!p) return; if (p.mimeType === 'text/plain' && p.body?.data) partes.push(Buffer.from(p.body.data, 'base64').toString('utf8')); (p.parts || []).forEach(walk); };
  walk(payload); return partes.join('\n').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
export async function listar(contaId, { q = 'newer_than:1d -category:promotions -category:social', max = 15 } = {}) {
  const g = auth(contaId);
  const r = await g.users.messages.list({ userId: 'me', q, maxResults: max });
  const ids = r.data.messages || [];
  const out = [];
  for (const { id } of ids) {
    const m = await g.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] });
    out.push({ id, de: header(m.data, 'from'), assunto: header(m.data, 'subject'), data: header(m.data, 'date'), previa: m.data.snippet, nao_lido: (m.data.labelIds || []).includes('UNREAD') });
  }
  return out;
}
export async function ler(contaId, id) {
  const g = auth(contaId);
  const m = await g.users.messages.get({ userId: 'me', id, format: 'full' });
  return { id, de: header(m.data, 'from'), para: header(m.data, 'to'), assunto: header(m.data, 'subject'), data: header(m.data, 'date'), corpo: corpo(m.data.payload).slice(0, 6000) || m.data.snippet };
}
