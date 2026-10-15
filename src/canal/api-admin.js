// Painel administrativo do KM APP (/admin): contas, créditos manuais, pacotes/preços, financeiro.
// Auth: a mesma sessão web, mas restrita a contas com admin=1 (ou plano='ilimitado').
import { db } from '../db/index.js';
import { sessao } from './web.js';
import { PACOTES as PACOTES_PADRAO, TARIFAS, TRIAL_CREDITOS, PRODUTO, saldo, creditar, debitar, ilimitada } from '../creditos/index.js';

db.exec(`CREATE TABLE IF NOT EXISTS pacotes_cfg (id TEXT PRIMARY KEY, nome TEXT, creditos INTEGER, preco REAL, tipo TEXT, ativo INTEGER DEFAULT 1, ordem INTEGER DEFAULT 0)`);
// Semeia uma vez com os defaults
if (!db.prepare('SELECT COUNT(*) n FROM pacotes_cfg').get().n) { const ins = db.prepare('INSERT INTO pacotes_cfg (id, nome, creditos, preco, tipo, ordem) VALUES (?,?,?,?,?,?)'); PACOTES_PADRAO.forEach((p, i) => ins.run(p.id, p.nome, p.creditos, p.preco, p.tipo, i)); }
/** Lista oficial de pacotes (lida do banco). Substitui PACOTES_PADRAO em runtime. */
export function pacotesAtivos() { return db.prepare('SELECT id, nome, creditos, preco, tipo FROM pacotes_cfg WHERE ativo=1 ORDER BY ordem, id').all(); }

export function rotasAdmin(app) {
  const auth = (req, res, next) => {
    const s = sessao(req); if (!s) return res.status(401).json({ erro: 'não autenticado' });
    const c = db.prepare('SELECT admin, plano FROM contas WHERE id=?').get(s.conta_id);
    if (!c || !(c.admin === 1 || c.plano === 'ilimitado')) return res.status(403).json({ erro: 'acesso restrito ao administrador do KM APP' });
    req.contaId = s.conta_id; next();
  };

  // Painel inicial — números e séries dos últimos 30 dias
  app.get('/api/admin/resumo', auth, (req, res) => {
    const q = (sql, ...a) => db.prepare(sql).get(...a); const l = (sql, ...a) => db.prepare(sql).all(...a);
    const contas = q("SELECT COUNT(*) total, SUM(status='ativa') ativas, SUM(status='bloqueada') bloqueadas, SUM(status='suspensa') suspensas, SUM(plano='trial') em_trial, SUM(plano LIKE 'mensal_%') em_plano FROM contas");
    const novas = l("SELECT date(criado_em) d, COUNT(*) n FROM contas WHERE criado_em >= datetime('now','-30 days') GROUP BY d ORDER BY d");
    const faturamento = q("SELECT COALESCE(SUM(valor), 0) bruto, COUNT(*) n FROM cobrancas WHERE status='pago' AND pago_em >= datetime('now','-30 days')");
    const faturamentoHoje = q("SELECT COALESCE(SUM(valor), 0) bruto, COUNT(*) n FROM cobrancas WHERE status='pago' AND date(pago_em)=date('now','localtime')");
    const pendente = q("SELECT COALESCE(SUM(valor), 0) bruto, COUNT(*) n FROM cobrancas WHERE status='pendente'");
    const porDia = l("SELECT date(pago_em) d, SUM(valor) r FROM cobrancas WHERE status='pago' AND pago_em >= datetime('now','-30 days') GROUP BY d ORDER BY d");
    const assinaturas = q("SELECT COUNT(*) ativas, SUM(valor) mrr FROM assinaturas WHERE status='ativa'");
    const creditos = q("SELECT COALESCE(SUM(CASE WHEN quantidade>0 THEN quantidade END),0) emitidos, COALESCE(-SUM(CASE WHEN quantidade<0 THEN quantidade END),0) consumidos FROM creditos_mov WHERE criado_em >= datetime('now','-30 days')");
    const uso = q("SELECT COUNT(*) chamadas, COALESCE(SUM(tokens_in+tokens_out),0) tokens FROM uso WHERE criado_em >= datetime('now','-30 days')");
    const porModulo = l("SELECT modulo, COUNT(*) chamadas, SUM(tokens_in+tokens_out) tokens FROM uso WHERE criado_em >= datetime('now','-30 days') GROUP BY modulo ORDER BY tokens DESC");
    const topGasto = l("SELECT c.id, c.nome_dono, c.empresa, -SUM(cm.quantidade) gasto FROM creditos_mov cm JOIN contas c ON c.id=cm.conta_id WHERE cm.quantidade<0 AND cm.criado_em>=datetime('now','-30 days') GROUP BY c.id ORDER BY gasto DESC LIMIT 10");
    res.json({ produto: PRODUTO, contas, novas, faturamento_30d: faturamento, faturamento_hoje: faturamentoHoje, pendente, por_dia: porDia, assinaturas, creditos_30d: creditos, uso_30d: uso, por_modulo: porModulo, top_gasto: topGasto });
  });

  // Lista completa de contas
  app.get('/api/admin/contas', auth, (req, res) => {
    const q = String(req.query.q || '').toLowerCase(); const filtro = req.query.filtro || '';
    let sql = `SELECT c.id, c.nome_dono, c.empresa, c.plano, c.status, c.admin, c.email, c.cpf_cnpj, c.criado_em,
      (SELECT COALESCE(SUM(quantidade),0) FROM creditos_mov WHERE conta_id=c.id) saldo,
      (SELECT COALESCE(-SUM(quantidade),0) FROM creditos_mov WHERE conta_id=c.id AND quantidade<0 AND criado_em>=datetime('now','-30 days')) gasto_30d,
      (SELECT MAX(criado_em) FROM interacoes WHERE conta_id=c.id) ultimo_uso,
      (SELECT chat_id FROM usuarios WHERE conta_id=c.id AND papel='dono' LIMIT 1) chat_id
      FROM contas c`;
    const cond = []; const args = [];
    if (filtro === 'ativas') cond.push("c.status='ativa'"); else if (filtro === 'bloqueadas') cond.push("c.status='bloqueada'"); else if (filtro === 'trial') cond.push("c.plano='trial'"); else if (filtro === 'mensal') cond.push("c.plano LIKE 'mensal_%'"); else if (filtro === 'inativas') cond.push("(SELECT MAX(criado_em) FROM interacoes WHERE conta_id=c.id) < datetime('now','-14 days')");
    if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
    sql += ' ORDER BY c.id DESC LIMIT 500';
    let rows = db.prepare(sql).all(...args);
    if (q) rows = rows.filter(c => `${c.nome_dono} ${c.empresa} ${c.email} ${c.cpf_cnpj}`.toLowerCase().includes(q));
    res.json(rows);
  });

  // Detalhe de uma conta
  app.get('/api/admin/conta/:id', auth, (req, res) => {
    const id = Number(req.params.id);
    const c = db.prepare('SELECT * FROM contas WHERE id=?').get(id); if (!c) return res.status(404).json({ erro: 'não existe' });
    const movs = db.prepare('SELECT id, tipo, quantidade, motivo, modulo, ref, criado_em FROM creditos_mov WHERE conta_id=? ORDER BY id DESC LIMIT 100').all(id);
    const cobs = db.prepare('SELECT asaas_id, tipo, pacote_id, creditos, valor, forma, status, invoice_url, vencimento, pago_em, criado_em FROM cobrancas WHERE conta_id=? ORDER BY id DESC LIMIT 50').all(id);
    const assin = db.prepare("SELECT asaas_id, pacote_id, valor, status, proxima, criado_em, cancelada_em FROM assinaturas WHERE conta_id=? ORDER BY id DESC").all(id);
    const usuarios = db.prepare('SELECT id, nome, papel, chat_id, canal FROM usuarios WHERE conta_id=?').all(id);
    const uso = db.prepare("SELECT modulo, COUNT(*) chamadas, SUM(tokens_in+tokens_out) tokens FROM uso WHERE conta_id=? AND criado_em>=datetime('now','-30 days') GROUP BY modulo ORDER BY tokens DESC").all(id);
    res.json({ conta: c, saldo: saldo(id), ilimitada: ilimitada(id), movimentos: movs, cobrancas: cobs, assinaturas: assin, usuarios, uso_30d: uso });
  });

  // Crédito/débito manual
  app.post('/api/admin/conta/:id/creditos', auth, (req, res) => {
    const id = Number(req.params.id); const { operacao, quantidade, motivo = '' } = req.body || {};
    const q = Math.abs(Number(quantidade)); if (!(q > 0) || !['credito', 'debito'].includes(operacao)) return res.status(400).json({ erro: 'operação inválida' });
    const ref = `admin:${req.contaId}`;
    if (operacao === 'credito') creditar(id, q, { tipo: 'ajuste', motivo: motivo || 'ajuste manual (+)', ref });
    else db.prepare('INSERT INTO creditos_mov (conta_id, tipo, quantidade, motivo, ref) VALUES (?,?,?,?,?)').run(id, 'ajuste', -q, motivo || 'ajuste manual (-)', ref);
    res.json({ ok: true, saldo: saldo(id) });
  });

  // Mudar status/plano/admin
  app.post('/api/admin/conta/:id', auth, (req, res) => {
    const id = Number(req.params.id); const b = req.body || {};
    if (b.status && ['ativa', 'bloqueada', 'suspensa'].includes(b.status)) db.prepare('UPDATE contas SET status=? WHERE id=?').run(b.status, id);
    if (b.plano) db.prepare('UPDATE contas SET plano=? WHERE id=?').run(b.plano, id);
    if (b.admin !== undefined) {
      if (!b.admin && id === req.contaId) return res.status(400).json({ erro: 'você não pode remover seu próprio acesso de admin' });
      db.prepare('UPDATE contas SET admin=? WHERE id=?').run(b.admin ? 1 : 0, id);
    }
    res.json({ ok: true });
  });

  // Pacotes & preços
  app.get('/api/admin/pacotes', auth, (req, res) => res.json({ pacotes: db.prepare('SELECT * FROM pacotes_cfg ORDER BY ordem, id').all(), tarifas: TARIFAS, trial: TRIAL_CREDITOS }));
  app.post('/api/admin/pacotes/:id', auth, (req, res) => {
    const { nome, creditos, preco, tipo, ativo, ordem } = req.body || {};
    const atual = db.prepare('SELECT * FROM pacotes_cfg WHERE id=?').get(req.params.id);
    if (atual) db.prepare('UPDATE pacotes_cfg SET nome=?, creditos=?, preco=?, tipo=?, ativo=?, ordem=? WHERE id=?').run(nome ?? atual.nome, creditos ?? atual.creditos, preco ?? atual.preco, tipo ?? atual.tipo, ativo === undefined ? atual.ativo : (ativo ? 1 : 0), ordem ?? atual.ordem, req.params.id);
    else db.prepare('INSERT INTO pacotes_cfg (id, nome, creditos, preco, tipo, ativo, ordem) VALUES (?,?,?,?,?,?,?)').run(req.params.id, nome, Number(creditos), Number(preco), tipo || 'prepago', ativo === false ? 0 : 1, Number(ordem || 99));
    res.json({ ok: true });
  });
  app.delete('/api/admin/pacotes/:id', auth, (req, res) => { db.prepare('DELETE FROM pacotes_cfg WHERE id=?').run(req.params.id); res.json({ ok: true }); });

  // Financeiro: cobranças (todas as contas)
  app.get('/api/admin/financeiro', auth, (req, res) => {
    const status = req.query.status || null;
    const rows = db.prepare(`SELECT cb.id, cb.asaas_id, cb.tipo, cb.pacote_id, cb.valor, cb.creditos, cb.forma, cb.status, cb.vencimento, cb.pago_em, cb.criado_em, cb.invoice_url, c.id conta_id, c.nome_dono, c.empresa FROM cobrancas cb JOIN contas c ON c.id=cb.conta_id ${status ? "WHERE cb.status=?" : ''} ORDER BY cb.id DESC LIMIT 500`).all(...(status ? [status] : []));
    const mes = db.prepare("SELECT strftime('%Y-%m', pago_em) m, SUM(valor) r, COUNT(*) n FROM cobrancas WHERE status='pago' GROUP BY m ORDER BY m DESC LIMIT 12").all();
    res.json({ cobrancas: rows, por_mes: mes });
  });

  // Broadcast rápido para todos os donos (Telegram): aviso de manutenção, feature nova, etc.
  app.post('/api/admin/broadcast', auth, async (req, res) => {
    const { texto, filtro = 'ativas' } = req.body || {}; if (!texto || texto.length < 3) return res.status(400).json({ erro: 'texto curto demais' });
    const cond = filtro === 'todas' ? '' : filtro === 'trial' ? "AND c.plano='trial'" : filtro === 'bloqueadas' ? "AND c.status='bloqueada'" : "AND c.status='ativa'";
    const donos = db.prepare(`SELECT u.chat_id FROM usuarios u JOIN contas c ON c.id=u.conta_id WHERE u.papel='dono' AND u.canal='telegram' ${cond}`).all();
    const canal = (await import('./atual.js')).canalAtual();
    let enviados = 0; for (const d of donos) { try { await canal.enviar(null, d.chat_id, `📣 *KM APP* — ${texto}`); enviados++; } catch {} }
    res.json({ ok: true, enviados, total: donos.length });
  });
}
