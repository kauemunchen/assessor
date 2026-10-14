// Modo edição da MIA: fluxo guiado (determinístico) para criar Story no padrão KM.
// Só abre quando o dono pede ("MIA, quero editar…", "vamos criar um story"). Fora dele, nada disso aparece.
// Regra dura: toda arte sai do render já com o símbolo KM no canto padrão (render/template_story.py → marca_dagua).
import { db } from '../db/index.js';
import * as render from '../integracoes/render.js';
import * as cdn from '../integracoes/cloudinary.js';
import * as gemini from '../integracoes/gemini.js';
import { gerarJSON } from '../integracoes/gemini.js';

// Sessão persistida no SQLite (sobrevive a deploy/restart). A foto fica em memória; se o processo reiniciar, pede de novo.
const fotos = new Map(); const videos = new Map();
const TTL = 30 * 60000;
db.exec('CREATE TABLE IF NOT EXISTS edicao_sessoes (chat_id TEXT PRIMARY KEY, estado TEXT, t INTEGER)');
const sessoes = {
  get(chatId) { const r = db.prepare('SELECT estado, t FROM edicao_sessoes WHERE chat_id=?').get(chatId); if (!r) return undefined; const e = JSON.parse(r.estado); e.t = r.t; e.foto = fotos.get(chatId) || null; e.video = videos.get(chatId) || null; return e; },
  set(chatId, e) { const { foto, video, ...resto } = e; if (foto) fotos.set(chatId, foto); if (video) videos.set(chatId, video); db.prepare('INSERT INTO edicao_sessoes (chat_id, estado, t) VALUES (?,?,?) ON CONFLICT(chat_id) DO UPDATE SET estado=excluded.estado, t=excluded.t').run(chatId, JSON.stringify(resto), e.t || Date.now()); },
  delete(chatId) { fotos.delete(chatId); videos.delete(chatId); db.prepare('DELETE FROM edicao_sessoes WHERE chat_id=?').run(chatId); },
};
const salvar = (chatId, e) => sessoes.set(chatId, e);
// Gatilho tolerante a transcrição de áudio ("Mia, eu quero editar um vídeo para story.") e a variações
export const GATILHO = /\b(editar|edi[çc][ãa]o|criar|montar|fazer)\b[^.!?\n]{0,40}\b(story|storie|stories|est[óo]ria|hist[óo]ria)\b|\b(editar|edita|edite)\b[^.!?\n]{0,20}\b(v[íi]deo|foto)\b|\bmodo edi[çc][ãa]o\b|\b(colocar|p[ôo]r|incluir|adicionar|colocando|pondo)\s+(texto|frase|legenda)\b/i;
const SAIR = /^(cancela|cancelar|sair|deixa|para|parar|esquece)\b/i;

export const MODELOS_FOTO = [
  { n: 1, id: 'foto_faixa', nome: 'Foto + faixa de texto', pede: 'texto' },
  { n: 0, id: 'so_marca', nome: 'Sem render — só a marca KM na foto', pede: null },
];
export const MODELOS_VIDEO = [
  { n: 1, id: 'v_legenda', nome: 'Legenda automática (transcrição queimada no vídeo)' },
  { n: 2, id: 'v_letreiro', nome: 'Frase/letreiro na faixa KM (texto seu)' },
  { n: 3, id: 'v_enquadrar', nome: 'Ajustar para 9:16 (1080x1920)' },
  { n: 4, id: 'v_cortar', nome: 'Cortar duração (ex.: primeiros 60 s)' },
  { n: 0, id: 'v_so_logo', nome: 'Sem edição — só o logo KM no canto' },
];
export const MODELOS_TEXTO = [
  { n: 1, id: 'frase', nome: 'Frase do dia', pede: 'texto' },
  { n: 2, id: 'chamada_feed', nome: 'Chamada para o último post do feed', pede: 'titulo' },
  { n: 3, id: 'passos', nome: '3 passos / lista', pede: 'titulo+itens' },
  { n: 4, id: 'pergunta', nome: 'Pergunta aberta (resposta no direct)', pede: 'texto' },
  { n: 5, id: 'data', nome: 'Data / contagem (aquecer post ou evento)', pede: 'titulo+quando' },
];
const lista = (ms) => ms.map(m => `${m.n}️⃣ ${m.nome}`).join('\n');

export function emEdicao(chatId) { const e = sessoes.get(chatId); if (!e) return null; if (Date.now() - e.t > TTL) { sessoes.delete(chatId); return null; } return e; }
export function encerrar(chatId) { sessoes.delete(chatId); }

/** Entrada do modo edição. Se já veio mídia junto, pula a pergunta de base. */
let contaIdAtual = null;
export function iniciar(chatId, { fotoBytes, videoUrl, videoBytes, texto = '', contaId = null } = {}) {
  contaIdAtual = contaId;
  const e = { t: Date.now(), passo: 'base', dados: {}, baseEsperada: /v[íi]deo/i.test(texto) ? 'video' : /foto/i.test(texto) ? 'foto' : null };
  if (fotoBytes) { e.base = 'foto'; e.foto = fotoBytes; e.passo = 'modelo'; }
  else if (videoUrl) { e.base = 'video'; e.videoUrl = videoUrl; e.passo = 'modelo'; }
  else if (videoBytes) { e.base = 'video'; e.video = videoBytes; e.passo = 'audio'; }
  if (e.passo === 'base' && /\b(esse|este|aquele|[úu]ltimo|o)\s+v[íi]deo\b/i.test(texto)) {
    // "editar esse vídeo" → pega o último vídeo da biblioteca desta conta
    const ult = contaIdAtual && db.prepare("SELECT url FROM biblioteca WHERE conta_id=? AND tipo='video' ORDER BY id DESC LIMIT 1").get(contaIdAtual);
    if (ult) { e.base = 'video'; e.videoUrlPendente = ult.url; e.passo = 'audio'; }
  }
  sessoes.set(chatId, e);
  if (e.passo === 'audio' && e.videoUrlPendente) return `Vou usar o último vídeo que você mandou. Manter o som?\n1️⃣ Manter áudio\n2️⃣ Retirar áudio`;
  if (e.passo === 'audio') return perguntaAudio(e);
  if (e.passo === 'base' && e.baseEsperada === 'video') return '🎬 Modo edição de vídeo para Story. Manda o vídeo (até 20 MB) ou o link dele no Drive.';
  if (e.passo === 'base' && e.baseEsperada === 'foto') return '🎬 Modo edição de foto para Story. Manda a foto.';
  if (e.passo === 'base') return '🎬 Modo edição de Story. Qual é a base?\n1️⃣ Foto\n2️⃣ Vídeo\n3️⃣ Só texto (fundo KM)\n\n(ou mande a foto/vídeo agora · "cancela" sai)';
  return perguntaModelo(e);
}
const perguntaAudio = (e) => `Vídeo recebido${e.vinfo ? ` (${e.vinfo.w}x${e.vinfo.h}, ${Math.round(e.vinfo.dur)} s${e.vinfo.audio === false ? ', sem áudio' : ''})` : ''}. Manter o som?\n1️⃣ Manter áudio\n2️⃣ Retirar áudio`;
function perguntaModelo(e) {
  if (e.base === 'foto') return `Foto recebida. Modelo:\n${lista(MODELOS_FOTO)}\n\nResponda o número.`;
  if (e.base === 'texto') return `Modelo de story em texto:\n${lista(MODELOS_TEXTO)}\n\nResponda o número.`;
  return `Vídeo recebido${e.vinfo ? ` (${e.vinfo.w}x${e.vinfo.h}, ${Math.round(e.vinfo.dur)} s)` : ''}. O que aplicar? Pode combinar: "1 e 2", "2 3 4".\n${lista(MODELOS_VIDEO)}\n\nO logo KM entra sempre.`;
}

/** Trata a mensagem do dono dentro do modo. Devolve string (continua), {foto, texto} (prévia) ou null (não é dele). */
export async function tratar(msg, conta, canal) {
  const e = emEdicao(msg.chatId); if (!e) return null; e.t = Date.now();
  try { return await _tratar(e, msg, conta, canal); } finally { if (emEdicao(msg.chatId)) salvar(msg.chatId, e); }
}
async function _tratar(e, msg, conta, canal) {
  const t = (msg.texto || '').trim();
  if (SAIR.test(t)) { encerrar(msg.chatId); return 'Saí do modo edição. Nada foi publicado.'; }

  // mídia chegando dentro do modo
  if (msg.tipo === 'imagem' && msg.midia) { e.base = 'foto'; e.foto = Buffer.from(await canal.baixarMidia(msg.midia.ref)); e.passo = 'modelo'; return perguntaModelo(e); }
  if (msg.tipo === 'video' && msg.midia) {
    if (msg.midia.tamanho > 20 * 1024 * 1024 && !process.env.TELEGRAM_API_BASE) return 'Vídeo acima de 20 MB: suba no Drive e cole o link aqui dentro do modo edição.';
    e.base = 'video'; e.video = Buffer.from(await canal.baixarMidia(msg.midia.ref)); e.passo = 'audio';
    try { e.vinfo = await render.infoVideo(e.video); } catch {}
    return perguntaAudio(e);
  }
  if (msg.tipo === 'texto' && /drive\.google\.com\/(file|open|uc)/.test(t) && (e.passo === 'base' || e.base === 'video')) {
    const drive = await import('../integracoes/google-drive.js'); const id = drive.extrairId(t); const meta = await drive.metadados(conta.id, id);
    if (!/^video\//.test(meta.mime)) return 'Esse link não é de vídeo.';
    e.base = 'video'; e.video = Buffer.from(await drive.baixar(conta.id, id)); e.passo = 'audio';
    try { e.vinfo = await render.infoVideo(e.video); } catch {}
    return perguntaAudio(e);
  }
  if (e.passo === 'audio') {
    if (/^1\b|mant[eé]m|manter|com (som|[áa]udio)/i.test(t)) e.semAudio = false;
    else if (/^2\b|retira|tira|remove|sem (som|[áa]udio)|mudo/i.test(t)) e.semAudio = true;
    else return 'Responda 1 (manter áudio) ou 2 (retirar áudio).';
    e.passo = 'modelo'; return perguntaModelo(e);
  }

  if (e.passo === 'base') {
    if (/^1\b|foto/i.test(t)) return 'Manda a foto.';
    if (/^2\b|v[íi]deo/i.test(t)) return 'Manda o vídeo (ou o link do Drive).';
    if (/^3\b|texto/i.test(t)) { e.base = 'texto'; e.passo = 'modelo'; return perguntaModelo(e); }
    return 'Responda 1 (foto), 2 (vídeo) ou 3 (só texto).';
  }
  if (e.passo === 'modelo' && e.base === 'video') {
    const ns = [...t.matchAll(/\d/g)].map(m => +m[0]); if (!ns.length) return `Responda com os números:\n${lista(MODELOS_VIDEO)}`;
    e.ops = { enquadrar: ns.includes(3) ? '9:16' : null, legenda: ns.includes(1), letreiro: ns.includes(2), cortar: ns.includes(4) };
    if (!e.ops.enquadrar && e.vinfo && (Math.abs(e.vinfo.w / e.vinfo.h - 9 / 16) > 0.05 || e.vinfo.h < 1900)) e.ops.enquadrar = '9:16'; // Story/Reels sempre em 1080x1920
    e.modelo = { id: 'video', nome: 'Vídeo editado', pede: null };
    e.passo = e.ops.letreiro ? 'v_texto' : e.ops.cortar ? 'v_corte' : 'render';
    if (e.passo === 'v_texto') return 'Qual a frase da faixa? (curta; palavra dourada entre *asteriscos*)';
    if (e.passo === 'v_corte') return `Cortar como? (ex.: "primeiros 60 s", "de 5 a 35", "até 15")${e.vinfo ? ` — o vídeo tem ${Math.round(e.vinfo.dur)} s` : ''}`;
    return gerar(e, msg.chatId, conta);
  }
  if (e.passo === 'v_texto') {
    e.dados.texto = limpo(t); e.dados.palavra_dourada = palavraDourada(t) || escolherDourada(e.dados.texto);
    e.passo = e.ops.cortar ? 'v_corte' : 'render';
    if (e.passo === 'v_corte') return `Cortar como? (ex.: "primeiros 60 s", "de 5 a 35")${e.vinfo ? ` — ${Math.round(e.vinfo.dur)} s no total` : ''}`;
    return gerar(e, msg.chatId, conta);
  }
  if (e.passo === 'v_corte') {
    const m1 = t.match(/de\s+(\d+)\s*(?:s)?\s*(?:a|até)\s*(\d+)/i), m2 = t.match(/(\d+)\s*s?\b/);
    if (m1) e.ops.corte = { inicio: +m1[1], duracao: +m1[2] - +m1[1] }; else if (m2) e.ops.corte = { inicio: 0, duracao: +m2[1] }; else return 'Não entendi. Ex.: "primeiros 60 s" ou "de 5 a 35".';
    e.passo = 'render'; return gerar(e, msg.chatId, conta);
  }
  if (e.passo === 'modelo') {
    const ms = e.base === 'foto' ? MODELOS_FOTO : MODELOS_TEXTO;
    const n = parseInt(t.match(/\d+/)?.[0] ?? '-1', 10); const m = ms.find(x => x.n === n);
    if (!m) return `Não entendi. Responda o número:\n${lista(ms)}`;
    e.modelo = m; e.passo = m.pede ? 'conteudo' : 'render';
    if (e.passo === 'render') return gerar(e, msg.chatId, conta);
    return pedirConteudo(e);
  }
  if (e.passo === 'conteudo') {
    if (/^(sugere|sugest[ãa]o|voc[êe] escolhe|escolhe)\b/i.test(t)) { await sugerir(e, conta, t); return `Sugestão:\n${resumoConteudo(e)}\n\nAprova? (sim / ou mande o seu texto)`; }
    if (/^(sim|aprov|ok|pode|isso)\b/i.test(t) && e.dados.texto) { e.passo = 'render'; return gerar(e, msg.chatId, conta); }
    absorverConteudo(e, t); e.passo = 'render'; return gerar(e, msg.chatId, conta);
  }
  if (e.passo === 'previa') {
    if (/^(sim|aprov|ok|boa|fechou|perfeit)/i.test(t)) { e.passo = 'destino'; return e.base === 'video' ? 'Fechado. Story ou Reels? E o que faço?\n1️⃣ Publicar agora\n2️⃣ Agendar (diga dia e hora)\n3️⃣ Guardar na biblioteca\n(ex.: "story 1", "reels 2 amanhã 19h")' : 'Fechado. O que faço?\n1️⃣ Publicar agora\n2️⃣ Agendar (diga dia e hora)\n3️⃣ Guardar na biblioteca'; }
    if (e.base === 'video' && /\b(sem|tira|retira|remove)\b.*\b(som|[áa]udio)\b|\bmudo\b/i.test(t)) { e.semAudio = true; return gerar(e, msg.chatId, conta); }
    if (e.base === 'video' && /\b(com|mant[eé]m|manter|volta)\b.*\b(som|[áa]udio)\b/i.test(t)) { e.semAudio = false; return gerar(e, msg.chatId, conta); }
    if (e.base === 'video' && /rodap[ée]|embaixo|no p[ée]|topo|em cima|no meio|centro|mais (alto|baixo)/i.test(t)) {
      e.dados.posicao = /rodap[ée]|embaixo|no p[ée]|mais baixo/i.test(t) ? 'rodape' : /topo|em cima|mais alto/i.test(t) ? 'topo' : 'meio';
      if (!e.ops) e.ops = {}; e.ops.letreiro = true; return gerar(e, msg.chatId, conta);
    }
    if (/^(troca|muda|ajusta|outra|refaz|dourad|palavra)/i.test(t)) { absorverConteudo(e, t.replace(/^(troca|muda|ajusta|refaz)\s*(o|a|para|pra)?\s*/i, '')); return gerar(e, msg.chatId, conta); }
    if (/^(outro modelo|modelo)/i.test(t)) { e.passo = 'modelo'; return perguntaModelo(e); }
    return 'Aprova a prévia? (sim · "troca o texto para …" · "outro modelo" · "cancela")';
  }
  if (e.passo === 'destino') {
    const { criarStoryPost } = await import('../ferramentas/social.js');
    if (e.base === 'video' && !e.formatoVideo) { if (/reels?/i.test(t)) e.formatoVideo = 'reels'; else if (/story|stories/i.test(t)) e.formatoVideo = 'story'; else return 'Publicar como Story (sem legenda, ≤60 s) ou Reels (com legenda)? Responda "story" ou "reels" junto com a opção (ex.: "story 1", "reels agenda amanhã 19h").'; }
    if (e.base === 'video' && e.formatoVideo === 'reels') {
      const soc = await import('../ferramentas/social.js');
      if (/\b1\b|agora|publica/i.test(t)) { const r = await soc.executar('criar_post', { formato: 'reels', tema: e.dados.texto || 'Reels', legenda: e.dados.texto || '', midia_url: e.url }, conta, {}); try { const p = await soc.publicarPost(conta.id, r.id); encerrar(msg.chatId); return `📣 Reels publicado (${p.ig_media_id}). Legenda: "${e.dados.texto || ''}" — peça à MIA para ajustar a legenda no feed se quiser.`; } catch (err) { encerrar(msg.chatId); return `❌ ${err.message}`; } }
      const dt = extrairData(t); if (dt) { const r = await soc.executar('criar_post', { formato: 'reels', tema: e.dados.texto || 'Reels', legenda: e.dados.texto || '', midia_url: e.url, data: dt }, conta, {}); encerrar(msg.chatId); return `📅 Reels #${r.id} agendado para ${dt.replace('T', ' às ')}. Diga "MIA, ajusta a legenda do post #${r.id}" para a legenda do manual.`; }
      if (/\b3\b|biblioteca|guarda/i.test(t)) { encerrar(msg.chatId); return '📚 Vídeo editado já está na biblioteca. Para usar: "MIA, biblioteca vídeos".'; }
      return 'Responda 1 (publicar agora), 2 + dia/hora (agendar) ou 3 (guardar).';
    }
    if (/\b1\b|agora|publica/i.test(t)) { const r = await criarStoryPost(conta.id, { midia_url: e.url, tema: e.dados.texto || e.dados.titulo, publicarAgora: true }); encerrar(msg.chatId); return r.erro ? `❌ ${r.erro}` : `📣 Story publicado (${r.ig_media_id}).`; }
    if (/\b3\b|biblioteca|guarda/i.test(t)) { db.prepare("UPDATE biblioteca SET descricao=COALESCE(descricao, ?) WHERE url=? AND conta_id=?").run(e.dados.texto || e.dados.titulo || e.modelo.nome, e.url, conta.id); encerrar(msg.chatId); return `📚 Guardado na biblioteca: "${(e.dados.texto || e.dados.titulo || e.modelo.nome).slice(0, 60)}". Para usar depois: "MIA, biblioteca".`; }
    const dt = extrairData(t);
    if (/\b2\b|agenda/i.test(t) && !dt) return 'Qual dia e hora? (ex.: "amanhã 12:00", "16/10 18:30")';
    if (dt) { const r = await criarStoryPost(conta.id, { midia_url: e.url, tema: e.dados.texto || e.dados.titulo, data: dt }); encerrar(msg.chatId); return `📅 Story #${r.post_id} agendado para ${dt.replace('T', ' às ')} (entrou na agenda, marcador Social Media).`; }
    return 'Responda 1 (publicar agora), 2 + dia/hora (agendar) ou 3 (guardar).';
  }
  return null;
}

function pedirConteudo(e) {
  switch (e.modelo.pede) {
    case 'texto': return `Qual o texto? (curto; marque a palavra em dourado com *asteriscos*, ou diga "sugere")`;
    case 'titulo': return 'Qual o título do post que vou chamar? (ou "sugere" para usar o último publicado)';
    case 'titulo+itens': return 'Mande o título e os itens, um por linha:\nTítulo\n- item 1\n- item 2\n- item 3\n(ou "sugere" com um tema)';
    case 'titulo+quando': return 'Mande: título | quando | detalhe (opcional)\nex.: Novo Reels sobre delegação | Quinta, 19h | Como sair do operacional';
    default: return 'Mande o conteúdo.';
  }
}
function palavraDourada(t) { const m = t.match(/\*([^*]{2,30})\*/); return m ? m[1].trim() : null; }
function limpo(t) { return t.replace(/\*([^*]+)\*/g, '$1').trim(); }
function absorverConteudo(e, t) {
  const d = e.dados; d.palavra_dourada = palavraDourada(t) || d.palavra_dourada;
  if (e.modelo.pede === 'titulo+itens') {
    const linhas = limpo(t).split('\n').map(x => x.trim()).filter(Boolean);
    d.titulo = linhas.shift() || d.titulo; d.itens = linhas.map(x => x.replace(/^[-•*\d.)\s]+/, '')).filter(Boolean).slice(0, 5);
  } else if (e.modelo.pede === 'titulo+quando') {
    const [ti, qd, det] = limpo(t).split('|').map(x => x?.trim()); d.titulo = ti || d.titulo; d.quando = qd || d.quando; d.detalhe = det || d.detalhe;
  } else if (e.modelo.pede === 'titulo') d.titulo = limpo(t);
  else d.texto = limpo(t);
  if (!d.palavra_dourada) d.palavra_dourada = escolherDourada(d.texto || d.titulo || '');
}
function escolherDourada(t) { const ws = t.replace(/[^\wÀ-ÿ\s]/g, '').split(/\s+/).filter(w => w.length > 5); return ws.sort((a, b) => b.length - a.length)[0] || null; }
function resumoConteudo(e) { const d = e.dados; return [d.titulo && `Título: ${d.titulo}`, d.texto && `Texto: ${d.texto}`, d.itens?.length && `Itens: ${d.itens.join(' · ')}`, d.quando && `Quando: ${d.quando}`, d.palavra_dourada && `Dourado: ${d.palavra_dourada}`].filter(Boolean).join('\n'); }
async function sugerir(e, conta, pedido) {
  const tema = pedido.replace(/^(sugere|sugest[ãa]o)\s*(com|sobre|de)?\s*/i, '').trim();
  if (e.modelo.id === 'chamada_feed') {
    const ult = db.prepare("SELECT tema, legenda, midia_url, formato FROM posts WHERE conta_id=? AND status='publicado' ORDER BY publicado_em DESC LIMIT 1").get(conta.id);
    e.dados.titulo = ult?.tema || (ult?.legenda || '').split('\n')[0] || 'Novo post no feed'; e.dados.capa_url = ult?.midia_url?.startsWith('[') ? JSON.parse(ult.midia_url)[0] : ult?.midia_url; e.dados.formato = ult?.formato || 'carrossel';
  } else {
    const j = await gerarJSON(`Você escreve stories do Instagram de Kauê München (gestão, processos, delegação, empresário que saiu do operacional). Tom direto, frases curtas, sem clichê. Modelo: ${e.modelo.id}. Tema: ${tema || 'livre, do pilar GESTÃO'}.
Responda JSON: {"texto": "frase/pergunta curta (máx 12 palavras)", "titulo": "título curto", "itens": ["3 itens curtos"], "quando": "", "palavra_dourada": "UMA palavra do texto/título"}`);
    Object.assign(e.dados, Object.fromEntries(Object.entries(j).filter(([, v]) => v && (!Array.isArray(v) || v.length))));
  }
  if (!e.dados.palavra_dourada) e.dados.palavra_dourada = escolherDourada(e.dados.texto || e.dados.titulo || '');
}
function extrairData(t) {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const hm = t.match(/(\d{1,2})[:h](\d{2})?/); if (!hm) return null;
  const hh = String(hm[1]).padStart(2, '0'), mm = hm[2] || '00';
  let d = new Date(agora);
  const dm = t.match(/(\d{1,2})\/(\d{1,2})/);
  if (dm) d = new Date(agora.getFullYear(), +dm[2] - 1, +dm[1]);
  else if (/amanh/i.test(t)) d.setDate(d.getDate() + 1);
  else if (/depois de amanh/i.test(t)) d.setDate(d.getDate() + 2);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${hh}:${mm}`;
}

async function gerar(e, chatId, conta) {
  const d = e.dados; let out;
  if (e.base === 'foto' && !e.foto) { e.passo = 'modelo'; return 'Perdi a foto (reinício do sistema). Manda ela de novo, por favor.'; }
  if (e.base === 'video') {
    if (!e.video && e.videoUrlPendente) { try { e.video = Buffer.from(await fetch(e.videoUrlPendente).then(r => r.arrayBuffer())); videos.set(chatId, e.video); try { e.vinfo = await render.infoVideo(e.video); } catch {} } catch {} }
    if (!e.video) { e.passo = 'base'; return 'Perdi o vídeo (reinício do sistema). Manda ele de novo, por favor.'; }
    const ops = { sem_audio: !!e.semAudio, enquadrar: e.ops.enquadrar || null, cortar: e.ops.corte || null, letreiro: e.ops.letreiro ? { texto: d.texto, palavra_dourada: d.palavra_dourada, posicao: d.posicao || 'base' } : null, legendas: null };
    if (e.ops.legenda && e.semAudio) d.aviso = 'legenda automática ignorada: você escolheu retirar o áudio';
    if (e.ops.legenda && !e.semAudio) {
      try { const audio = await render.audioDoVideo(e.video); const dur = e.vinfo?.dur || 60; ops.legendas = await gemini.transcreverComTempos(audio, 'audio/mpeg', dur); if (ops.corte) ops.legendas = ops.legendas.map(x => ({ ...x, inicio: x.inicio - ops.corte.inicio, fim: x.fim - ops.corte.inicio })).filter(x => x.fim > 0); if (!ops.legendas.length) d.aviso = 'não detectei fala para legendar'; }
      catch (err) { d.aviso = `legenda automática falhou: ${err.message}`; }
    }
    const r = await render.editarVideo(e.video, ops);
    const v = await cdn.uploadVideo(r.bytes, { pasta: `assessor/${conta.id}/videos` });
    e.url = v.url; e.vinfoOut = r.info;
    db.prepare('INSERT INTO biblioteca (conta_id, url, marcada_url, tipo, origem, descricao, largura, altura, duracao) VALUES (?,?,?,?,?,?,?,?,?)').run(conta.id, v.url, v.url, 'video', 'edicao:video', (d.texto || 'Vídeo editado').slice(0, 120), v.largura || null, v.altura || null, v.duracao || null);
    e.passo = 'previa';
    return { video: e.url, texto: `Prévia · ${r.info.saida || ''} · ${e.semAudio ? 'sem áudio' : 'com áudio'} · logo ${r.info.logo}${r.info.legendas ? ` · ${r.info.legendas} legendas` : ''}${d.aviso ? `\n⚠️ ${d.aviso}` : ''}\n\nAprova? (sim · "troca o texto para …" · "no rodapé" / "no topo" / "no meio" · "cancela")` };
  }
  if (e.modelo.id === 'so_marca') { out = await render.marcaDagua(e.foto); }
  else {
    let capa; if (d.capa_url) { try { capa = Buffer.from(await fetch(d.capa_url).then(r => r.arrayBuffer())); } catch {} }
    out = await render.story({ modelo: e.modelo.id, texto: d.texto, titulo: d.titulo, itens: d.itens, quando: d.quando, detalhe: d.detalhe, palavra_dourada: d.palavra_dourada, etiqueta: d.etiqueta, formato: d.formato }, { foto: e.foto, capa });
  }
  e.url = await cdn.upload(out.bytes, { pasta: `assessor/${conta.id}/stories` });
  db.prepare('INSERT INTO biblioteca (conta_id, url, marcada_url, tipo, origem, descricao) VALUES (?,?,?,?,?,?)').run(conta.id, e.url, e.url, 'story', `edicao:${e.modelo.id}`, (d.texto || d.titulo || e.modelo.nome).slice(0, 120));
  e.passo = 'previa';
  return { foto: e.url, texto: `Prévia · ${e.modelo.nome}${out.info?.logo ? ` · logo ${out.info.logo}` : ''}\n\nAprova? (sim · "troca o texto para …" · "outro modelo" · "cancela")` };
}
