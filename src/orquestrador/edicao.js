// Modo edição da MIA: fluxo guiado (determinístico) para criar Story no padrão KM.
// Só abre quando o dono pede ("MIA, quero editar…", "vamos criar um story"). Fora dele, nada disso aparece.
// Regra dura: toda arte sai do render já com o símbolo KM no canto padrão (render/template_story.py → marca_dagua).
import { db } from '../db/index.js';
import * as render from '../integracoes/render.js';
import * as cdn from '../integracoes/cloudinary.js';
import * as gemini from '../integracoes/gemini.js';
import { gerarJSON } from '../integracoes/gemini.js';

const sessoes = new Map(); // chatId → estado
const TTL = 30 * 60000;
export const GATILHO = /\b(quero|vamos|bora|preciso)\s+(editar|criar|montar|fazer)\s+(um|uma|o|a)?\s*(story|storie|stories|v[íi]deo para story|foto para story)\b|\beditar\s+(um|uma)?\s*(v[íi]deo|foto)\s+(para|pro|pra)\s+(story|storie|stories)\b|\bmodo edi[çc][ãa]o\b/i;
const SAIR = /^(cancela|cancelar|sair|deixa|para|parar|esquece)\b/i;

export const MODELOS_FOTO = [
  { n: 1, id: 'foto_faixa', nome: 'Foto + faixa de texto', pede: 'texto' },
  { n: 0, id: 'so_marca', nome: 'Sem render — só a marca KM na foto', pede: null },
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
export function iniciar(chatId, { fotoBytes, videoUrl } = {}) {
  const e = { t: Date.now(), passo: 'base', dados: {} };
  if (fotoBytes) { e.base = 'foto'; e.foto = fotoBytes; e.passo = 'modelo'; }
  else if (videoUrl) { e.base = 'video'; e.videoUrl = videoUrl; e.passo = 'modelo'; }
  sessoes.set(chatId, e);
  if (e.passo === 'base') return '🎬 Modo edição de Story. Qual é a base?\n1️⃣ Foto\n2️⃣ Vídeo\n3️⃣ Só texto (fundo KM)\n\n(ou mande a foto/vídeo agora · "cancela" sai)';
  return perguntaModelo(e);
}
function perguntaModelo(e) {
  if (e.base === 'foto') return `Foto recebida. Modelo:\n${lista(MODELOS_FOTO)}\n\nResponda o número.`;
  if (e.base === 'texto') return `Modelo de story em texto:\n${lista(MODELOS_TEXTO)}\n\nResponda o número.`;
  return 'Edição de vídeo (legenda automática, letreiro, logo, corte) entra na próxima etapa. Por enquanto posso publicar o vídeo como está, com a MIA. Diga "cancela" e mande "MIA, story com esse vídeo".';
}

/** Trata a mensagem do dono dentro do modo. Devolve string (continua), {foto, texto} (prévia) ou null (não é dele). */
export async function tratar(msg, conta, canal) {
  const e = emEdicao(msg.chatId); if (!e) return null; e.t = Date.now();
  const t = (msg.texto || '').trim();
  if (SAIR.test(t)) { encerrar(msg.chatId); return 'Saí do modo edição. Nada foi publicado.'; }

  // mídia chegando dentro do modo
  if (msg.tipo === 'imagem' && msg.midia) { e.base = 'foto'; e.foto = Buffer.from(await canal.baixarMidia(msg.midia.ref)); e.passo = 'modelo'; return perguntaModelo(e); }
  if (msg.tipo === 'video') { e.base = 'video'; e.passo = 'modelo'; return perguntaModelo(e); }

  if (e.passo === 'base') {
    if (/^1\b|foto/i.test(t)) return 'Manda a foto.';
    if (/^2\b|v[íi]deo/i.test(t)) return 'Manda o vídeo (ou o link do Drive).';
    if (/^3\b|texto/i.test(t)) { e.base = 'texto'; e.passo = 'modelo'; return perguntaModelo(e); }
    return 'Responda 1 (foto), 2 (vídeo) ou 3 (só texto).';
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
    if (/^(sim|aprov|ok|boa|fechou|perfeit)/i.test(t)) { e.passo = 'destino'; return 'Fechado. O que faço?\n1️⃣ Publicar agora\n2️⃣ Agendar (diga dia e hora)\n3️⃣ Guardar na biblioteca'; }
    if (/^(troca|muda|ajusta|outra|refaz|dourad|palavra)/i.test(t)) { absorverConteudo(e, t.replace(/^(troca|muda|ajusta|refaz)\s*(o|a|para|pra)?\s*/i, '')); return gerar(e, msg.chatId, conta); }
    if (/^(outro modelo|modelo)/i.test(t)) { e.passo = 'modelo'; return perguntaModelo(e); }
    return 'Aprova a prévia? (sim · "troca o texto para …" · "outro modelo" · "cancela")';
  }
  if (e.passo === 'destino') {
    const { criarStoryPost } = await import('../ferramentas/social.js');
    if (/^1\b|agora|publica/i.test(t)) { const r = await criarStoryPost(conta.id, { midia_url: e.url, tema: e.dados.texto || e.dados.titulo, publicarAgora: true }); encerrar(msg.chatId); return r.erro ? `❌ ${r.erro}` : `📣 Story publicado (${r.ig_media_id}).`; }
    if (/^3\b|biblioteca|guarda/i.test(t)) { db.prepare("UPDATE biblioteca SET descricao=COALESCE(descricao, ?) WHERE url=? AND conta_id=?").run(e.dados.texto || e.dados.titulo || e.modelo.nome, e.url, conta.id); encerrar(msg.chatId); return `📚 Guardado na biblioteca: "${(e.dados.texto || e.dados.titulo || e.modelo.nome).slice(0, 60)}". Para usar depois: "MIA, biblioteca".`; }
    const dt = extrairData(t);
    if (/^2\b|agenda/i.test(t) && !dt) return 'Qual dia e hora? (ex.: "amanhã 12:00", "16/10 18:30")';
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
