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
    { name: 'gerar_legenda', description: 'Gera legenda no modelo do manual KM (gancho, contexto, 3 pontos, CTA único, 5 hashtags = 3 fixas + 2 do pilar). Informe o pilar (GESTÃO|NEGÓCIOS|IA|AUTOMAÇÃO) e o objetivo do CTA (salvar|compartilhar|comentar|seguir|conversa|direct).', parameters: { type: 'OBJECT', properties: { tema: { type: 'STRING' }, formato: { type: 'STRING', description: 'post|carrossel|reels|story' }, pilar: { type: 'STRING', description: 'GESTÃO|NEGÓCIOS|IA|AUTOMAÇÃO' }, objetivo_cta: { type: 'STRING', description: 'salvar|compartilhar|comentar|seguir|conversa|direct' }, serie: { type: 'STRING', description: 'Antes do processo | Método 3R | Ferramenta da semana | (vazio)' }, ajuste: { type: 'STRING', description: 'instrução de ajuste sobre uma versão anterior' } }, required: ['tema', 'pilar'] } },
    { name: 'gerar_midia', description: 'Gera imagem via fal.ai a partir de briefing visual (na identidade da marca). Retorna URL.', parameters: { type: 'OBJECT', properties: { briefing: { type: 'STRING' }, ratio: { type: 'STRING', description: '1:1|4:5|9:16' } }, required: ['briefing'] } },
    { name: 'gerar_frase', description: 'Estático do manual: frase forte (até 2 linhas) com UMA palavra em dourado, etiqueta do pilar, fundo #37414E, 3:4. template=km usa o visual antigo (paletas km/preto/copa/azul/vinho). Retorna URL.', parameters: { type: 'OBJECT', properties: { frase: { type: 'STRING' }, palavra_dourada: { type: 'STRING', description: 'a palavra da frase que vai em dourado' }, pilar: { type: 'STRING', description: 'GESTÃO|NEGÓCIOS|IA|AUTOMAÇÃO' }, template: { type: 'STRING', description: 'manual (padrão) | km' }, paleta: { type: 'STRING' }, autoria: { type: 'STRING' } }, required: ['frase'] } },
    { name: 'gerar_carrossel', description: 'Carrossel do manual KM (6–8 slides, 3:4): capa (etiqueta + título ≤8 palavras com UMA palavra dourada + subtítulo) → problema → 3–5 conteúdo → resumo → CTA. IA escreve, serviço renderiza em Poppins/fundo #37414E. Retorna URLs + textos. Depois criar_post(formato=carrossel, midias_urls). template=km usa o visual antigo.', parameters: { type: 'OBJECT', properties: { tema: { type: 'STRING' }, pilar: { type: 'STRING', description: 'GESTÃO|NEGÓCIOS|IA|AUTOMAÇÃO' }, objetivo_cta: { type: 'STRING', description: 'salvar|compartilhar|comentar|seguir|conversa' }, qtd_conteudo: { type: 'NUMBER', description: 'slides de conteúdo, 3 a 5 (padrão 3)' }, instrucoes: { type: 'STRING' }, template: { type: 'STRING', description: 'manual (padrão) | km' }, paleta: { type: 'STRING' } }, required: ['tema', 'pilar'] } },
    { name: 'aplicar_marca', description: 'Aplica o logo KM como marca d\'água numa imagem (URL) escolhendo automaticamente a cor pelo fundo (branco em fundo escuro, azul-cinza em fundo claro, com sombra se precisar). Use em toda foto enviada pelo dono antes de propor o post.', parameters: { type: 'OBJECT', properties: { url: { type: 'STRING' }, posicao: { type: 'STRING', description: 'inferior-direito (padrão) | inferior-esquerdo | superior-direito | superior-esquerdo' }, assinatura: { type: 'BOOLEAN', description: 'escrever @kauemunchen sob o logo (padrão false — só se o dono pedir)' } }, required: ['url'] } },
    { name: 'listar_paletas', description: 'Paletas de cor disponíveis para artes KM', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'criar_post', description: 'Salva post no calendário editorial com legenda/hashtags/mídia aprovados. status: rascunho ou agendado (com data).', parameters: { type: 'OBJECT', properties: { formato: { type: 'STRING' }, tema: { type: 'STRING' }, legenda: { type: 'STRING' }, hashtags: { type: 'STRING' }, midia_url: { type: 'STRING' }, midias_urls: { type: 'ARRAY', items: { type: 'STRING' }, description: 'slides do carrossel, em ordem' }, data: { type: 'STRING', description: 'YYYY-MM-DDTHH:MM para agendar; vazio = rascunho' }, pilar: { type: 'STRING' } }, required: ['formato', 'legenda'] } },
    { name: 'agendar_post', description: 'Agenda um post salvo (rascunho) para uma data/hora; cria o evento no marcador Social Media da agenda. Use quando o dono aprovar e disser quando.', parameters: { type: 'OBJECT', properties: { post_id: { type: 'NUMBER' }, data: { type: 'STRING', description: 'YYYY-MM-DDTHH:MM' } }, required: ['post_id', 'data'] } },
    { name: 'atualizar_post', description: 'Altera legenda, hashtags, mídia, tema, pilar ou formato de um post salvo', parameters: { type: 'OBJECT', properties: { post_id: { type: 'NUMBER' }, legenda: { type: 'STRING' }, hashtags: { type: 'STRING' }, midia_url: { type: 'STRING' }, midias_urls: { type: 'ARRAY', items: { type: 'STRING' } }, tema: { type: 'STRING' }, pilar: { type: 'STRING' }, formato: { type: 'STRING' } }, required: ['post_id'] } },
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
      const pilarKey = (a.pilar || 'gestao').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const tagsPilar = id.hashtags_pilar?.[pilarKey] || '';
      const cta = id.ctas?.[(a.objetivo_cta || 'salvar').toLowerCase()] || a.objetivo_cta || '';
      const r = await gerarJSON(`Você é a MIA, social media de ${id.perfil || 'Kauê München'}. Gere legenda para Instagram em português do Brasil seguindo o MANUAL DA MARCA à risca.
IDENTIDADE: ${JSON.stringify({ nicho: id.nicho, publico: id.publico, tom: id.tom, pilares: id.pilares, provas: id.provas, fase: id.fase })}
HISTÓRICO APROVADO (referência de tom): ${JSON.stringify(hist)}
TEMA: ${a.tema}
FORMATO: ${a.formato || 'post'} · PILAR: ${(a.pilar || 'GESTÃO').toUpperCase()}${a.serie ? ' · SÉRIE: ' + a.serie : ''}
CTA OBRIGATÓRIO (único, no fim, exatamente este texto): "${cta}"
HASHTAGS OBRIGATÓRIAS (exatamente 5): fixas ${id.hashtags_fixas || ''} + 2 escolhidas de: ${tagsPilar}
${a.ajuste ? 'AJUSTE PEDIDO SOBRE A VERSÃO ANTERIOR: ' + a.ajuste : ''}
MODELO DA LEGENDA: [gancho 1 linha] linha em branco [história/contexto real 2–3 linhas] linha em branco [3 pontos curtos numerados 1. 2. 3.] linha em branco [CTA] linha em branco [5 hashtags].
REGRAS: gancho nas 3 primeiras palavras (fórmulas: número+contraste, frase que dói, confissão, "e se"); uma ideia por post; números só os das provas de autoridade ou os informados; nunca inventar depoimento; sem venda na fase atual; sem emoji além de um no máximo.
Responda JSON: {"etiqueta": "${(a.pilar || 'GESTÃO').toUpperCase()}", "gancho": "...", "legenda": "texto completo no modelo, sem as hashtags", "hashtags": "#a #b #c #d #e", "cta": "${cta}", "briefing_imagem": "descrição visual curta na identidade KM (fundo #37414E, título branco, uma palavra em dourado)"${(a.formato === 'carrossel') ? ', "slides": ["capa: título até 8 palavras com UMA palavra em dourado", "problema", "conteúdo 1", "conteúdo 2", "conteúdo 3", "resumo", "cta"]' : ''}}`);
      return r;
    }
    case 'gerar_midia': {
      const id = identidade(conta.id) || {};
      const prompt = `${a.briefing}. Estilo: ${id.estilo_visual || 'limpo, profissional, alto contraste, sem texto na imagem'}.`;
      return { url: await ig.gerarImagemFal(prompt, a.ratio || '4:5'), briefing: a.briefing };
    }
    case 'listar_paletas': return render.paletas();
    case 'aplicar_marca': {
      const src = await fetch(a.url).then(r => { if (!r.ok) throw new Error('não consegui baixar a imagem'); return r.arrayBuffer(); });
      const { bytes, info } = await render.marcaDagua(Buffer.from(src), { posicao: a.posicao || 'inferior-direito', assinatura: a.assinatura === true });
      const url = await cdn.upload(bytes, { pasta: `assessor/${conta.id}/marcadas` });
      return { url, ...info };
    }
    case 'gerar_frase': {
      const bytes = await render.frase(a.frase, { template: a.template || 'manual', paleta: a.paleta || 'km', autoria: a.autoria || '@kauemunchen', palavra_dourada: a.palavra_dourada, etiqueta: a.pilar });
      const url = await cdn.upload(bytes, { pasta: `assessor/${conta.id}/frases` });
      return { url, frase: a.frase, palavra_dourada: a.palavra_dourada, template: a.template || 'manual' };
    }
    case 'gerar_carrossel': {
      const template = a.template || 'manual';
      const idd = identidade(conta.id) || {};
      const cta = idd.ctas?.[(a.objetivo_cta || 'salvar').toLowerCase()] || 'Salva para aplicar na segunda-feira.';
      let dados;
      if (template === 'km') {
        const qtd = a.qtd_conteudo || 4;
        dados = await gerarJSON(`Crie conteudo para carrossel Instagram sobre: ${a.tema}.
${a.instrucoes ? 'Instrucoes de estilo: ' + a.instrucoes + '\n' : ''}Formato exato: {"titulo": "TITULO CAPA MAX 3 PALAVRAS", "subtitulo": "subtitulo curto max 8 palavras", "slides": [{"num": "01", "titulo": "MAX 2 PALAVRAS", "texto": "frase curta max 10 palavras"}], "cta": "FRASE CURTA MAX 5 PALAVRAS"}
Crie EXATAMENTE ${qtd} objetos dentro do array slides. Apenas o JSON.`);
      } else {
        const n = Math.min(5, Math.max(3, a.qtd_conteudo || 3));
        dados = await gerarJSON(`Você é a MIA, social media de Kauê München. Escreva um carrossel de Instagram seguindo o Manual da Marca KM.
IDENTIDADE: ${JSON.stringify({ nicho: idd.nicho, publico: idd.publico, tom: idd.tom, provas: idd.provas })}
TEMA: ${a.tema} · PILAR: ${(a.pilar || 'GESTÃO').toUpperCase()}
${a.instrucoes ? 'INSTRUÇÕES: ' + a.instrucoes + '\n' : ''}ESTRUTURA OBRIGATÓRIA: capa → 1 slide "problema" → ${n} slides "conteudo" → 1 slide "resumo" → CTA.
REGRAS: título da capa com até 8 palavras e UMA palavra-chave para destacar em dourado (palavra_dourada = exatamente uma palavra que aparece no título); subtítulo 1 linha; cada slide interno: título até 6 palavras (pode ter palavra_dourada) e texto de até 30 palavras, direto, de igual para igual, sem jargão; números só os das provas ou do tema; sem emoji.
Responda JSON: {"etiqueta": "${(a.pilar || 'GESTÃO').toUpperCase()}", "titulo": "...", "palavra_dourada": "...", "subtitulo": "...", "slides": [{"tipo": "problema", "titulo": "...", "texto": "..."}, {"tipo": "conteudo", "titulo": "...", "palavra_dourada": "...", "texto": "..."}, {"tipo": "resumo", "titulo": "...", "texto": "..."}], "cta": "${cta}"}`);
      }
      if (!dados?.slides?.length) throw new Error('IA não devolveu slides válidos; tente de novo.');
      const slides = await render.carrossel(dados, { template, paleta: a.paleta || 'km' });
      const base = Date.now();
      const urls = await Promise.all(slides.map((b, i) => cdn.upload(b, { pasta: `assessor/${conta.id}/carrossel`, nome: `car_${base}_${i}` })));
      return { urls, textos: dados, template };
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
    case 'agendar_post': {
      const p = db.prepare('SELECT * FROM posts WHERE id=? AND conta_id=?').get(a.post_id, conta.id);
      if (!p) throw new Error(`Post #${a.post_id} não existe.`);
      if (p.status === 'publicado') throw new Error('Esse post já foi publicado.');
      db.prepare("UPDATE posts SET status='agendado', data=? WHERE id=?").run(a.data, p.id);
      let agenda = null;
      try {
        if (p.gcal_event_id) { await gcal.atualizarEvento(conta.id, p.gcal_event_id, { inicio: a.data, fim: new Date(new Date(a.data).getTime() + 15 * 60000).toISOString().slice(0, 16) }); agenda = 'evento atualizado'; }
        else { const ev = await gcal.criarEvento(conta.id, { titulo: `📣 ${p.formato}: ${p.tema || (p.legenda || '').slice(0, 40)}`, inicio: a.data, fim: new Date(new Date(a.data).getTime() + 15 * 60000).toISOString().slice(0, 16), descricao: `Post #${p.id} · ${(p.legenda || '').slice(0, 300)}`, categoria: MARCADOR, lembreteMin: 60 }); db.prepare('UPDATE posts SET gcal_event_id=? WHERE id=?').run(ev.id, p.id); agenda = ev.link; }
      } catch (e) { agenda = `não entrou na agenda: ${e.message}`; }
      return { id: p.id, status: 'agendado', data: a.data, agenda, publica_sozinho: true };
    }
    case 'atualizar_post': {
      const p = db.prepare('SELECT * FROM posts WHERE id=? AND conta_id=?').get(a.post_id, conta.id);
      if (!p) throw new Error(`Post #${a.post_id} não existe.`);
      const campos = { legenda: a.legenda, hashtags: a.hashtags, tema: a.tema, pilar: a.pilar, formato: a.formato, midia_url: a.midias_urls?.length ? JSON.stringify(a.midias_urls) : a.midia_url };
      for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null) db.prepare(`UPDATE posts SET ${k}=? WHERE id=?`).run(v, p.id);
      return { id: p.id, atualizado: Object.keys(campos).filter(k => campos[k] != null) };
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
  const [original, m] = await Promise.all([
    cdn.upload(bytes, { pasta: `assessor/${contaId}` }),
    render.marcaDagua(Buffer.from(bytes)).then(async r => ({ marcada: await cdn.upload(r.bytes, { pasta: `assessor/${contaId}/marcadas` }), info: r.info })).catch(e => ({ marcada: null, info: { erro: e.message } })),
  ]);
  db.prepare('INSERT INTO biblioteca (conta_id, url, tipo) VALUES (?,?,?)').run(contaId, original, 'imagem');
  return { original, ...m };
}
