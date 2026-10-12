// Portado de crm_bot/scheduler.py: lembretes a cada minuto + resumos por conta nos horários de persona_config.
import cron from 'node-cron';
import { db } from '../db/index.js';
import { configPersona, modulosAtivos } from '../db/contas.js';
import { montarPrompt } from '../orquestrador/montador-prompt.js';
import { modelo } from '../integracoes/gemini.js';
import * as gcal from '../integracoes/google-calendar.js';
import { publicarPost } from '../ferramentas/social.js';
import { avisosDeVencimento } from '../ferramentas/documentos.js';

const TZ = process.env.TZ || 'America/Sao_Paulo';
const agoraLocal = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
const hhmm = (d) => d.toTimeString().slice(0, 5);

function proximaOcorrencia(iso, rec) {
  const d = new Date(iso);
  if (rec === 'diario') d.setDate(d.getDate() + 1);
  else if (rec === 'semanal') d.setDate(d.getDate() + 7);
  else if (rec === 'mensal') d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString().slice(0, 16);
}

async function dispararLembretes(canal) {
  const agora = agoraLocal().toISOString().slice(0, 16);
  for (const l of db.prepare('SELECT * FROM lembretes WHERE enviado=0 AND quando<=?').all(agora)) {
    try {
      await canal.enviar(l.conta_id, l.destino_chat_id, `🔔 ${l.texto}`);
      db.prepare('UPDATE lembretes SET enviado=1 WHERE id=?').run(l.id);
      const prox = proximaOcorrencia(l.quando, l.recorrencia);
      if (prox) db.prepare('INSERT INTO lembretes (conta_id, modulo, texto, quando, recorrencia, destino_chat_id) VALUES (?,?,?,?,?,?)').run(l.conta_id, l.modulo, l.texto, prox, l.recorrencia, l.destino_chat_id);
    } catch (e) { console.error('lembrete', l.id, e.message); }
  }
}

async function resumoDoDia(canal, conta, chatId) {
  const ini = agoraLocal(); ini.setHours(0, 0, 0, 0); const fim = new Date(ini); fim.setDate(fim.getDate() + 1);
  let eventos = []; try { eventos = await gcal.listarEventos(conta.id, { inicio: ini.toISOString(), fim: fim.toISOString() }); } catch {}
  const lembretes = db.prepare('SELECT texto, quando FROM lembretes WHERE conta_id=? AND enviado=0 AND quando BETWEEN ? AND ?').all(conta.id, ini.toISOString().slice(0, 16), fim.toISOString().slice(0, 16));
  const tarefas = db.prepare(`SELECT titulo, responsavel, prazo FROM tarefas WHERE conta_id=? AND status='aberta' AND prazo<=?`).all(conta.id, fim.toISOString().slice(0, 10));
  const retornos = db.prepare(`SELECT pessoa, assunto, direcao FROM retornos WHERE conta_id=? AND status='aberto'`).all(conta.id);
  const dados = JSON.stringify({ eventos: eventos.map(e => ({ h: (e.start?.dateTime || '').slice(11, 16), t: e.summary, local: e.location })), lembretes, tarefas, retornos });
  const prompt = montarPrompt({ modulo: 'diretor', conta, ativos: modulosAtivos(conta.id) });
  const r = await modelo({ systemInstruction: prompt }).generateContent(`Monte o resumo do dia para o dono com estes dados (JSON). Curto, por blocos, sem floreio:\n${dados}`);
  await canal.enviar(conta.id, chatId, r.response.text());
}

async function avisarVencimentos(canal) {
  for (const u of db.prepare("SELECT u.conta_id, u.chat_id FROM usuarios u JOIN modulos m ON m.conta_id=u.conta_id AND m.modulo='documentos' AND m.ligado=1 WHERE u.papel='dono'").all()) {
    try { const avisos = avisosDeVencimento(u.conta_id); if (avisos.length) await canal.enviar(u.conta_id, u.chat_id, `⏰ Vencimentos:\n${avisos.join('\n')}`); }
    catch (e) { console.error('vencimentos', u.conta_id, e.message); }
  }
}

async function publicarAgendados(canal) {
  const agora = agoraLocal().toISOString().slice(0, 16);
  for (const p of db.prepare("SELECT p.*, u.chat_id FROM posts p JOIN usuarios u ON u.conta_id=p.conta_id AND u.papel='dono' WHERE p.status='agendado' AND p.data<=?").all(agora)) {
    try { const r = await publicarPost(p.conta_id, p.id); await canal.enviar(p.conta_id, p.chat_id, `📣 Post #${p.id} publicado no Instagram (${r.ig_media_id}).`); }
    catch (e) { db.prepare("UPDATE posts SET status='erro' WHERE id=?").run(p.id); await canal.enviar(p.conta_id, p.chat_id, `⚠️ Post #${p.id} não publicou: ${e.message}`).catch(() => {}); }
  }
}

export function iniciarRotinas(canal) {
  cron.schedule('* * * * *', async () => {
    await dispararLembretes(canal);
    await publicarAgendados(canal).catch(e => console.error('publicarAgendados', e.message));
    const agora = hhmm(agoraLocal());
    for (const u of db.prepare(`SELECT u.chat_id, c.* FROM usuarios u JOIN contas c ON c.id=u.conta_id WHERE u.papel='dono'`).all()) {
      const cfg = configPersona(u.id, 'diretor');
      if (cfg.hora_resumo?.replace('h', ':00').padStart(5, '0') === agora) resumoDoDia(canal, u, u.chat_id).catch(e => console.error('resumo', e.message));
    }
  }, { timezone: TZ });
  cron.schedule('0 8 * * *', () => avisarVencimentos(canal), { timezone: TZ });
}
