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
    const auth = (req, res, next) => { const s = sessao(req); if (!s) return res.status(401).json({ erro: 'não autenticado' }); req.sessao = s; next(); };
    app.get('/api/me', auth, async (req, res) => {
      const conta = db.prepare('SELECT id, nome_dono, empresa, foco_mes, empresas FROM contas WHERE id=?').get(req.sessao.conta_id);
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
