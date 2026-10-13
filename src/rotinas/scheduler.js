// Portado de crm_bot/scheduler.py: lembretes a cada minuto + resumos por conta nos horários de persona_config.
import cron from 'node-cron';
import { db } from '../db/index.js';
import { configPersona, modulosAtivos } from '../db/contas.js';
import { montarPrompt } from '../orquestrador/montador-prompt.js';
import { modelo } from '../integracoes/gemini.js';
import * as gcal from '../integracoes/google-calendar.js';
import { publicarPost } from '../ferramentas/social.js';
import { avisosDeVencimento } from '../ferramentas/documentos.js';
import { cobrarDelegadas } from '../orquestrador/equipe.js';

const TZ = process.env.TZ || 'America/Sao_Paulo';
// Hora local como texto "YYYY-MM-DDTHH:MM" (sem passar por UTC — evita o deslocamento de 3h)
const agoraISO = () => new Date().toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T').slice(0, 16);
const hojeISO = () => agoraISO().slice(0, 10);
const agoraLocal = () => new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
const hhmm = () => agoraISO().slice(11, 16);

function proximaOcorrencia(iso, rec) {
  const d = new Date(iso + (iso.length === 16 ? ':00' : '')); // interpretado como hora de parede
  if (rec === 'diario') d.setDate(d.getDate() + 1);
  else if (rec === 'semanal') d.setDate(d.getDate() + 7);
  else if (rec === 'mensal') d.setMonth(d.getMonth() + 1);
  else return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function dispararLembretes(canal) {
  const agora = agoraISO();
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
  const hoje = hojeISO(); const amanha = new Date(new Date(hoje + 'T12:00:00').getTime() + 864e5).toISOString().slice(0, 10);
  let eventos = []; try { eventos = await gcal.listarEventos(conta.id, { inicio: new Date(hoje + 'T00:00:00-03:00').toISOString(), fim: new Date(amanha + 'T00:00:00-03:00').toISOString() }); } catch {}
  const lembretes = db.prepare('SELECT texto, quando FROM lembretes WHERE conta_id=? AND enviado=0 AND quando BETWEEN ? AND ?').all(conta.id, hoje + 'T00:00', amanha + 'T00:00');
  const tarefas = db.prepare(`SELECT titulo, responsavel, prazo FROM tarefas WHERE conta_id=? AND status='aberta' AND prazo<=?`).all(conta.id, hoje);
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
  const agora = agoraISO();
  for (const p of db.prepare("SELECT p.*, u.chat_id FROM posts p JOIN usuarios u ON u.conta_id=p.conta_id AND u.papel='dono' WHERE p.status='agendado' AND p.data<=?").all(agora)) {
    try { const r = await publicarPost(p.conta_id, p.id); await canal.enviar(p.conta_id, p.chat_id, `📣 Post #${p.id} publicado no Instagram (${r.ig_media_id}).`); }
    catch (e) {
      const m = String(e.message || e); const token = /code":190|access token|OAuthException|invalidated|expired/i.test(m);
      db.prepare("UPDATE posts SET status='erro' WHERE id=?").run(p.id);
      const motivo = token ? 'o token do Instagram foi invalidado (senha alterada ou sessão encerrada pela Meta). Nenhum post sai até reconectar: gere um token novo e mande "conectar instagram <IG_USER_ID> <TOKEN>". Depois: "MIA, reagenda o post #' + p.id + '".' : m.slice(0, 300);
      await canal.enviar(p.conta_id, p.chat_id, `⚠️ Post #${p.id} (${(p.tema || '').slice(0, 50)}) não publicou às ${p.data.slice(11, 16)}: ${motivo}`).catch(() => {});
      if (token) { db.prepare("UPDATE posts SET status='erro' WHERE conta_id=? AND status='agendado'").run(p.conta_id); await canal.enviar(p.conta_id, p.chat_id, '⏸️ Pausei os demais posts agendados desta conta até o Instagram ser reconectado (ficam como "erro"; é só reagendar depois).').catch(() => {}); }
    }
  }
}

export function iniciarRotinas(canal) {
  cron.schedule('* * * * *', async () => {
    await dispararLembretes(canal);
    await publicarAgendados(canal).catch(e => console.error('publicarAgendados', e.message));
    const agora = hhmm();
    for (const u of db.prepare(`SELECT u.chat_id, c.* FROM usuarios u JOIN contas c ON c.id=u.conta_id WHERE u.papel='dono'`).all()) {
      const cfg = configPersona(u.id, 'diretor');
      if (cfg.hora_resumo?.replace('h', ':00').padStart(5, '0') === agora) resumoDoDia(canal, u, u.chat_id).catch(e => console.error('resumo', e.message));
    }
  }, { timezone: TZ });
  cron.schedule('0 8 * * *', () => avisarVencimentos(canal), { timezone: TZ });
  cron.schedule('30 8 * * 1-6', () => cobrarDelegadas().catch(e => console.error('cobrarDelegadas', e.message)), { timezone: TZ });
}
