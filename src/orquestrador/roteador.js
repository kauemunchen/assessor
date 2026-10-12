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
  if (msg.tipo === 'imagem') {
    const ativosAgora = modulosAtivos(conta.id);
    if (ativosAgora.includes('social')) {
      try {
        const { guardarImagemEnviada } = await import('../ferramentas/social.js');
        const r = await guardarImagemEnviada(conta.id, await canal.baixarMidia(msg.midia.ref));
        msg.texto = (msg.texto ? msg.texto + '\n' : '') + `[Foto enviada pelo dono. Original: ${r.original}. Versão com marca d'água KM já aplicada (logo ${r.info.logo || '?'}${r.info.sombra ? ' com sombra' : ''}, canto ${r.info.posicao || 'inferior-direito'}): ${r.marcada || 'falhou: ' + (r.info.erro || '')}. Use a versão marcada como midia_url. Mostre-a na resposta (vira prévia), diga qual cor de logo foi escolhida e por quê, e proponha legenda no modelo do manual (pergunte o pilar se não estiver claro).]`;
      } catch (e) { msg.texto = (msg.texto ? msg.texto + '\n' : '') + `[imagem recebida, mas não consegui hospedar: ${e.message}]`; }
    } else msg.texto = (msg.texto ? msg.texto + '\n' : '') + '[imagem recebida; leitura de imagem entra na v2]';
  }
  if (msg.tipo === 'arquivo') msg.texto = (msg.texto ? msg.texto + '\n' : '') + `[arquivo recebido: ${msg.midia?.mime || ''}; entra na v2]`;
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
  let modulo = null;
  const cabeca = msg.texto.trim().slice(0, 40).toLowerCase();
  const nomesPadrao = { diretor: ['diretor'], secretaria: ['secretária', 'secretaria'], producao: ['produção', 'producao'], documentos: ['documentos'], financeiro: ['financeiro'], social: ['mia', 'social'] };
  for (const mod of ativos) {
    const nomes = [...(nomesPadrao[mod] || []), (configPersona(conta.id, mod).nome || '').toLowerCase()].filter(Boolean);
    if (nomes.some(n => new RegExp(`^${n}\\b[,:!]?\\s`).test(cabeca + ' '))) { modulo = mod; break; }
  }
  if (!modulo) modulo = await classificar(msg.texto, ativos);
  console.log(`[msg] ${msg.chatId} → ${modulo}: ${msg.texto.slice(0, 80)}`);
  const prompt = montarPrompt({ modulo, conta, ativos });
  let resposta = await responder({ prompt, conta, modulo, msg });
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
