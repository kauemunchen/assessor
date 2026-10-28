// Primeiro contato pelo Telegram: cadastro NÃO acontece mais aqui.
// Fluxo oficial: criar conta em usefiel.com e, depois, vincular o Telegram pelo painel.
// Mantemos o estado persistido só para registro histórico; novas interações apenas orientam.
import { db } from '../db/index.js';
db.exec(`CREATE TABLE IF NOT EXISTS onboarding (chat_id TEXT PRIMARY KEY, estado TEXT, atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP)`);
const salvar = (chat, e) => db.prepare('INSERT INTO onboarding (chat_id, estado) VALUES (?,?) ON CONFLICT(chat_id) DO UPDATE SET estado=excluded.estado, atualizado_em=CURRENT_TIMESTAMP').run(chat, JSON.stringify(e));

const SITE = (() => { const b = process.env.WEBAPP_URL || process.env.PUBLIC_URL || 'https://usefiel.com'; return b.replace(/\/$/, ''); })();
const LINK_MANUAL = `${SITE}/ajuda`;

const MSG = `👋 *Bem-vindo ao Fiel*\n_A equipe que você não precisou contratar._\n\nO cadastro agora é feito pelo nosso site — assim você aceita os Termos de Uso e a Política de Privacidade, confirma seu e-mail e CPF/CNPJ, e já começa com *250 créditos grátis*.\n\n🔗 *Crie sua conta:* ${SITE}\n📖 *Manual:* ${LINK_MANUAL}\n📱 *Suporte humano:* ola@usefiel.com · https://wa.me/5547933883929 — (47) 93388-3929\n\nDepois de criar a conta, dentro do app em *"Conectar Telegram"* você recebe o código para vincular este chat ao seu Fiel. A conversa fica sincronizada entre site e Telegram.`;

export function onboarding(msg) {
  // Registra o toque e devolve a orientação. Sem perguntas, sem botões de criação de conta.
  salvar(msg.chatId, { passo: 'orienta-site', visto_em: new Date().toISOString() });
  return MSG;
}
