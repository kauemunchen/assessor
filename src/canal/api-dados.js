// API: Calendário editorial (posts, biblioteca) e Documentos (arquivo, vencimentos, cadastros).
import { db } from '../db/index.js';
import { sessao } from './web.js';
import { contextoUso } from '../integracoes/gemini.js';

export function rotasDados(app) {
  const auth = (req, res, next) => { const s = sessao(req); if (!s) return res.status(401).json({ erro: 'não autenticado' }); req.contaId = s.conta_id; req.chatId = s.chat_id; contextoUso.contaId = s.conta_id; next(); };
  const conta = (req) => db.prepare('SELECT * FROM contas WHERE id=?').get(req.contaId);
  const mapaPost = (p) => ({ id: p.id, formato: p.formato, pilar: p.pilar, tema: p.tema, data: p.data, legenda: p.legenda, hashtags: p.hashtags, status: p.status, ig_media_id: p.ig_media_id, publicado_em: p.publicado_em, criado_em: p.criado_em,
    midias: p.midia_url ? (p.midia_url.startsWith('[') ? JSON.parse(p.midia_url) : [p.midia_url]) : [], video: !!p.midia_url && /\.(mp4|mov|webm)(\?|$)|\/video\/upload\//.test(p.midia_url) });

  // ---------- Calendário editorial ----------
  app.get('/api/editorial', auth, (req, res) => {
    const { de, ate } = req.query;
    const rows = de && ate ? db.prepare("SELECT * FROM posts WHERE conta_id=? AND ((data BETWEEN ? AND ?) OR data IS NULL) ORDER BY data IS NULL, data").all(req.contaId, de, ate + 'T23:59') : db.prepare('SELECT * FROM posts WHERE conta_id=? ORDER BY data IS NULL, data DESC LIMIT 300').all(req.contaId);
    res.json(rows.map(mapaPost));
  });
  app.post('/api/editorial/:id', auth, async (req, res) => {
    const soc = await import('../ferramentas/social.js'); const c = conta(req); const b = req.body || {};
    const p = db.prepare('SELECT * FROM posts WHERE id=? AND conta_id=?').get(req.params.id, req.contaId); if (!p) return res.status(404).json({ erro: 'post não existe' });
    if (b.data !== undefined) {
      if (b.data) { await soc.executar('agendar_post', { post_id: p.id, data: b.data }, c, { chatId: req.chatId }); }
      else { db.prepare("UPDATE posts SET status='rascunho', data=NULL WHERE id=?").run(p.id); }
    }
    const campos = {}; for (const k of ['legenda', 'hashtags', 'tema', 'pilar', 'formato']) if (b[k] !== undefined) campos[k] = b[k];
    if (Object.keys(campos).length) await soc.executar('atualizar_post', { post_id: p.id, ...campos }, c, { chatId: req.chatId });
    res.json(mapaPost(db.prepare('SELECT * FROM posts WHERE id=?').get(p.id)));
  });
  app.post('/api/editorial/:id/publicar', auth, async (req, res) => {
    const soc = await import('../ferramentas/social.js');
    try { const r = await soc.publicarPost(req.contaId, Number(req.params.id)); res.json({ ok: true, ...r }); } catch (e) { db.prepare("UPDATE posts SET status='erro' WHERE id=? AND conta_id=?").run(req.params.id, req.contaId); res.status(400).json({ erro: e.message }); }
  });
  app.delete('/api/editorial/:id', auth, async (req, res) => {
    const p = db.prepare('SELECT * FROM posts WHERE id=? AND conta_id=?').get(req.params.id, req.contaId); if (!p) return res.status(404).json({ erro: 'post não existe' });
    if (p.status === 'publicado') return res.status(400).json({ erro: 'post já publicado; apague no Instagram' });
    if (p.gcal_event_id) { try { const g = await import('../integracoes/google-calendar.js'); await g.cancelarEvento(req.contaId, p.gcal_event_id); } catch {} }
    db.prepare('DELETE FROM posts WHERE id=?').run(p.id); res.json({ ok: true });
  });
  app.get('/api/biblioteca', auth, async (req, res) => {
    const soc = await import('../ferramentas/social.js');
    const aj = await import('./api-marca.js'); const dias = Number(aj.ajuste(req.contaId, 'retencao_biblioteca_dias', process.env.BIBLIOTECA_RETENCAO_DIAS || 15));
    const rows = db.prepare('SELECT * FROM biblioteca WHERE conta_id=? ORDER BY id DESC LIMIT 200').all(req.contaId);
    res.json(rows.map(b => ({ id: b.id, tipo: b.tipo, origem: b.origem, descricao: b.descricao, url: b.marcada_url || b.url, original: b.url, duracao: b.duracao, largura: b.largura, altura: b.altura, usada: !!b.usado_em, protegida: !!b.protegida, em: b.criado_em, dias_restantes: b.protegida ? null : dias - Math.floor((Date.now() - new Date(b.criado_em.replace(' ', 'T') + 'Z')) / 864e5) })));
  });
  app.post('/api/biblioteca/:id', auth, (req, res) => {
    const b = req.body || {}; if (b.protegida !== undefined) db.prepare('UPDATE biblioteca SET protegida=? WHERE id=? AND conta_id=?').run(b.protegida ? 1 : 0, req.params.id, req.contaId);
    if (b.descricao !== undefined) db.prepare('UPDATE biblioteca SET descricao=? WHERE id=? AND conta_id=?').run(b.descricao, req.params.id, req.contaId);
    res.json({ ok: true });
  });
  app.delete('/api/biblioteca/:id', auth, async (req, res) => {
    const b = db.prepare('SELECT * FROM biblioteca WHERE id=? AND conta_id=?').get(req.params.id, req.contaId); if (!b) return res.status(404).json({ erro: 'não existe' });
    const emUso = db.prepare("SELECT id FROM posts WHERE conta_id=? AND status IN ('agendado','rascunho') AND (midia_url LIKE ? OR midia_url LIKE ?)").get(req.contaId, `%${b.url}%`, `%${b.marcada_url || '∅'}%`);
    if (emUso) return res.status(400).json({ erro: `em uso no post #${emUso.id}` });
    const { apagar } = await import('../integracoes/cloudinary.js'); for (const u of [b.url, b.marcada_url].filter(Boolean)) { try { await apagar(u); } catch {} }
    db.prepare('DELETE FROM biblioteca WHERE id=?').run(b.id); res.json({ ok: true });
  });
  app.post('/api/biblioteca/:id/post', auth, async (req, res) => {
    const b = db.prepare('SELECT * FROM biblioteca WHERE id=? AND conta_id=?').get(req.params.id, req.contaId); if (!b) return res.status(404).json({ erro: 'não existe' });
    const soc = await import('../ferramentas/social.js'); const { formato = (b.tipo === 'video' ? 'reels' : 'post'), data, legenda = '' } = req.body || {};
    const r = await soc.executar('criar_post', { formato, tema: b.descricao || formato, legenda, midia_url: b.marcada_url || b.url, data: data || undefined }, conta(req), { chatId: req.chatId });
    db.prepare('UPDATE biblioteca SET usado_em=CURRENT_TIMESTAMP WHERE id=?').run(b.id); res.json(r);
  });

  // ---------- Documentos ----------
  app.get('/api/documentos', auth, (req, res) => {
    const { q, empresa, tipo } = req.query; const termos = String(q || '').toLowerCase().split(/\s+/).filter(t => t.length > 2);
    let rows = db.prepare(`SELECT * FROM documentos WHERE conta_id=? AND status='ativo' ${empresa ? 'AND empresa=?' : ''} ${tipo ? 'AND tipo=?' : ''} ORDER BY data_doc DESC LIMIT 500`).all(req.contaId, ...(empresa ? [empresa] : []), ...(tipo ? [tipo] : []));
    if (termos.length) rows = rows.filter(d => { const t = `${d.titulo} ${d.contraparte} ${d.empresa} ${d.tipo} ${d.resumo} ${d.dados_json}`.toLowerCase(); return termos.every(x => t.includes(x)); });
    const empresas = db.prepare("SELECT empresa, COUNT(*) n FROM documentos WHERE conta_id=? AND status='ativo' GROUP BY empresa ORDER BY n DESC").all(req.contaId);
    const tipos = db.prepare("SELECT tipo, COUNT(*) n FROM documentos WHERE conta_id=? AND status='ativo' GROUP BY tipo ORDER BY n DESC").all(req.contaId);
    const c = conta(req);
    res.json({ docs: rows.slice(0, 200).map(d => ({ id: d.id, titulo: d.titulo, empresa: d.empresa, tipo: d.tipo, contraparte: d.contraparte, data: d.data_doc, pasta: d.pasta, link: d.drive_link, resumo: d.resumo, sensivel: !!d.sensivel, mime: d.mime, em: d.criado_em })), empresas, tipos, pasta_raiz: c.drive_pasta_id ? `https://drive.google.com/drive/folders/${c.drive_pasta_id}` : null });
  });
  app.post('/api/documentos/:id', auth, async (req, res) => {
    const doc = await import('../ferramentas/documentos.js'); const b = req.body || {};
    try { res.json(await doc.executar('atualizar_documento', { documento_id: Number(req.params.id), titulo: b.titulo, empresa: b.empresa, tipo: b.tipo, contraparte: b.contraparte, data_doc: b.data }, conta(req), {})); } catch (e) { res.status(400).json({ erro: e.message }); }
  });
  app.get('/api/vencimentos', auth, (req, res) => {
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const rows = db.prepare(`SELECT v.*, d.drive_link, d.titulo doc_titulo FROM vigencias v LEFT JOIN documentos d ON d.id=v.documento_id WHERE v.conta_id=? AND v.status='ativa' ORDER BY v.vence_em`).all(req.contaId);
    res.json(rows.map(v => ({ id: v.id, descricao: v.descricao, empresa: v.empresa, tipo: v.tipo, inicio: v.inicio, vence_em: v.vence_em, dias: Math.ceil((new Date(v.vence_em) - new Date(hoje)) / 864e5), aviso_previo_dias: v.aviso_previo_dias, renovacao_auto: !!v.renovacao_auto, link: v.drive_link, documento: v.doc_titulo, avisos: v.avisos_enviados })));
  });
  app.post('/api/vencimentos', auth, async (req, res) => {
    const doc = await import('../ferramentas/documentos.js'); const b = req.body || {};
    try { res.json(await doc.executar('registrar_vigencia', b, conta(req), {})); } catch (e) { res.status(400).json({ erro: e.message }); }
  });
  app.post('/api/vencimentos/:id/encerrar', auth, async (req, res) => {
    const doc = await import('../ferramentas/documentos.js');
    try { res.json(await doc.executar('encerrar_vigencia', { vigencia_id: Number(req.params.id), nova_data: req.body?.nova_data, motivo: req.body?.motivo }, conta(req), { confirmado: true })); } catch (e) { res.status(400).json({ erro: e.message }); }
  });
  app.get('/api/cadastros', auth, (req, res) => {
    const q = `%${String(req.query.q || '').toLowerCase()}%`;
    res.json(db.prepare('SELECT * FROM cadastros WHERE conta_id=? AND (lower(nome) LIKE ? OR documento LIKE ? OR lower(email) LIKE ? OR telefone LIKE ?) ORDER BY nome LIMIT 300').all(req.contaId, q, q, q, q)
      .map(c => ({ id: c.id, tipo: c.tipo, nome: c.nome, documento: c.documento, email: c.email, telefone: c.telefone, endereco: c.endereco, empresa_vinculo: c.empresa_vinculo, campos: JSON.parse(c.campos_json || '{}'), completo: !!c.completo, em: c.atualizado_em })));
  });
  app.post('/api/cadastros', auth, async (req, res) => {
    const doc = await import('../ferramentas/documentos.js');
    try { res.json(await doc.executar('salvar_cadastro', req.body || {}, conta(req), { confirmado: true })); } catch (e) { res.status(400).json({ erro: e.message }); }
  });
  app.delete('/api/cadastros/:id', auth, (req, res) => { db.prepare('DELETE FROM cadastros WHERE id=? AND conta_id=?').run(req.params.id, req.contaId); res.json({ ok: true }); });
}
