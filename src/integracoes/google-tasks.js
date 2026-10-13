// Google Tasks do dono (escopo tasks, autorizado no "conectar google").
import { google } from 'googleapis';
import { db } from '../db/index.js';
function auth(contaId) {
  const row = db.prepare('SELECT token_json FROM google_auth WHERE conta_id=?').get(contaId);
  if (!row) throw new Error('Google não conectado. Diga "conectar google".');
  const tok = JSON.parse(row.token_json);
  if (!/auth\/tasks/.test(tok.scope || '')) throw new Error('A autorização atual não inclui o Google Tasks. Diga "conectar google" de novo e aceite "Criar, editar, organizar e excluir todas as suas tarefas".');
  const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  a.setCredentials(tok);
  a.on('tokens', (t) => db.prepare('UPDATE google_auth SET token_json=? WHERE conta_id=?').run(JSON.stringify({ ...tok, ...t }), contaId));
  return google.tasks({ version: 'v1', auth: a });
}
function traduzErro(e) {
  const m = String(e?.message || e);
  if (/has not been used in project|is disabled/i.test(m)) return new Error('A Google Tasks API não está ativada no projeto km-assistente. Ative em: https://console.cloud.google.com/apis/library/tasks.googleapis.com?project=km-assistente');
  if (/insufficient.*scope|insufficientPermissions/i.test(m)) return new Error('A autorização atual não inclui o Google Tasks. Diga "conectar google" e aceite as tarefas.');
  if (/invalid_grant/i.test(m)) return new Error('A autorização do Google expirou. Diga "conectar google" para renovar.');
  return new Error(`Google Tasks: ${m.slice(0, 200)}`);
}
export async function listarListas(contaId) {
  const r = await auth(contaId).tasklists.list({ maxResults: 50 }).catch(e => { throw traduzErro(e); });
  return (r.data.items || []).map(l => ({ id: l.id, nome: l.title }));
}
export async function obterOuCriarLista(contaId, nome) {
  if (!nome) return (await listarListas(contaId))[0] || { id: '@default', nome: 'Minhas tarefas' };
  const listas = await listarListas(contaId);
  const hit = listas.find(l => l.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (hit) return hit;
  const r = await auth(contaId).tasklists.insert({ requestBody: { title: nome } }).catch(e => { throw traduzErro(e); });
  return { id: r.data.id, nome: r.data.title };
}
export async function criarTarefa(contaId, { titulo, notas, prazo, lista }) {
  const l = await obterOuCriarLista(contaId, lista);
  const body = { title: titulo, notes: notas || undefined };
  if (prazo) body.due = new Date(prazo.length === 10 ? `${prazo}T12:00:00-03:00` : prazo).toISOString(); // Tasks ignora a hora; só a data conta
  const r = await auth(contaId).tasks.insert({ tasklist: l.id, requestBody: body }).catch(e => { throw traduzErro(e); });
  return { id: r.data.id, lista: l.nome, titulo: r.data.title, prazo: r.data.due?.slice(0, 10) || null, link: r.data.webViewLink || 'https://tasks.google.com' };
}
export async function listarTarefas(contaId, { lista, concluidas = false, max = 50 } = {}) {
  const listas = lista ? [await obterOuCriarLista(contaId, lista)] : await listarListas(contaId);
  const svc = auth(contaId); const out = [];
  for (const l of listas) {
    const r = await svc.tasks.list({ tasklist: l.id, showCompleted: concluidas, showHidden: concluidas, maxResults: max }).catch(e => { throw traduzErro(e); });
    for (const t of r.data.items || []) out.push({ id: t.id, lista: l.nome, lista_id: l.id, titulo: t.title, notas: t.notes || '', prazo: t.due?.slice(0, 10) || null, status: t.status === 'completed' ? 'concluída' : 'aberta' });
  }
  return out.sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
}
async function achar(contaId, id) {
  const todas = await listarTarefas(contaId, { max: 100 });
  return todas.find(t => t.id === id) || todas.find(t => t.titulo.toLowerCase() === String(id).toLowerCase());
}
export async function concluirTarefa(contaId, id) {
  const t = await achar(contaId, id); if (!t) throw new Error('Tarefa não encontrada.');
  await auth(contaId).tasks.patch({ tasklist: t.lista_id, task: t.id, requestBody: { status: 'completed' } }).catch(e => { throw traduzErro(e); });
  return { concluida: t.titulo };
}
export async function atualizarTarefa(contaId, id, { titulo, notas, prazo }) {
  const t = await achar(contaId, id); if (!t) throw new Error('Tarefa não encontrada.');
  const body = {}; if (titulo) body.title = titulo; if (notas != null) body.notes = notas; if (prazo) body.due = new Date(`${prazo.slice(0, 10)}T12:00:00-03:00`).toISOString();
  const r = await auth(contaId).tasks.patch({ tasklist: t.lista_id, task: t.id, requestBody: body }).catch(e => { throw traduzErro(e); });
  return { id: r.data.id, titulo: r.data.title, prazo: r.data.due?.slice(0, 10) || null };
}
