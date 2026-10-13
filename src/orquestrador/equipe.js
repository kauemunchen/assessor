// Pessoas da equipe do dono no Telegram: convite por código, recados, tarefas delegadas e respostas de volta ao dono.
import { db } from '../db/index.js';
import { getCanal } from '../canal/atual.js';

const gerarCodigo = () => Math.random().toString(36).slice(2, 8).toUpperCase();
export function criarConvite(contaId, nome) {
  const codigo = gerarCodigo();
  db.prepare('INSERT INTO convites (conta_id, codigo, nome) VALUES (?,?,?)').run(contaId, codigo, nome);
  return codigo;
}
export function listarPessoas(contaId) {
  return db.prepare("SELECT id, nome, papel, chat_id FROM usuarios WHERE conta_id=? AND papel<>'dono' ORDER BY nome").all(contaId);
}
export function acharPessoa(contaId, nome) {
  const n = String(nome || '').trim().toLowerCase();
  const todos = listarPessoas(contaId);
  return todos.find(p => p.nome.toLowerCase() === n) || todos.find(p => p.nome.toLowerCase().startsWith(n)) || todos.find(p => p.nome.toLowerCase().includes(n)) || null;
}
export function donoDe(contaId) { return db.prepare("SELECT * FROM usuarios WHERE conta_id=? AND papel='dono'").get(contaId); }

/** Mensagem sem conta: tenta "entrar CODIGO" / "/start CODIGO". Devolve resposta ou null. */
export async function tentarEntrar(msg) {
  const m = (msg.texto || '').trim().match(/^(?:\/start\s+|entrar\s+|c[óo]digo\s+)?([A-Z0-9]{6})$/i);
  if (!m) return null;
  const conv = db.prepare('SELECT * FROM convites WHERE codigo=? AND usado=0').get(m[1].toUpperCase());
  if (!conv) return 'Código não encontrado ou já usado. Peça um novo para quem te convidou.';
  const conta = db.prepare('SELECT * FROM contas WHERE id=?').get(conv.conta_id);
  db.prepare('INSERT INTO usuarios (conta_id, canal, chat_id, nome, papel) VALUES (?,?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET conta_id=excluded.conta_id, nome=excluded.nome, papel=excluded.papel').run(conv.conta_id, 'telegram', msg.chatId, conv.nome, 'colaborador');
  db.prepare('UPDATE convites SET usado=1, chat_id=? WHERE id=?').run(msg.chatId, conv.id);
  const dono = donoDe(conv.conta_id);
  if (dono) getCanal().enviar(null, dono.chat_id, `👋 ${conv.nome} entrou na sua equipe pelo Telegram. Já pode mandar recados e tarefas: "Olga, avisa ${conv.nome.split(' ')[0]} que…"`).catch(() => {});
  return `Olá, ${conv.nome}! Sou a assistente de ${conta.nome_dono}. Por aqui você vai receber recados e tarefas dele(a). Para responder, é só escrever aqui — eu repasso. Quando terminar uma tarefa, mande "feito".`;
}

/** Fluxo de quem NÃO é dono: respostas, "feito", e repasse ao dono. */
export async function fluxoColaborador(msg, conta, usuario) {
  const canal = getCanal(); const dono = donoDe(conta.id); const t = (msg.texto || '').trim();
  if (!dono) return 'Não achei o responsável desta conta.';
  if (msg.tipo !== 'texto' && !t) return 'Por aqui só consigo repassar texto. Pode escrever?';
  if (/^(feito|conclu[íi]|pronto|terminei|finalizei|ok,? feito)\b/i.test(t)) {
    const tarefa = db.prepare("SELECT * FROM tarefas WHERE conta_id=? AND usuario_id=? AND status='aberta' ORDER BY prazo IS NULL, prazo, id DESC LIMIT 1").get(conta.id, usuario.id);
    if (tarefa) {
      db.prepare("UPDATE tarefas SET status='concluida', concluida_em=CURRENT_TIMESTAMP WHERE id=?").run(tarefa.id);
      await canal.enviar(null, dono.chat_id, `✅ ${usuario.nome} concluiu: *${tarefa.titulo}*${t.length > 12 ? `\n"${t}"` : ''}`);
      const restantes = db.prepare("SELECT COUNT(*) n FROM tarefas WHERE conta_id=? AND usuario_id=? AND status='aberta'").get(conta.id, usuario.id).n;
      return `Anotado como concluída: ${tarefa.titulo}. ${restantes ? `Você ainda tem ${restantes} em aberto — mande "minhas tarefas" para ver.` : 'Nada mais pendente.'}`;
    }
  }
  if (/^(minhas )?tarefas$/i.test(t)) {
    const abertas = db.prepare("SELECT titulo, prazo, descricao FROM tarefas WHERE conta_id=? AND usuario_id=? AND status='aberta' ORDER BY prazo IS NULL, prazo").all(conta.id, usuario.id);
    return abertas.length ? `Suas tarefas:\n${abertas.map(x => `- ${x.titulo}${x.prazo ? ` (até ${x.prazo.split('-').reverse().join('/')})` : ''}`).join('\n')}\n\nQuando terminar uma, mande "feito".` : 'Nenhuma tarefa em aberto.';
  }
  await canal.enviar(null, dono.chat_id, `💬 *${usuario.nome}*: ${t}`);
  db.prepare('INSERT INTO interacoes (conta_id, modulo, entrada, saida) VALUES (?,?,?,?)').run(conta.id, 'secretaria', `[mensagem de ${usuario.nome} (equipe)]: ${t}`, '(repassada ao dono)');
  return `Repassei para ${dono.nome || conta.nome_dono}.`;
}

/** Ferramentas da Secretária: recado e tarefa delegada. */
export async function enviarRecado(conta, { pessoa, texto }) {
  const p = acharPessoa(conta.id, pessoa); if (!p) throw new Error(`Não achei "${pessoa}" na equipe. Pessoas: ${listarPessoas(conta.id).map(x => x.nome).join(', ') || 'nenhuma'}. Para adicionar: "convidar <Nome>".`);
  await getCanal().enviar(null, p.chat_id, `📨 Recado de ${conta.nome_dono}:\n\n${texto}\n\n(Responda aqui que eu repasso.)`);
  db.prepare('INSERT INTO interacoes (conta_id, modulo, entrada, saida) VALUES (?,?,?,?)').run(conta.id, 'secretaria', `[recado enviado a ${p.nome}]`, texto);
  return { entregue_a: p.nome };
}
export async function delegarTarefa(conta, { pessoa, titulo, prazo, detalhes }) {
  const p = acharPessoa(conta.id, pessoa); if (!p) throw new Error(`Não achei "${pessoa}" na equipe. Pessoas: ${listarPessoas(conta.id).map(x => x.nome).join(', ') || 'nenhuma'}. Para adicionar: "convidar <Nome>".`);
  const r = db.prepare('INSERT INTO tarefas (conta_id, titulo, responsavel, usuario_id, prazo, descricao) VALUES (?,?,?,?,?,?)').run(conta.id, titulo, p.nome, p.id, prazo || null, detalhes || null);
  await getCanal().enviar(null, p.chat_id, `📋 Nova tarefa de ${conta.nome_dono}:\n\n*${titulo}*${detalhes ? `\n${detalhes}` : ''}${prazo ? `\nPrazo: ${prazo.split('-').reverse().join('/')}` : ''}\n\nQuando terminar, mande "feito". Dúvidas, escreva aqui.`);
  return { tarefa_id: r.lastInsertRowid, para: p.nome, prazo: prazo || null };
}
export function listarDelegadas(contaId, { pessoa, status = 'aberta' } = {}) {
  const p = pessoa ? acharPessoa(contaId, pessoa) : null;
  return db.prepare(`SELECT id, titulo, responsavel, prazo, status, criado_em FROM tarefas WHERE conta_id=? AND usuario_id IS NOT NULL ${status ? 'AND status=?' : ''} ${p ? 'AND usuario_id=?' : ''} ORDER BY prazo IS NULL, prazo`).all(contaId, ...(status ? [status] : []), ...(p ? [p.id] : []));
}
/** Cobrança diária: tarefas delegadas vencendo hoje/atrasadas → lembra a pessoa e avisa o dono. */
export async function cobrarDelegadas() {
  const canal = getCanal(); const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const rows = db.prepare("SELECT t.*, u.chat_id, u.nome FROM tarefas t JOIN usuarios u ON u.id=t.usuario_id WHERE t.status='aberta' AND t.prazo IS NOT NULL AND t.prazo<=?").all(hoje);
  const porConta = {};
  for (const t of rows) {
    const atrasada = t.prazo < hoje;
    await canal.enviar(null, t.chat_id, `⏰ ${atrasada ? 'Atrasada' : 'Vence hoje'}: *${t.titulo}*. Mande "feito" quando concluir ou me diga o que está travando.`).catch(() => {});
    (porConta[t.conta_id] ||= []).push(`- ${t.nome}: ${t.titulo}${atrasada ? ` (atrasada desde ${t.prazo.split('-').reverse().join('/')})` : ' (hoje)'}`);
  }
  for (const [contaId, linhas] of Object.entries(porConta)) { const d = donoDe(contaId); if (d) await canal.enviar(null, d.chat_id, `📋 Tarefas delegadas vencendo:\n${linhas.join('\n')}`).catch(() => {}); }
}
