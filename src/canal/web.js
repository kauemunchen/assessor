// Canal Web: API + WebSocket para o app (app em /app). Mesma conta e mesmo roteador do Telegram.
// Login: o app mostra um código; o dono manda "web CÓDIGO" ao bot → sessão criada (cookie). Sem senha.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { db } from '../db/index.js';

const UPLOADS = path.resolve('data/uploads'); fs.mkdirSync(UPLOADS, { recursive: true });
db.exec(`CREATE TABLE IF NOT EXISTS web_sessoes (token TEXT PRIMARY KEY, conta_id INTEGER, chat_id TEXT, criado_em TEXT DEFAULT CURRENT_TIMESTAMP, ultimo_uso TEXT);
CREATE TABLE IF NOT EXISTS web_codigos (codigo TEXT PRIMARY KEY, token TEXT, criado_em TEXT DEFAULT CURRENT_TIMESTAMP, usado INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS mensagens (id INTEGER PRIMARY KEY, conta_id INTEGER, direcao TEXT, canal TEXT, modulo TEXT, tipo TEXT, texto TEXT, midia TEXT, botoes TEXT, criado_em TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_msgs_conta ON mensagens (conta_id, id);`);

const cookie = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=').map(decodeURIComponent)).filter(x => x[0]));
export function sessao(req) {
  const tok = cookie(req).akm || (req.headers.authorization || '').replace(/^Bearer /, '') || req.query?.token;
  if (!tok) return null;
  const s = db.prepare('SELECT * FROM web_sessoes WHERE token=?').get(tok); if (!s) return null;
  db.prepare('UPDATE web_sessoes SET ultimo_uso=CURRENT_TIMESTAMP WHERE token=?').run(tok);
  return s;
}

export class WebCanal {
  constructor(app, servidor) {
    this.app = app; this.sockets = new Map(); // contaId → Set<ws>
    this.wss = new WebSocketServer({ noServer: true });
    servidor.on('upgrade', (req, socket, head) => {
      if (!req.url.startsWith('/ws')) return;
      const url = new URL(req.url, 'http://x'); const s = sessao({ headers: req.headers, query: Object.fromEntries(url.searchParams) });
      if (!s) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }
      this.wss.handleUpgrade(req, socket, head, (ws) => { ws.contaId = s.conta_id; ws.chatId = s.chat_id; const set = this.sockets.get(s.conta_id) || new Set(); set.add(ws); this.sockets.set(s.conta_id, set); ws.on('close', () => set.delete(ws)); ws.send(JSON.stringify({ tipo: 'ola', conta_id: s.conta_id })); });
    });
    this._rotas();
  }
  aoReceber(fn) { this.fn = fn; }
  /** Registra e transmite uma mensagem (de qualquer canal) para os sockets da conta. */
  registrar(contaId, m) {
    const r = db.prepare('INSERT INTO mensagens (conta_id, direcao, canal, modulo, tipo, texto, midia, botoes) VALUES (?,?,?,?,?,?,?,?)')
      .run(contaId, m.direcao, m.canal || 'web', m.modulo || null, m.tipo || 'texto', m.texto || '', m.midia ? JSON.stringify(m.midia) : null, m.botoes ? JSON.stringify(m.botoes) : null);
    const row = db.prepare('SELECT * FROM mensagens WHERE id=?').get(r.lastInsertRowid);
    this.transmitir(contaId, { tipo: 'mensagem', mensagem: formatar(row) });
    return row.id;
  }
  transmitir(contaId, evento) { for (const ws of this.sockets.get(Number(contaId)) || []) { try { ws.send(JSON.stringify(evento)); } catch {} } }
  digitando(contaId) { this.transmitir(contaId, { tipo: 'digitando' }); }
  async baixarMidia(ref) { const p = path.join(UPLOADS, path.basename(String(ref).replace(/^web:/, ''))); const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); }
  _rotas() {
    const app = this.app;
    // login por código via bot
    app.post('/api/login/iniciar', (req, res) => { const codigo = String(Math.floor(100000 + Math.random() * 900000)); const token = crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO web_codigos (codigo, token) VALUES (?,?)').run(codigo, token); res.json({ codigo, token, bot: process.env.TELEGRAM_BOT_USERNAME || 'AssessorKM_bot' }); });
    app.get('/api/login/status', (req, res) => { const c = db.prepare('SELECT * FROM web_codigos WHERE token=?').get(req.query.token || ''); if (!c) return res.status(404).json({ ok: false }); if (!c.usado) return res.json({ ok: false, aguardando: true }); res.setHeader('Set-Cookie', `akm=${c.token}; Path=/; Max-Age=${180 * 86400}; SameSite=Lax; HttpOnly${process.env.PUBLIC_URL?.startsWith('https') ? '; Secure' : ''}`); res.json({ ok: true, token: c.token }); });
    app.post('/api/logout', (req, res) => { const s = sessao(req); if (s) db.prepare('DELETE FROM web_sessoes WHERE token=?').run(s.token); res.setHeader('Set-Cookie', 'akm=; Path=/; Max-Age=0'); res.json({ ok: true }); });

    // ---------- Cadastro público e login por e-mail+senha ----------
    const limpar = (s) => String(s || '').trim(); const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    const hash = (senha) => { const salt = crypto.randomBytes(16); const d = crypto.scryptSync(senha, salt, 64); return 's1$' + salt.toString('hex') + '$' + d.toString('hex'); };
    const verifica = (senha, armazenado) => { try { const [v, saltHex, dHex] = String(armazenado).split('$'); if (v !== 's1') return false; const d = crypto.scryptSync(senha, Buffer.from(saltHex, 'hex'), 64); return crypto.timingSafeEqual(d, Buffer.from(dHex, 'hex')); } catch { return false; } };
    const setCookie = (res, tok) => res.setHeader('Set-Cookie', `akm=${tok}; Path=/; Max-Age=${180 * 86400}; SameSite=Lax; HttpOnly${process.env.PUBLIC_URL?.startsWith('https') || process.env.WEBAPP_URL?.startsWith('https') ? '; Secure' : ''}`);

    const _norm = (s) => String(s || '').replace(/\D/g, '');
    let _doc = null; import('../utils/doc.js').then(m => { _doc = m; });
    const _val = (s) => _doc ? _doc.docValido(s) : (_norm(s).length === 11 || _norm(s).length === 14);
    app.post('/api/cadastro', async (req, res) => {
      const b = req.body || {}; const nome = limpar(b.nome), empresa = limpar(b.empresa) || nome, email = limpar(b.email).toLowerCase(), senha = String(b.senha || ''), cpfCnpj = limpar(b.cpf_cnpj).replace(/\D/g, '');
      if (!nome || nome.length < 2) return res.status(400).json({ erro: 'informe seu nome' });
      if (!emailOk(email)) return res.status(400).json({ erro: 'e-mail inválido' });
      if (!_val(cpfCnpj)) return res.status(400).json({ erro: 'CPF ou CNPJ inválido — confira os números' });
      if (senha.length < 8) return res.status(400).json({ erro: 'senha precisa ter pelo menos 8 caracteres' });
      if (db.prepare('SELECT id FROM usuarios WHERE email=?').get(email) || db.prepare('SELECT id FROM contas WHERE email=?').get(email)) return res.status(400).json({ erro: 'Esse e-mail já está em uso. Clique em “Entrar” ou use outro e-mail.' });
      if (db.prepare('SELECT id FROM contas WHERE cpf_cnpj=?').get(_norm(cpfCnpj))) return res.status(400).json({ erro: 'Esse CPF/CNPJ já está cadastrado em outra conta.' });
      const r = db.prepare('INSERT INTO contas (nome_dono, empresa, cpf_cnpj, email) VALUES (?,?,?,?)').run(nome, empresa, _norm(cpfCnpj), email);
      const contaId = Number(r.lastInsertRowid);
      // Primeira conta do banco vira admin ilimitado automaticamente
      if (!db.prepare('SELECT id FROM contas WHERE admin=1 AND id<>?').get(contaId)) db.prepare("UPDATE contas SET admin=1, plano='ilimitado' WHERE id=?").run(contaId);
      const chatSinteico = `web:${contaId}`; db.prepare('INSERT INTO usuarios (conta_id, canal, chat_id, nome, papel, email, senha_hash) VALUES (?,?,?,?,?,?,?)').run(contaId, 'web', chatSinteico, nome, 'dono', email, hash(senha));
      for (const m of ['secretaria', 'social']) db.prepare('INSERT INTO modulos (conta_id, modulo, ligado) VALUES (?,?,1)').run(contaId, m);
      try { const c = await import('../creditos/index.js'); c.concederTrial(contaId); } catch {}
      const tok = crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO web_sessoes (token, conta_id, chat_id) VALUES (?,?,?)').run(tok, contaId, chatSinteico);
      setCookie(res, tok);
      // Mensagem de boas-vindas: já cai no histórico do app, para o dono encontrar o manual sem precisar mandar nada antes
      try {
        const base = process.env.WEBAPP_URL || process.env.PUBLIC_URL || '';
        const linkManual = base ? `${base.replace(/\/$/, '')}/ajuda` : '/ajuda';
        const boasVindas = `👋 Bem-vindo ao *Fiel*, ${nome.split(' ')[0]}.\n_A equipe que você não precisou contratar._\n\nSou Alfred, o seu Diretor. Montei o time: *Olga* (Secretária — agenda, e-mails, planilhas), *Estag* (Documentos), *Tina* (Financeiro) e *MIA* (Instagram). Você delega — a gente resolve. Nada sai sem seu "sim".\n\nVocê começa com *250 créditos grátis* — nada expira.\n\n📖 *Antes de qualquer coisa*, dá uma lida no manual: ele leva você em 45 min do zero até o primeiro post publicado (Telegram, Google, Instagram, identidade de marca, tom de voz, FAQ):\n\n${linkManual}\n\n📱 *Suporte humano:* ola@usefiel.com · https://wa.me/5547933883929 — (47) 93388-3929\n\nQualquer dúvida, é só perguntar aqui. Como posso ajudar?`;
        this.registrar(contaId, { direcao: 'saida', canal: 'bot', modulo: 'diretor', tipo: 'texto', texto: boasVindas });
      } catch {}
      res.json({ ok: true, token: tok });
    });

    app.post('/api/login/senha', (req, res) => {
      const email = limpar(req.body?.email).toLowerCase(); const senha = String(req.body?.senha || '');
      const u = db.prepare('SELECT * FROM usuarios WHERE email=?').get(email);
      if (!u || !u.senha_hash || !verifica(senha, u.senha_hash)) return res.status(401).json({ erro: 'e-mail ou senha incorretos' });
      const tok = crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO web_sessoes (token, conta_id, chat_id) VALUES (?,?,?)').run(tok, u.conta_id, u.chat_id);
      db.prepare('UPDATE usuarios SET ultimo_login=CURRENT_TIMESTAMP WHERE id=?').run(u.id);
      setCookie(res, tok); res.json({ ok: true, token: tok });
    });

    app.post('/api/senha', (req, res) => {
      const s = sessao(req); if (!s) return res.status(401).json({ erro: 'não autenticado' });
      const atual = String(req.body?.atual || ''); const nova = String(req.body?.nova || '');
      if (nova.length < 8) return res.status(400).json({ erro: 'nova senha precisa ter pelo menos 8 caracteres' });
      const u = db.prepare('SELECT * FROM usuarios WHERE conta_id=? AND papel=\'dono\' LIMIT 1').get(s.conta_id);
      if (u.senha_hash && !verifica(atual, u.senha_hash)) return res.status(400).json({ erro: 'senha atual incorreta' });
      db.prepare('UPDATE usuarios SET senha_hash=? WHERE id=?').run(hash(nova), u.id); res.json({ ok: true });
    });
    const auth = (req, res, next) => { const s = sessao(req); if (!s) return res.status(401).json({ erro: 'não autenticado' }); req.sessao = s; next(); };
    app.get('/api/me', auth, async (req, res) => {
      const conta = db.prepare('SELECT id, nome_dono, empresa, foco_mes, empresas, admin, plano, email, cpf_cnpj FROM contas WHERE id=?').get(req.sessao.conta_id);
      const modulos = db.prepare('SELECT modulo FROM modulos WHERE conta_id=? AND ligado=1').all(conta.id).map(x => x.modulo);
      const personas = db.prepare('SELECT modulo, nome FROM persona_config WHERE conta_id=?').all(conta.id);
      let creditos = null; try { const c = await import('../creditos/index.js'); creditos = { saldo: c.saldo(conta.id), ilimitada: c.ilimitada(conta.id), base: c.ultimaRecarga(conta.id), produto: c.PRODUTO }; } catch {}
      res.json({ conta, modulos: ['diretor', ...modulos], personas, creditos });
    });
    app.get('/api/mensagens', auth, (req, res) => {
      const antes = Number(req.query.antes || 0); const lim = Math.min(200, Number(req.query.limite || 60));
      const rows = antes ? db.prepare('SELECT * FROM mensagens WHERE conta_id=? AND id<? ORDER BY id DESC LIMIT ?').all(req.sessao.conta_id, antes, lim) : db.prepare('SELECT * FROM mensagens WHERE conta_id=? ORDER BY id DESC LIMIT ?').all(req.sessao.conta_id, lim);
      res.json(rows.reverse().map(formatar));
    });
    // enviar texto / upload (multipart simples: campo 'arquivo' + 'texto')
    app.post('/api/enviar', auth, async (req, res) => {
      const ct = req.headers['content-type'] || ''; let texto = '', midia = null, tipo = 'texto';
      if (ct.startsWith('multipart/')) {
        const { campos, arquivo } = await lerMultipart(req);
        texto = campos.texto || '';
        if (arquivo) {
          const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(arquivo.nome || '') || ''}`;
          fs.writeFileSync(path.join(UPLOADS, id), arquivo.bytes);
          const mime = arquivo.mime || 'application/octet-stream';
          tipo = /^audio\//.test(mime) ? 'audio' : /^video\//.test(mime) ? 'video' : /^image\//.test(mime) ? 'imagem' : 'arquivo';
          midia = { ref: `web:${id}`, mime, nome: arquivo.nome, tamanho: arquivo.bytes.length, url: `/api/upload/${id}` };
        }
      } else { texto = String(req.body?.texto || ''); }
      if (!texto && !midia) return res.status(400).json({ erro: 'vazio' });
      res.json({ ok: true });
      this.fn({ conta: null, chatId: req.sessao.chat_id, remetente: req.sessao.chat_id, tipo, texto, midia, recebidoEm: new Date(), origem: 'web' }).catch(e => console.error('[web] enviar', e.message));
    });
    app.get('/api/upload/:id', auth, (req, res) => { const p = path.join(UPLOADS, path.basename(req.params.id)); if (!fs.existsSync(p)) return res.sendStatus(404); res.sendFile(p); });
  }
}
function formatar(r) { return { id: r.id, direcao: r.direcao, canal: r.canal, modulo: r.modulo, tipo: r.tipo, texto: r.texto, midia: r.midia ? JSON.parse(r.midia) : null, botoes: r.botoes ? JSON.parse(r.botoes) : null, em: r.criado_em }; }

/** Login por código: chamado pela governança quando o dono manda "web 123456" ao bot. */
export function concluirLogin(codigo, contaId, chatId) {
  const c = db.prepare('SELECT * FROM web_codigos WHERE codigo=? AND usado=0').get(String(codigo));
  if (!c) return false;
  if ((Date.now() - new Date(c.criado_em + 'Z').getTime()) > 10 * 60000) return false;
  db.prepare('INSERT INTO web_sessoes (token, conta_id, chat_id) VALUES (?,?,?)').run(c.token, contaId, chatId);
  db.prepare('UPDATE web_codigos SET usado=1 WHERE codigo=?').run(c.codigo);
  return true;
}

// multipart mínimo (um arquivo + campos de texto), sem dependências
function lerMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('error', reject);
    req.on('end', () => {
      const buf = Buffer.concat(chunks); const b = (req.headers['content-type'].match(/boundary=([^;]+)/) || [])[1]; if (!b) return resolve({ campos: {}, arquivo: null });
      const sep = Buffer.from(`--${b}`); const campos = {}; let arquivo = null; let p = buf.indexOf(sep);
      while (p !== -1) {
        const ini = p + sep.length + 2; const next = buf.indexOf(sep, ini); if (next === -1) break;
        const parte = buf.subarray(ini, next - 2); const hEnd = parte.indexOf('\r\n\r\n'); if (hEnd === -1) { p = next; continue; }
        const head = parte.subarray(0, hEnd).toString(); const body = parte.subarray(hEnd + 4);
        const nome = (head.match(/name="([^"]+)"/) || [])[1]; const fname = (head.match(/filename="([^"]*)"/) || [])[1]; const mime = (head.match(/Content-Type:\s*([^\r\n]+)/i) || [])[1];
        if (fname !== undefined) arquivo = { nome: fname, mime, bytes: body }; else if (nome) campos[nome] = body.toString('utf8');
        p = next;
      }
      resolve({ campos, arquivo });
    });
  });
}
