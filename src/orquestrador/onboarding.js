// Primeiro contato: cria conta + usuário dono em duas mensagens. Estado em memória simples.
import { db } from '../db/index.js';
const estado = new Map();
export function onboarding(msg) {
  const texto = (msg.texto || '').trim();
  const e = estado.get(msg.chatId);
  if (!e || texto.startsWith('/')) { estado.set(msg.chatId, { passo: 1 }); return 'Olá! Sou o Diretor do seu escritório. Como você se chama?'; }
  if (e.passo === 1) { e.nome = texto; e.passo = 2; return `Prazer, ${e.nome}. Qual o nome da sua empresa principal?`; }
  const r = db.prepare('INSERT INTO contas (nome_dono, empresa) VALUES (?,?)').run(e.nome, texto);
  db.prepare('INSERT INTO usuarios (conta_id, canal, chat_id, nome, papel) VALUES (?,?,?,?,?)').run(r.lastInsertRowid, 'telegram', msg.chatId, e.nome, 'dono');
  db.prepare('INSERT INTO modulos (conta_id, modulo, ligado) VALUES (?,?,1)').run(r.lastInsertRowid, 'secretaria');
  estado.delete(msg.chatId);
  return `Conta criada. A Secretária já está ligada. Pode mandar áudio ou texto: "marca reunião com o João quinta 14h", "me lembra de pagar o INSS dia 20". Para conectar o Google Agenda, diga "conectar Google".`;
}
