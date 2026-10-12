import * as ig from '../integracoes/instagram.js';
import * as cdn from '../integracoes/cloudinary.js';
import { gerarJSON } from '../integracoes/gemini.js';
import { db } from '../db/index.js';
import * as gcal from '../integracoes/google-calendar.js';
import * as render from '../integracoes/render.js';
const MARCADOR = 'Social Media';

const identidade = (contaId) => { const r = db.prepare('SELECT dados FROM social_identidade WHERE conta_id=?').get(contaId); return r ? JSON.parse(r.dados) : null; };
const historico = (contaId, n = 5) => db.prepare("SELECT formato, tema, legenda, hashtags FROM posts WHERE conta_id=? AND status='publicado' ORDER BY id DESC LIMIT ?").all(contaId, n);

export function ferramentas(_conta) {
  return [
    { name: 'definir_identidade', description: 'Salva/atualiza a identidade da marca para conteúdo (perfil, nicho, público, tom, pilares, hashtags fixas). Chame quando o dono descrever a marca.', parameters: { type: 'OBJECT', properties: { perfil: { type: 'STRING' }, nicho: { type: 'STRING' }, publico: { type: 'STRING' }, tom: { type: 'STRING' }, pilares: { type: 'STRING' }, hashtags_fixas: { type: 'STRING' }, descricao: { type: 'STRING' } } } },
    { name: 'ver_identidade', description: 'Mostra a identidade de marca salva', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'gerar_legenda', description: 'Gera legenda + hashtags no tom da marca para um tema e formato. Retorna rascunho para aprovação.', parameters: { type: 'OBJECT', properties: { tema: { type: 'STRING' }, formato: { type: 'STRING', description: 'post|carrossel|reels|story' }, cta: { type: 'STRING' }, ajuste: { type: 'STRING', description: 'instrução de ajuste sobre uma versão anterior' } }, required: ['tema'] } },
    { name: 'gerar_midia', description: 'Gera imagem via fal.ai a partir de briefing visual (na identidade da marca). Retorna URL.', parameters: { type: 'OBJECT', properties: { briefing: { type: 'STRING' }, ratio: { type: 'STRING', description: '1:1|4:5|9:16' } }, required: ['briefing'] } },
    { name: 'gerar_frase', description: 'Renderiza uma frase/citação em arte KM (1080x1350) com logo. Paletas: km, preto, copa, azul, vinho. Retorna URL.', parameters: { type: 'OBJECT', properties: { frase: { type: 'STRING' }, paleta: { type: 'STRING' }, autoria: { type: 'STRING' } }, required: ['frase'] } },
    { name: 'gerar_carrossel', description: 'Gera carrossel KM: IA cria capa + N slides + CTA e renderiza as artes (template KM, com logo). Retorna URLs dos slides e os textos. Depois use criar_post com formato=carrossel e midias_urls.', parameters: { type: 'OBJECT', properties: { tema: { type: 'STRING' }, qtd: { type: 'NUMBER', description: 'slides internos, padrão 4' }, paleta: { type: 'STRING' }, instrucoes: { type: 'STRING' } }, required: ['tema'] } },
    { name: 'listar_paletas', description: 'Paletas de cor disponíveis para artes KM', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'criar_post', description: 'Salva post no calendário editorial com legenda/hashtags/mídia aprovados. status: rascunho ou agendado (com data).', parameters: { type: 'OBJECT', properties: { formato: { type: 'STRING' }, tema: { type: 'STRING' }, legenda: { type: 'STRING' }, hashtags: { type: 'STRING' }, midia_url: { type: 'STRING' }, midias_urls: { type: 'ARRAY', items: { type: 'STRING' }, description: 'slides do carrossel, em ordem' }, data: { type: 'STRING', description: 'YYYY-MM-DDTHH:MM para agendar; vazio = rascunho' }, pilar: { type: 'STRING' } }, required: ['formato', 'legenda'] } },
    { name: 'listar_calendario', description: 'Lista a programação de posts (rascunho, agendado, publicado) num período; use para "o que temos programado"', parameters: { type: 'OBJECT', properties: { inicio: { type: 'STRING' }, fim: { type: 'STRING' }, status: { type: 'STRING' } } } },
    { name: 'publicar', description: 'Publica um post salvo no Instagram agora (requer confirmação)', parameters: { type: 'OBJECT', properties: { post_id: { type: 'NUMBER' } }, required: ['post_id'] } },
    { name: 'ler_metricas', description: 'Métricas da conta nos últimos N dias', parameters: { type: 'OBJECT', properties: { dias: { type: 'NUMBER' } } } },
  ];
}
export const requerConfirmacao = new Set(['publicar']);

export async function executar(nome, a, conta, ctx = {}) {
  const cred = db.prepare('SELECT * FROM instagram_auth WHERE conta_id=?').get(conta.id);
  switch (nome) {
    case 'definir_identidade': {
      const atual = identidade(conta.id) || {};
      const novo = { ...atual, ...Object.fromEntries(Object.entries(a).filter(([, v]) => v)) };
      db.prepare('INSERT INTO social_identidade (conta_id, dados) VALUES (?,?) ON CONFLICT(conta_id) DO UPDATE SET dados=excluded.dados').run(conta.id, JSON.stringify(novo));
      return novo;
    }
    case 'ver_identidade': return identidade(conta.id) || { aviso: 'Nenhuma identidade salva. Peça ao dono: perfil, nicho, público, tom, pilares.' };
    case 'gerar_legenda': {
      const id = identidade(conta.id) || {};
      const hist = historico(conta.id);
      const r = await gerarJSON(`Você é social media da marca abaixo. Gere conteúdo para Instagram em português do Brasil.
MARCA: ${JSON.stringify(id)}
HISTÓRICO APROVADO (referência de tom): ${JSON.stringify(hist)}
TEMA: ${a.tema}
FORMATO: ${a.formato || 'post'}
CTA desejado: ${a.cta || 'livre'}
${a.ajuste ? 'AJUSTE PEDIDO SOBRE A VERSÃO ANTERIOR: ' + a.ajuste : ''}
Regras: gancho nas 3 primeiras palavras; uma ideia por post; parágrafos curtos; sem emoji em excesso; CTA no fim; 8 a 15 hashtags do nicho${id.hashtags_fixas ? ' incluindo ' + id.hashtags_fixas : ''}; nunca inventar número ou depoimento.
Responda JSON: {"legenda": "...", "hashtags": "#a #b ...", "briefing_imagem": "descrição visual curta para gerar a imagem, na identidade da marca"${(a.formato === 'carrossel') ? ', "slides": ["texto slide 1", "..."]' : ''}}`);
      return r;
    }
    case 'gerar_midia': {
      const id = identidade(conta.id) || {};
      const prompt = `${a.briefing}. Estilo: ${id.estilo_visual || 'limpo, profissional, alto contraste, sem texto na imagem'}.`;
      return { url: await ig.gerarImagemFal(prompt, a.ratio || '4:5'), briefing: a.briefing };
    }
    case 'listar_paletas': return render.paletas();
    case 'gerar_frase': {
      const bytes = await render.frase(a.frase, a.paleta || 'km', a.autoria || '@kauemunchen');
      const url = await cdn.upload(bytes, { pasta: `assessor/${conta.id}/frases` });
      return { url, frase: a.frase, paleta: a.paleta || 'km' };
    }
    case 'gerar_carrossel': {
      const qtd = a.qtd || 4;
      const dados = await gerarJSON(`Crie conteudo para carrossel Instagram sobre: ${a.tema}.
${a.instrucoes ? 'Instrucoes de estilo: ' + a.instrucoes + '\n' : ''}Formato exato: {"titulo": "TITULO CAPA MAX 3 PALAVRAS", "subtitulo": "subtitulo curto max 8 palavras", "slides": [{"num": "01", "titulo": "MAX 2 PALAVRAS", "texto": "frase curta max 10 palavras"}], "cta": "FRASE CURTA MAX 5 PALAVRAS"}
IMPORTANTE: titulos muito curtos, maximo 2-3 palavras cada. Crie EXATAMENTE ${qtd} objetos dentro do array slides. Apenas o JSON.`);
      if (!dados?.slides?.length) throw new Error('IA não devolveu slides válidos; tente de novo.');
      const slides = await render.carrossel(dados, a.paleta || 'km');
      const urls = [];
      for (let i = 0; i < slides.length; i++) urls.push(await cdn.upload(slides[i], { pasta: `assessor/${conta.id}/carrossel`, nome: `car_${Date.now()}_${i}` }));
      return { urls, textos: dados, paleta: a.paleta || 'km' };
    }
    case 'criar_post': {
      const status = a.data ? 'agendado' : 'rascunho';
      const midiaUrl = a.midias_urls?.length ? JSON.stringify(a.midias_urls) : (a.midia_url || null);
      const r = db.prepare('INSERT INTO posts (conta_id, formato, pilar, tema, data, legenda, hashtags, midia_url, status) VALUES (?,?,?,?,?,?,?,?,?)').run(conta.id, a.formato, a.pilar || null, a.tema || null, a.data || null, a.legenda, a.hashtags || null, midiaUrl, status);
      const postId = r.lastInsertRowid; let agenda = null;
      if (a.data) {
        try {
          const ev = await gcal.criarEvento(conta.id, { titulo: `📣 ${a.formato}: ${a.tema || a.legenda.slice(0, 40)}`, inicio: a.data, fim: new Date(new Date(a.data).getTime() + 15 * 60000).toISOString().slice(0, 16), descricao: `Post #${postId} · ${a.legenda.slice(0, 300)}${a.midia_url ? '\n' + a.midia_url : ''}`, categoria: MARCADOR, lembreteMin: 60 });
          db.prepare('UPDATE posts SET gcal_event_id=? WHERE id=?').run(ev.id, postId); agenda = ev.link;
        } catch (e) { agenda = `não entrou na agenda: ${e.message}`; }
      }
      return { id: postId, status, data: a.data || null, tem_midia: !!a.midia_url, agenda };
    }
    case 'listar_calendario': {
      let q = 'SELECT id, formato, tema, data, status, midia_url IS NOT NULL AS tem_midia FROM posts WHERE conta_id=?'; const p = [conta.id];
      if (a.status) { q += ' AND status=?'; p.push(a.status); }
      if (a.inicio) { q += ' AND (data IS NULL OR data>=?)'; p.push(a.inicio); }
      if (a.fim) { q += ' AND (data IS NULL OR data<=?)'; p.push(a.fim); }
      return db.prepare(q + ' ORDER BY data IS NULL, data').all(...p);
    }
    case 'publicar': return publicarPost(conta.id, a.post_id);
    case 'ler_metricas': { if (!cred) throw new Error('Instagram não conectado. Diga "conectar instagram".'); return ig.metricas({ igUserId: cred.ig_user_id, token: cred.token, desde: Math.floor(Date.now() / 1000) - (a.dias || 30) * 86400 }); }
    default: throw new Error(`social.${nome}: não implementada`);
  }
}

export async function publicarPost(contaId, postId) {
  const cred = db.prepare('SELECT * FROM instagram_auth WHERE conta_id=?').get(contaId);
  if (!cred) throw new Error('Instagram não conectado. Diga "conectar instagram".');
  const p = db.prepare('SELECT * FROM posts WHERE id=? AND conta_id=?').get(postId, contaId);
  if (!p) throw new Error(`Post #${postId} não existe.`);
  if (!p.midia_url && p.formato !== 'story') throw new Error('Post sem imagem. Gere ou envie uma imagem antes.');
  const legenda = [p.legenda, p.hashtags].filter(Boolean).join('\n\n');
  let id;
  if (p.midia_url?.startsWith('[')) id = await ig.publicarCarrossel({ igUserId: cred.ig_user_id, token: cred.token, legenda, urls: JSON.parse(p.midia_url) });
  else id = await ig.publicar({ igUserId: cred.ig_user_id, token: cred.token, legenda, url: p.midia_url, tipo: p.formato === 'story' ? 'story' : p.formato === 'reels' ? 'reels' : 'imagem' });
  db.prepare("UPDATE posts SET status='publicado', ig_media_id=?, publicado_em=CURRENT_TIMESTAMP WHERE id=?").run(id, p.id);
  if (p.gcal_event_id) gcal.atualizarEvento(contaId, p.gcal_event_id, { titulo: `✅ ${p.formato}: ${p.tema || p.legenda.slice(0, 40)}` }).catch(() => {});
  return { ig_media_id: id, post_id: p.id };
}

// Upload de imagem enviada pelo dono no chat → URL pública (vira mídia do próximo post)
export async function guardarImagemEnviada(contaId, bytes) {
  const url = await cdn.upload(bytes, { pasta: `assessor/${contaId}` });
  db.prepare('INSERT INTO biblioteca (conta_id, url, tipo) VALUES (?,?,?)').run(contaId, url, 'imagem');
  return url;
}
