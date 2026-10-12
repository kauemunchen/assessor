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
function traduzErro(e) {
  const m = String(e?.message || e);
  if (/has not been used in project|is disabled/i.test(m)) return new Error('A Gmail API não está ativada no projeto Google Cloud (km-assistente). Ative em console.cloud.google.com → APIs e serviços → Biblioteca → Gmail API → Ativar.');
  if (/insufficient.*scope|insufficientPermissions/i.test(m)) return new Error('A autorização atual não inclui o Gmail. Diga "conectar google" e aceite as permissões de e-mail.');
  if (/invalid_grant/i.test(m)) return new Error('A autorização do Google expirou. Diga "conectar google" para renovar.');
  return new Error(`Gmail: ${m.slice(0, 200)}`);
}
export async function listar(contaId, { q = 'newer_than:1d -category:promotions -category:social', max = 15 } = {}) {
  const g = auth(contaId);
  const r = await g.users.messages.list({ userId: 'me', q, maxResults: max }).catch(e => { throw traduzErro(e); });
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
  const m = await g.users.messages.get({ userId: 'me', id, format: 'full' }).catch(e => { throw traduzErro(e); });
  return { id, de: header(m.data, 'from'), para: header(m.data, 'to'), assunto: header(m.data, 'subject'), data: header(m.data, 'date'), corpo: corpo(m.data.payload).slice(0, 6000) || m.data.snippet };
}

function temEscopo(contaId, parte) {
  const row = db.prepare('SELECT token_json FROM google_auth WHERE conta_id=?').get(contaId);
  return !!row && (JSON.parse(row.token_json).scope || '').includes(parte);
}
function mime({ para, assunto, texto, cc, emResposta }) {
  const enc = (t) => `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`;
  const linhas = [`To: ${para}`, cc ? `Cc: ${cc}` : null, `Subject: ${enc(assunto)}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'];
  if (emResposta?.messageId) { linhas.push(`In-Reply-To: ${emResposta.messageId}`); linhas.push(`References: ${emResposta.messageId}`); }
  const raw = linhas.filter(Boolean).join('\r\n') + '\r\n\r\n' + Buffer.from(texto, 'utf8').toString('base64');
  return Buffer.from(raw).toString('base64url');
}
async function cabecalhosResposta(g, id) {
  const m = await g.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Reply-To', 'Subject', 'Message-ID'] });
  const h = (n) => (m.data.payload?.headers || []).find(x => x.name.toLowerCase() === n.toLowerCase())?.value || '';
  const assunto = h('Subject'); return { para: h('Reply-To') || h('From'), assunto: /^re:/i.test(assunto) ? assunto : `Re: ${assunto}`, messageId: h('Message-ID'), threadId: m.data.threadId };
}
export async function criarRascunho(contaId, { para, assunto, texto, cc, respondendo_id }) {
  if (!temEscopo(contaId, 'gmail.compose')) throw new Error('Falta permissão de escrever e-mail. Diga "conectar google" de novo e aceite enviar/rascunhar e-mails.');
  const g = auth(contaId); let emResposta = null, threadId;
  if (respondendo_id) { emResposta = await cabecalhosResposta(g, respondendo_id); para = para || emResposta.para; assunto = assunto || emResposta.assunto; threadId = emResposta.threadId; }
  const r = await g.users.drafts.create({ userId: 'me', requestBody: { message: { raw: mime({ para, assunto, texto, cc, emResposta }), threadId } } });
  return { rascunho_id: r.data.id, para, assunto };
}
export async function enviar(contaId, { para, assunto, texto, cc, respondendo_id }) {
  if (!temEscopo(contaId, 'gmail.send')) throw new Error('Falta permissão de enviar e-mail. Diga "conectar google" de novo e aceite enviar e-mails.');
  const g = auth(contaId); let emResposta = null, threadId;
  if (respondendo_id) { emResposta = await cabecalhosResposta(g, respondendo_id); para = para || emResposta.para; assunto = assunto || emResposta.assunto; threadId = emResposta.threadId; }
  const r = await g.users.messages.send({ userId: 'me', requestBody: { raw: mime({ para, assunto, texto, cc, emResposta }), threadId } });
  return { enviado_id: r.data.id, para, assunto };
}
