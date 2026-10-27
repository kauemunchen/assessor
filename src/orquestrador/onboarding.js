// Primeiro contato: apresenta o Fiel, cria a conta, concede o trial e orienta os primeiros passos.
// Estado persistido em SQLite (sobrevive a reinício do container). Botões a cada passo.
import { db } from '../db/index.js';
db.exec(`CREATE TABLE IF NOT EXISTS onboarding (chat_id TEXT PRIMARY KEY, estado TEXT, atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP)`);
const ler = (chat) => { const r = db.prepare('SELECT estado FROM onboarding WHERE chat_id=?').get(chat); try { return r ? JSON.parse(r.estado) : null; } catch { return null; } };
const salvar = (chat, e) => db.prepare('INSERT INTO onboarding (chat_id, estado) VALUES (?,?) ON CONFLICT(chat_id) DO UPDATE SET estado=excluded.estado, atualizado_em=CURRENT_TIMESTAMP').run(chat, JSON.stringify(e));
const apagar = (chat) => db.prepare('DELETE FROM onboarding WHERE chat_id=?').run(chat);

const LINK_MANUAL = (() => { const b = process.env.WEBAPP_URL || process.env.PUBLIC_URL || ''; return b ? `${b.replace(/\/$/, '')}/ajuda` : '/ajuda'; })();
const PRIMEIRA = `👋 *Bem-vindo ao Fiel*\n_A equipe que você não precisou contratar._\n\nSou Alfred, o Diretor. Monto sua equipe: *Olga* (agenda, e-mails, planilhas), *Estag* (documentos, validades), *Tina* (financeiro) e *MIA* (Instagram). Você delega — a gente resolve.\n\nComeça com *250 créditos grátis* (1 crédito = 1.000 tokens; story 1, carrossel 3, vídeo 5 — nada expira).\n\n📖 *Manual completo* (45 min do zero ao primeiro post): ${LINK_MANUAL}\n\nPosso começar?`;

export function onboarding(msg) {
  const texto = (msg.texto || '').trim(); const e = ler(msg.chatId);
  // Reset
  if (texto.startsWith('/start') || /^(cancela|recome[çc]a|reiniciar)\b/i.test(texto)) { apagar(msg.chatId); salvar(msg.chatId, { passo: 'inicio' }); return { texto: PRIMEIRA, botoes: [[{ t: '✅ Sim, vamos', d: 'sim' }, { t: '❓ Como funciona', d: 'como funciona' }]] }; }
  if (!e) { salvar(msg.chatId, { passo: 'inicio' }); return { texto: PRIMEIRA, botoes: [[{ t: '✅ Sim, vamos', d: 'sim' }, { t: '❓ Como funciona', d: 'como funciona' }]] }; }

  if (e.passo === 'inicio') {
    if (/^(como funciona|como|duvida|exemplo)/i.test(texto)) return { texto: `*Como o Fiel trabalha*\n\n• Você fala — áudio, texto, foto, vídeo ou link do Drive — e o assessor certo responde.\n• Cada ação externa (marcar reunião, enviar e-mail, publicar) só sai depois de você aprovar com um botão.\n• Tudo fica no histórico; o app web mostra a mesma conversa.\n• Você pode ligar/desligar assessores, convidar colegas e trocar o tom de voz da equipe.\n\nTopa criar sua conta agora?`, botoes: [[{ t: '✅ Topo', d: 'sim' }, { t: '❌ Mais tarde', d: 'não' }]] };
    if (/^(n[aã]o|agora n[aã]o|depois|mais tarde)/i.test(texto)) { apagar(msg.chatId); return 'Sem problema. Quando quiser começar é só mandar *start*.'; }
    e.passo = 'nome'; salvar(msg.chatId, e); return 'Perfeito. *Como você se chama?* (seu nome, não o da empresa)';
  }
  if (e.passo === 'nome') {
    if (texto.length < 2 || texto.length > 80) return 'Pode mandar seu nome, só o primeiro já ajuda?';
    e.nome = texto; e.passo = 'empresa'; salvar(msg.chatId, e);
    return `Prazer, ${e.nome.split(' ')[0]}. *Qual o nome da empresa* (ou do seu negócio) principal?`;
  }
  if (e.passo === 'empresa') {
    if (texto.length < 2) return 'Qual o nome da empresa?';
    e.empresa = texto; e.passo = 'equipe'; salvar(msg.chatId, e);
    return { texto: `Fechado. Com *${e.empresa}* no comando, qual assessor você quer ligar primeiro?\n\n• *Secretária* (Olga): agenda, e-mails, lembretes, documentos.\n• *Social* (MIA): posts, stories, reels, biblioteca de mídia.\n• *Financeiro* (Tina): fluxo, contas a pagar/receber (em desenvolvimento).\n\nDá para ligar os três agora, ou começar simples.`, botoes: [[{ t: '📅 Só Secretária', d: 'secretaria' }, { t: '📸 Secretária + MIA', d: 'secretaria+social' }], [{ t: '🚀 Todos', d: 'todos' }]] };
  }
  if (e.passo === 'equipe') {
    const t = texto.toLowerCase(); const mods = t.includes('todos') ? ['secretaria', 'social', 'financeiro'] : t.includes('mia') || t.includes('social') ? (t.includes('secret') ? ['secretaria', 'social'] : ['social']) : t.includes('financ') ? ['secretaria', 'financeiro'] : ['secretaria'];
    const r = db.prepare('INSERT INTO contas (nome_dono, empresa) VALUES (?,?)').run(e.nome, e.empresa);
    db.prepare('INSERT INTO usuarios (conta_id, canal, chat_id, nome, papel) VALUES (?,?,?,?,?)').run(r.lastInsertRowid, msg.conta || 'telegram', msg.chatId, e.nome, 'dono');
    for (const m of mods) db.prepare('INSERT INTO modulos (conta_id, modulo, ligado) VALUES (?,?,1)').run(r.lastInsertRowid, m);
    import('../creditos/index.js').then(c => c.concederTrial(Number(r.lastInsertRowid))).catch(() => {});
    apagar(msg.chatId);
    const nomes = mods.map(x => ({ secretaria: 'Olga (Secretária)', social: 'MIA (Social)', financeiro: 'Tina (Financeiro)' }[x])).join(', ');
    const primeiros = ['Marque uma reunião: *"agenda uma reunião com João quinta 14h"*', 'Peça um resumo do dia: *"agenda de hoje"*', mods.includes('social') ? 'Mande uma foto com uma legenda para a MIA montar um post.' : null, mods.includes('secretaria') ? 'Diga: *"conectar Google"* para plugar sua agenda e e-mail.' : null, 'Veja seus créditos a qualquer momento com *"créditos"*.'].filter(Boolean);
    return `🎉 *Conta criada no Fiel*, ${e.nome.split(' ')[0]}!\n\nEquipe ligada: ${nomes}\nSaldo: *250 créditos* de boas-vindas (nada expira).\n\n📖 *Guia completo* (45 min, com Google, Instagram, identidade de marca, tom de voz e FAQ):\n${LINK_MANUAL}\n\n*Primeiros passos no chat:*\n${primeiros.map(p => '• ' + p).join('\n')}\n\nPara abrir o app web, mande *web* e eu te passo o código.`;
  }
  // fallback
  apagar(msg.chatId); return 'Vamos recomeçar. Mande *start*.';
}
