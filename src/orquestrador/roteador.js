import { montarPrompt } from './montador-prompt.js';
import { transcrever, classificar, responder } from './ia.js';
import { obterConta, modulosAtivos, configPersona } from '../db/contas.js';
import { executarFerramenta } from '../ferramentas/index.js';
import * as memoria from './memoria.js';
import { db } from '../db/index.js';
import { onboarding } from './onboarding.js';
import { governanca } from './governanca.js';

export async function tratarMensagem(msg, canal) {
  const conta = await obterConta(msg.chatId);
  if (!conta) return onboarding(msg);

  if (msg.tipo === 'audio') {
    await canal.enviar(msg.conta, msg.chatId, '🎧 Ouvindo…');
    const bytes = await canal.baixarMidia(msg.midia.ref);
    console.log(`[audio] ${msg.chatId} ${msg.midia.mime} ${bytes.byteLength} bytes`);
    msg.texto = await transcrever(bytes, msg.midia.mime);
    console.log(`[audio] transcrição: ${msg.texto.slice(0, 120)}`);
    if (!msg.texto) return 'Não consegui entender o áudio. Pode repetir ou escrever?';
    await canal.enviar(msg.conta, msg.chatId, `📝 "${msg.texto}"`);
  }
  const ativosAgora = modulosAtivos(conta.id);
  const DOC_RX = /\b(guarda|arquiva|arquivo|documento|contrato|nota|boleto|certid[ãa]o|alvar[áa]|ap[óo]lice|comprovante|recibo|cadastro|rg|cnh|cpf|cnpj|procura[çc][ãa]o|holerite|extrato)\b/i;
  const SOCIAL_RX = /\b(post|legenda|instagram|story|stories|reels?|carrossel|marca d.?[áa]gua|publica)\b/i;
  if (msg.tipo === 'imagem' || msg.tipo === 'arquivo') {
    const temDoc = ativosAgora.includes('documentos'), temSocial = ativosAgora.includes('social') && msg.tipo === 'imagem';
    let destino = temDoc && !temSocial ? 'documentos' : temSocial && !temDoc ? 'social' : null;
    if (!destino && temDoc && temSocial) {
      if (SOCIAL_RX.test(msg.texto)) destino = 'social'; else if (DOC_RX.test(msg.texto)) destino = 'documentos';
    }
    let bytes = null;
    if (temDoc || temSocial) {
      if (msg.midia?.tamanho > 20 * 1024 * 1024 && !process.env.TELEGRAM_API_BASE) {
        return `📦 Esse arquivo tem ${(msg.midia.tamanho / 1048576).toFixed(0)} MB e o Telegram só me entrega até 20 MB. Suba no seu Google Drive e me mande o link do arquivo — eu guardo na pasta certa e registro do mesmo jeito.`;
      }
      try { bytes = await canal.baixarMidia(msg.midia.ref); } catch (e) { return `Não consegui baixar o arquivo (${e.message}). Se for grande, mande o link do Drive.`; }
    }
    if (!destino && temDoc && temSocial && bytes) {
      // foto sem legenda clara: pergunta rápida à IA se é documento ou foto para post
      try { const { lerImagem } = await import('../integracoes/gemini.js'); const r = await lerImagem(bytes, msg.midia.mime, 'Isto é um DOCUMENTO (contrato, nota, boleto, certidão, RG/CNH, print de texto, formulário, comprovante) ou uma FOTO para redes sociais (pessoa, cena, produto, paisagem)? Responda só: documento ou foto'); destino = /documento/i.test(r) ? 'documentos' : 'social'; } catch { destino = 'social'; }
    }
    if (destino === 'documentos') {
      await canal.enviar(msg.conta, msg.chatId, '📂 Lendo e arquivando…');
      try {
        const { receberArquivo } = await import('../ferramentas/documentos.js');
        const doc = await receberArquivo(conta, { bytes, mime: msg.midia.mime, nome: msg.midia.nome || '' });
        msg.texto = (msg.texto ? msg.texto + '\n' : '') + `[Documento recebido do dono e JÁ ARQUIVADO no Drive. Dados: ${JSON.stringify(doc)}. Confirme em até 3 linhas: o que é, onde guardou (pasta) e o link; se houver vigência, diga a data e que os avisos estão agendados; se "legivel" for false, peça uma foto melhor ou que ele descreva o documento; se faltar empresa/tipo óbvios, pergunte. Não invente dados.]`;
        msg.forcarModulo = 'documentos';
      } catch (e) { msg.texto = (msg.texto ? msg.texto + '\n' : '') + `[Documento recebido mas NÃO arquivado. Erro real: ${e.message}. Repita o erro ao dono e diga o que ele precisa fazer.]`; msg.forcarModulo = 'documentos'; }
    } else if (destino === 'social') {
      try {
        const { guardarImagemEnviada } = await import('../ferramentas/social.js');
        const r = await guardarImagemEnviada(conta.id, bytes);
        msg.texto = (msg.texto ? msg.texto + '\n' : '') + `[Foto enviada pelo dono. Original: ${r.original}. Versão com marca d'água KM já aplicada (logo ${r.info.logo || '?'}${r.info.sombra ? ' com sombra' : ''}, canto ${r.info.posicao || 'inferior-direito'}): ${r.marcada || 'falhou: ' + (r.info.erro || '')}. Use a versão marcada como midia_url. Mostre-a na resposta (vira prévia), diga qual cor de logo foi escolhida e por quê, e proponha legenda no modelo do manual (pergunte o pilar se não estiver claro).]`;
        msg.forcarModulo = 'social';
      } catch (e) { msg.texto = (msg.texto ? msg.texto + '\n' : '') + `[imagem recebida, mas não consegui hospedar: ${e.message}]`; }
    } else msg.texto = (msg.texto ? msg.texto + '\n' : '') + `[${msg.tipo === 'imagem' ? 'imagem' : 'arquivo'} recebido; para eu guardar, ligue o módulo Documentos ("ativa documentos").]`;
  }
  // Link do Google Drive em texto → módulo Documentos registra/move
  if (msg.tipo === 'texto' && ativosAgora.includes('documentos') && /drive\.google\.com\/(file|open|uc)|docs\.google\.com\/\w+\/d\//.test(msg.texto) && !/^documentos pasta/i.test(msg.texto.trim())) {
    await canal.enviar(msg.conta, msg.chatId, '📂 Lendo o arquivo do Drive e arquivando…');
    try { const { receberLinkDrive } = await import('../ferramentas/documentos.js'); const doc = await receberLinkDrive(conta, msg.texto);
      msg.texto += `\n[Arquivo do Drive JÁ MOVIDO para a pasta certa e registrado. Dados: ${JSON.stringify(doc)}. Confirme em até 3 linhas (o que é, pasta, link, vigência se houver). Não invente dados.]`; }
    catch (e) { msg.texto += `\n[Link do Drive recebido mas não consegui arquivar. Erro real: ${e.message}. Repita ao dono.]`; }
    msg.forcarModulo = 'documentos';
  }
  if (!msg.texto?.trim()) return 'Recebi uma mensagem vazia.';

  // confirmação de ação pendente
  const pend = db.prepare('SELECT * FROM pendencias WHERE chat_id=? ORDER BY id DESC LIMIT 1').get(msg.chatId);
  if (pend && /^(sim|ok|confirmo|pode|vai)\b/i.test(msg.texto.trim())) {
    db.prepare('DELETE FROM pendencias WHERE id=?').run(pend.id);
    try { const r = await executarFerramenta(pend.modulo, pend.ferramenta, JSON.parse(pend.args), conta, { chatId: msg.chatId }); return `✅ Feito. ${JSON.stringify(r)}`; }
    catch (e) { return `❌ Não consegui: ${e.message}`; }
  }
  if (pend && /^(n[aã]o|cancela|deixa)\b/i.test(msg.texto.trim())) { db.prepare('DELETE FROM pendencias WHERE id=?').run(pend.id); return 'Cancelado.'; }

  const gov = await governanca(msg, conta); if (gov) return gov;

  const ativos = modulosAtivos(conta.id);
  // Chamou um assessor pelo nome? ("MIA, ...", "Tina: ...", "Secretária, ...") → vai direto para ele
  let modulo = msg.forcarModulo && ativos.includes(msg.forcarModulo) ? msg.forcarModulo : null;
  const cabeca = msg.texto.trim().slice(0, 40).toLowerCase();
  const nomesPadrao = { diretor: ['diretor'], secretaria: ['secretária', 'secretaria'], producao: ['produção', 'producao'], documentos: ['documentos'], financeiro: ['financeiro'], social: ['mia', 'social'] };
  for (const mod of (modulo ? [] : ativos)) {
    const nomes = [...(nomesPadrao[mod] || []), (configPersona(conta.id, mod).nome || '').toLowerCase()].filter(Boolean);
    if (nomes.some(n => new RegExp(`^${n}\\b[,:!]?\\s`).test(cabeca + ' '))) { modulo = mod; break; }
  }
  // Resposta curta de continuação ("aprovar", "agenda pra…", "ajusta", "sim") → fica com quem falou por último (até 30 min)
  if (!modulo) {
    const ult = memoria.ultimoModulo(conta.id);
    const recente = ult && (Date.now() - new Date(ult.criado_em + 'Z').getTime()) < 30 * 60000;
    const continuacao = /^(aprov|sim\b|ok\b|pode|confirm|agend|ajust|troca|muda|mudar|publica|refaz|outra|outro|mais |menos |n[ãa]o\b|cancela|deixa|essa|esse|isso|a segunda|a primeira|prefiro)/i.test(msg.texto.trim()) || msg.texto.trim().length < 25;
    if (recente && continuacao && ativos.includes(ult.modulo)) modulo = ult.modulo;
  }
  // Nome desconhecido no início ("OLGA, …") → ignora o vocativo e classifica pelo conteúdo
  let textoClass = msg.texto;
  const voc = msg.texto.match(/^([A-Za-zÀ-ÿ]{2,20})[,:]\s+/);
  if (!modulo && voc) textoClass = msg.texto.slice(voc[0].length);
  if (!modulo) modulo = await classificar(textoClass, ativos);
  console.log(`[msg] ${msg.chatId} → ${modulo}: ${msg.texto.slice(0, 80)}`);
  const prompt = montarPrompt({ modulo, conta, ativos });
  // Pedidos pesados (carrossel, arte, imagem): avisa na hora e deixa demorar
  if (modulo === 'social' && /\b(carrossel|est[áa]tico|frase|arte|imagem|gera)\b/i.test(msg.texto)) {
    await canal.enviar(msg.conta, msg.chatId, '🎨 Montando… isso leva de 20 a 40 segundos. Te mando a prévia assim que ficar pronta.');
  }
  let resposta = await responder({ prompt, conta, modulo, msg, ativos });
  await memoria.registrarInteracao(conta.id, modulo, msg, resposta);
  // Social: se a resposta contém URL de imagem (fal/cloudinary), manda como foto com a legenda
  if (modulo === 'social' && typeof resposta === 'string') {
    const todas = [...resposta.matchAll(/https?:\/\/res\.cloudinary\.com\/\S+?\.(?:jpg|jpeg|png|webp)/gi)].map(x => x[0]);
    if (todas.length > 1) { const txt = todas.reduce((t, u) => t.replace(u, ''), resposta).replace(/^\s*[-•]\s*[^\n:]{0,30}:\s*$/gm, '').replace(/^\s*Pr[ée]via[^\n]*:\s*$/gmi, '').replace(/\n{3,}/g, '\n\n').trim(); return { fotos: [...new Set(todas)], texto: txt }; }
    const m = resposta.match(/https?:\/\/\S+\.(?:jpg|jpeg|png|webp)(?:\?\S*)?|https?:\/\/(?:[\w.-]*fal\.media|res\.cloudinary\.com)\/\S+/i);
    if (m) resposta = { foto: m[0], texto: resposta.replace(m[0], '').trim() };
  }
  return resposta;
}
