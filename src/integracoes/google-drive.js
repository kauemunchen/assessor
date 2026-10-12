// Google Drive do dono: pasta raiz "KM/Assessor/Documentos" (ou a que ele apontar), subpastas Empresa/Tipo/Ano.
// Escopo: drive (completo) — necessário para mover arquivos que o dono mandou por link. O bot nunca apaga (só move para lixeira se pedido).
import { google } from 'googleapis';
import { Readable } from 'node:stream';
import { db } from '../db/index.js';

function auth(contaId) {
  const row = db.prepare('SELECT token_json FROM google_auth WHERE conta_id=?').get(contaId);
  if (!row) throw new Error('Google não conectado. Diga "conectar google".');
  const tok = JSON.parse(row.token_json);
  if (!/auth\/drive(\b|\.)/.test(tok.scope || '')) throw new Error('A autorização atual não inclui o Google Drive. Diga "conectar google" de novo e aceite o acesso ao Drive.');
  const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  a.setCredentials(tok);
  a.on('tokens', (t) => db.prepare('UPDATE google_auth SET token_json=? WHERE conta_id=?').run(JSON.stringify({ ...tok, ...t }), contaId));
  return google.drive({ version: 'v3', auth: a });
}
function traduzErro(e) {
  const m = String(e?.message || e);
  if (/has not been used in project|is disabled/i.test(m)) return new Error('A Google Drive API não está ativada no projeto Google Cloud (km-assistente). Ative em console.cloud.google.com → APIs e serviços → Biblioteca → Google Drive API → Ativar.');
  if (/insufficient.*scope|insufficientPermissions/i.test(m)) return new Error('A autorização atual não inclui o Drive. Diga "conectar google" e aceite o acesso ao Drive.');
  if (/invalid_grant/i.test(m)) return new Error('A autorização do Google expirou. Diga "conectar google" para renovar.');
  if (/File not found|notFound/i.test(m)) return new Error('Arquivo não encontrado no Drive (ou sem permissão). Confira o link.');
  return new Error(`Drive: ${m.slice(0, 200)}`);
}
const PASTA = 'application/vnd.google-apps.folder';
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function extrairId(texto = '') {
  const m = texto.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|drive\/(?:u\/\d+\/)?folders\/|uc\?id=)([A-Za-z0-9_-]{10,})/) || texto.match(/docs\.google\.com\/\w+\/d\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : (/^[A-Za-z0-9_-]{20,}$/.test(texto.trim()) ? texto.trim() : null);
}
export const temLinkDrive = (t = '') => /drive\.google\.com\/|docs\.google\.com\/\w+\/d\//.test(t);

export async function obterOuCriarPasta(contaId, nome, parentId = 'root') {
  const d = auth(contaId);
  const q = `name='${esc(nome)}' and mimeType='${PASTA}' and '${parentId}' in parents and trashed=false`;
  const r = await d.files.list({ q, fields: 'files(id,name)', pageSize: 1 }).catch(e => { throw traduzErro(e); });
  if (r.data.files?.length) return r.data.files[0].id;
  const c = await d.files.create({ requestBody: { name: nome, mimeType: PASTA, parents: [parentId] }, fields: 'id' }).catch(e => { throw traduzErro(e); });
  return c.data.id;
}
async function caminho(contaId, partes, base = 'root') {
  let id = base;
  for (const p of partes.filter(Boolean)) id = await obterOuCriarPasta(contaId, p, id);
  return id;
}
/** Pasta raiz dos documentos da conta: a apontada pelo dono ou KM/Assessor/Documentos (criada na 1ª vez). */
export async function pastaRaiz(contaId) {
  const row = db.prepare('SELECT drive_pasta_id FROM contas WHERE id=?').get(contaId);
  if (row?.drive_pasta_id) return row.drive_pasta_id;
  const id = await caminho(contaId, ['KM', 'Assessor', 'Documentos']);
  db.prepare('UPDATE contas SET drive_pasta_id=? WHERE id=?').run(id, contaId);
  return id;
}
export async function definirPastaRaiz(contaId, linkOuId) {
  const id = extrairId(linkOuId); if (!id) throw new Error('Não reconheci o link/ID da pasta.');
  const d = auth(contaId);
  const r = await d.files.get({ fileId: id, fields: 'id,name,mimeType' }).catch(e => { throw traduzErro(e); });
  if (r.data.mimeType !== PASTA) throw new Error('Esse link não é de uma pasta.');
  db.prepare('UPDATE contas SET drive_pasta_id=? WHERE id=?').run(id, contaId);
  return { id, nome: r.data.name };
}
/** Pasta destino: Raiz/Empresa/Tipo/Ano */
export async function pastaDestino(contaId, { empresa, tipo, ano }) {
  return caminho(contaId, [empresa || 'Geral', tipo || 'Outros', String(ano || new Date().getFullYear())], await pastaRaiz(contaId));
}
export async function upload(contaId, { nome, mime, bytes, pastaId, descricao }) {
  const d = auth(contaId);
  const r = await d.files.create({
    requestBody: { name: nome, parents: [pastaId], description: descricao || undefined },
    media: { mimeType: mime || 'application/octet-stream', body: Readable.from(Buffer.from(bytes)) },
    fields: 'id,name,webViewLink,size,mimeType',
  }).catch(e => { throw traduzErro(e); });
  return { id: r.data.id, nome: r.data.name, link: r.data.webViewLink, tamanho: Number(r.data.size || 0), mime: r.data.mimeType };
}
export async function metadados(contaId, fileId) {
  const r = await auth(contaId).files.get({ fileId, fields: 'id,name,mimeType,size,webViewLink,parents,createdTime' }).catch(e => { throw traduzErro(e); });
  return { id: r.data.id, nome: r.data.name, mime: r.data.mimeType, tamanho: Number(r.data.size || 0), link: r.data.webViewLink, pais: r.data.parents || [] };
}
export async function baixar(contaId, fileId) {
  const r = await auth(contaId).files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }).catch(e => { throw traduzErro(e); });
  return r.data;
}
export async function mover(contaId, fileId, pastaId, novoNome) {
  const d = auth(contaId); const m = await metadados(contaId, fileId);
  const r = await d.files.update({ fileId, addParents: pastaId, removeParents: m.pais.join(','), requestBody: novoNome ? { name: novoNome } : {}, fields: 'id,name,webViewLink' }).catch(e => { throw traduzErro(e); });
  return { id: r.data.id, nome: r.data.name, link: r.data.webViewLink };
}
export async function copiar(contaId, fileId, pastaId) {
  const r = await auth(contaId).files.copy({ fileId, requestBody: { parents: [pastaId] }, fields: 'id,name,webViewLink' }).catch(e => { throw traduzErro(e); });
  return { id: r.data.id, nome: r.data.name, link: r.data.webViewLink };
}
export async function criarTexto(contaId, { nome, conteudo, pastaId }) {
  return upload(contaId, { nome, mime: 'text/plain', bytes: Buffer.from(conteudo, 'utf8'), pastaId });
}
export async function buscarNoDrive(contaId, texto, max = 10) {
  const raiz = await pastaRaiz(contaId);
  const r = await auth(contaId).files.list({ q: `fullText contains '${esc(texto)}' and trashed=false and mimeType!='${PASTA}'`, fields: 'files(id,name,webViewLink,mimeType,modifiedTime)', pageSize: max, orderBy: 'modifiedTime desc' }).catch(e => { throw traduzErro(e); });
  return (r.data.files || []).map(f => ({ id: f.id, nome: f.name, link: f.webViewLink, mime: f.mimeType, modificado: f.modifiedTime, raiz }));
}
export async function linkPasta(contaId, pastaId) { return `https://drive.google.com/drive/folders/${pastaId}`; }
