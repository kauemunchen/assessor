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
function mime({ para, assunto, texto, cc, emResposta, anexos = [] }) {
  const enc = (t) => `=?UTF-8?B?${Buffer.from(t, 'utf8').toString('base64')}?=`;
  const cab = [`To: ${para}`, cc ? `Cc: ${cc}` : null, `Subject: ${enc(assunto)}`, 'MIME-Version: 1.0'];
  if (emResposta?.messageId) { cab.push(`In-Reply-To: ${emResposta.messageId}`); cab.push(`References: ${emResposta.messageId}`); }
  const corpo64 = Buffer.from(texto, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  let raw;
  if (!anexos.length) {
    raw = [...cab.filter(Boolean), 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64'].join('\r\n') + '\r\n\r\n' + corpo64;
  } else {
    const b = `km-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const partes = [`--${b}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', corpo64];
    for (const a of anexos) {
      partes.push(`--${b}`, `Content-Type: ${a.mime || 'application/octet-stream'}; name="${enc(a.nome)}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${enc(a.nome)}"`, '', Buffer.from(a.bytes).toString('base64').replace(/(.{76})/g, '$1\r\n'));
    }
    partes.push(`--${b}--`);
    raw = [...cab.filter(Boolean), `Content-Type: multipart/mixed; boundary="${b}"`].join('\r\n') + '\r\n\r\n' + partes.join('\r\n');
  }
  return Buffer.from(raw).toString('base64url');
}
const LIMITE_ANEXO = 22 * 1024 * 1024;
/** Remove do corpo as linhas que só existem para carregar um link (ex.: "- CNH: https://drive...") ou só o link se a linha tiver outro conteúdo. */
export function removerLinhasComLinks(texto, links) {
  const linhas = texto.split('\n');
  const out = linhas.filter(l => !links.some(k => l.includes(k) && /^\s*[-•*]?\s*[^:]{0,60}:?\s*\S*https?:\/\/\S+\s*$/.test(l)));
  return out.map(l => links.reduce((t, k) => t.replace(k, '(em anexo)'), l)).join('\n');
}
export const _mime = (...a) => mime(...a);
const RX_DRIVE = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s)>\]]+/g;
/** Resolve anexos: ids do Drive (ou links no texto) → bytes; compartilha leitura com os destinatários; remove links do texto quando virou anexo. */
async function prepararAnexos(contaId, { texto, para, cc, anexos_drive_ids = [] }) {
  const drive = await import('./google-drive.js');
  const ids = new Set(anexos_drive_ids.filter(Boolean));
  for (const link of texto.match(RX_DRIVE) || []) { const id = drive.extrairId(link); if (id) ids.add(id); }
  const destinatarios = [para, cc].filter(Boolean).join(',').split(/[,;]/).map(x => x.trim().replace(/^.*<([^>]+)>.*$/, '$1')).filter(x => /@/.test(x));
  const anexos = [], compartilhados = [], soLink = [];
  for (const id of ids) {
    let meta; try { meta = await drive.metadados(contaId, id); } catch (e) { soLink.push({ id, erro: e.message }); continue; }
    // libera leitura para quem recebe (vale mesmo se anexar — garante acesso ao link)
    for (const em of destinatarios) { try { await drive.compartilharLeitor(contaId, id, em); compartilhados.push(`${meta.nome} → ${em}`); } catch (e) { console.error('[gmail] compartilhar', e.message); } }
    if (meta.mime?.startsWith('application/vnd.google-apps')) {
      try { const pdf = await drive.exportarPDF(contaId, id); anexos.push({ nome: meta.nome.replace(/\.pdf$/i, '') + '.pdf', mime: 'application/pdf', bytes: pdf }); } catch (e) { soLink.push({ id, nome: meta.nome, erro: e.message }); }
      continue;
    }
    if (meta.tamanho > LIMITE_ANEXO) { soLink.push({ id, nome: meta.nome, erro: 'acima de 22 MB — vai só o link (já liberado)' }); continue; }
    try { anexos.push({ nome: meta.nome, mime: meta.mime, bytes: await drive.baixar(contaId, id) }); } catch (e) { soLink.push({ id, nome: meta.nome, erro: e.message }); }
  }
  // links que viraram anexo saem do corpo; os que ficaram só como link permanecem
  const virados = [...(texto.match(RX_DRIVE) || [])].filter(l => { const id = drive.extrairId(l); return id && anexos.length && !soLink.find(x => x.id === id); });
  let corpo = removerLinhasComLinks(texto, virados);
  if (anexos.length) corpo = corpo.replace(/\n{3,}/g, '\n\n').trim() + `\n\nAnexo${anexos.length > 1 ? 's' : ''}: ${anexos.map(a => a.nome).join(', ')}`;
  return { anexos, corpo, compartilhados, soLink };
}
async function cabecalhosResposta(g, id) {
  const m = await g.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['From', 'Reply-To', 'Subject', 'Message-ID'] });
  const h = (n) => (m.data.payload?.headers || []).find(x => x.name.toLowerCase() === n.toLowerCase())?.value || '';
  const assunto = h('Subject'); return { para: h('Reply-To') || h('From'), assunto: /^re:/i.test(assunto) ? assunto : `Re: ${assunto}`, messageId: h('Message-ID'), threadId: m.data.threadId };
}
export async function criarRascunho(contaId, { para, assunto, texto, cc, respondendo_id, anexos_drive_ids }) {
  if (!temEscopo(contaId, 'gmail.compose')) throw new Error('Falta permissão de escrever e-mail. Diga "conectar google" de novo e aceite enviar/rascunhar e-mails.');
  const g = auth(contaId); let emResposta = null, threadId;
  if (respondendo_id) { emResposta = await cabecalhosResposta(g, respondendo_id); para = para || emResposta.para; assunto = assunto || emResposta.assunto; threadId = emResposta.threadId; }
  const prep = await prepararAnexos(contaId, { texto, para, cc, anexos_drive_ids: anexos_drive_ids || [] });
  const r = await g.users.drafts.create({ userId: 'me', requestBody: { message: { raw: mime({ para, assunto, texto: prep.corpo, cc, emResposta, anexos: prep.anexos }), threadId } } });
  return { rascunho_id: r.data.id, para, assunto, anexos: prep.anexos.map(a => a.nome), compartilhados: prep.compartilhados, so_link: prep.soLink };
}
export async function enviar(contaId, { para, assunto, texto, cc, respondendo_id, anexos_drive_ids }) {
  if (!temEscopo(contaId, 'gmail.send')) throw new Error('Falta permissão de enviar e-mail. Diga "conectar google" de novo e aceite enviar e-mails.');
  const g = auth(contaId); let emResposta = null, threadId;
  if (respondendo_id) { emResposta = await cabecalhosResposta(g, respondendo_id); para = para || emResposta.para; assunto = assunto || emResposta.assunto; threadId = emResposta.threadId; }
  const prep = await prepararAnexos(contaId, { texto, para, cc, anexos_drive_ids: anexos_drive_ids || [] });
  const r = await g.users.messages.send({ userId: 'me', requestBody: { raw: mime({ para, assunto, texto: prep.corpo, cc, emResposta, anexos: prep.anexos }), threadId } });
  return { enviado_id: r.data.id, para, assunto, anexos: prep.anexos.map(a => a.nome), compartilhados: prep.compartilhados, so_link: prep.soLink };
}
