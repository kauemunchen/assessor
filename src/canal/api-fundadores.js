// Rotas da campanha /fundadores — captura, armazenamento e notificação de leads.
// Garante que nenhum lead se perde: salva no SQLite, dispara e-mail + Telegram.
import { db } from '../db/index.js';
import { enviarEmail, emailConfigurado, moldura, botaoEmail } from '../integracoes/email.js';

const API_TG = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');

function prepararTabela() {
  db.exec(`CREATE TABLE IF NOT EXISTS leads_fundadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    empresa TEXT,
    whatsapp TEXT NOT NULL,
    dor TEXT,
    ritmo TEXT,
    origem TEXT DEFAULT 'landing',
    user_agent TEXT,
    ip TEXT,
    referer TEXT,
    whatsapp_confirmado INTEGER DEFAULT 0,
    status TEXT DEFAULT 'novo',
    notas TEXT,
    criado_em TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  try { db.exec("CREATE INDEX IF NOT EXISTS ix_leads_criado ON leads_fundadores(criado_em DESC)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS ix_leads_status ON leads_fundadores(status)"); } catch {}
}

function escapar(s = '') { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Chat_id pra notificação Telegram: prioriza a env, cai pro dono mais recente da base.
function chatIdNotificacao() {
  const env = process.env.LEADS_TELEGRAM_CHAT_ID?.trim();
  if (env) return env;
  try {
    return db.prepare("SELECT chat_id FROM usuarios WHERE papel='dono' AND canal='telegram' AND chat_id NOT LIKE 'web:%' ORDER BY id DESC LIMIT 1").get()?.chat_id || null;
  } catch { return null; }
}

async function notificarTelegram(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatIdNotificacao();
  if (!token || !chatId) return { ok: false, motivo: 'sem token/chat_id' };

  const linhas = [
    '🔥 <b>NOVO LEAD · Fiel Fundadores</b>',
    '',
    `👤 <b>${escapar(lead.nome)}</b>`,
    `🏢 ${escapar(lead.empresa || '—')}`,
    `📱 <a href="https://wa.me/${lead.whatsapp.replace(/\D/g, '')}">${escapar(lead.whatsapp)}</a>`,
    `⏱ Ritmo: ${escapar(lead.ritmo || '—')}`,
    '',
    `💥 <b>Dor:</b>`,
    escapar(lead.dor || '—').slice(0, 800),
    '',
    `#${lead.id} · recebido agora · vagas 10`,
  ];

  const base = process.env.PUBLIC_URL?.replace(/\/app$/, '') || 'https://usefiel.com';
  const painelKey = process.env.LEADS_PAINEL_KEY || '';
  const body = {
    chat_id: chatId,
    text: linhas.join('\n'),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [[
        { text: '💬 Abrir WhatsApp', url: `https://wa.me/${lead.whatsapp.replace(/\D/g, '')}` },
        painelKey ? { text: '📋 Painel', url: `${base}/fundadores/leads?k=${encodeURIComponent(painelKey)}` } : null,
      ].filter(Boolean)],
    },
  };

  try {
    const r = await fetch(`${API_TG}/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    }).then(x => x.json());
    return r;
  } catch (e) { return { ok: false, description: e.message }; }
}

async function notificarEmail(lead) {
  if (!emailConfigurado()) return { ok: false, motivo: 'SMTP não configurado' };
  const para = process.env.LEADS_EMAIL_TO || process.env.SMTP_USER || 'ola@usefiel.com';
  const base = process.env.PUBLIC_URL?.replace(/\/app$/, '') || 'https://usefiel.com';
  const painelKey = process.env.LEADS_PAINEL_KEY || '';
  const wa = lead.whatsapp.replace(/\D/g, '');

  const corpoHtml = `
    <p style="margin:0 0 8px;font-size:15px;color:#4A4D59">Acabou de cair um lead na campanha <b>Fiel Fundadores</b>:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;font-size:15px;color:#17152B">
      <tr><td style="padding:10px 0;border-bottom:1px solid #E8E0CF"><b>Nome</b></td><td style="padding:10px 0;border-bottom:1px solid #E8E0CF;text-align:right">${escapar(lead.nome)}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #E8E0CF"><b>Empresa</b></td><td style="padding:10px 0;border-bottom:1px solid #E8E0CF;text-align:right">${escapar(lead.empresa || '—')}</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #E8E0CF"><b>WhatsApp</b></td><td style="padding:10px 0;border-bottom:1px solid #E8E0CF;text-align:right"><a href="https://wa.me/${wa}" style="color:#E85D4A;text-decoration:none">${escapar(lead.whatsapp)}</a></td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #E8E0CF"><b>Ritmo</b></td><td style="padding:10px 0;border-bottom:1px solid #E8E0CF;text-align:right">${escapar(lead.ritmo || '—')}</td></tr>
    </table>
    <p style="margin:16px 0 6px;font-size:14px;color:#7A7D87;text-transform:uppercase;letter-spacing:0.08em"><b>Dor relatada</b></p>
    <div style="padding:16px;background:#FAF5EC;border-left:3px solid #E85D4A;border-radius:4px;font-size:15px;color:#17152B;line-height:1.55">${escapar(lead.dor || '—').replace(/\n/g, '<br>')}</div>
    ${botaoEmail('Abrir WhatsApp agora', `https://wa.me/${wa}`)}
  `;

  const html = moldura({
    titulo: `🔥 Novo lead · ${escapar(lead.nome)}`,
    corpoHtml,
    nota: `Lead #${lead.id} · recebido ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${painelKey ? ` · <a href="${base}/fundadores/leads?k=${encodeURIComponent(painelKey)}" style="color:#E85D4A">ver painel</a>` : ''}`,
    preheader: `${lead.nome} · ${lead.empresa || 'sem empresa'} · ${lead.whatsapp}`,
  });

  try {
    await enviarEmail({ para, assunto: `🔥 Novo Fundador #${lead.id}: ${lead.nome} · ${lead.empresa || 'sem empresa'}`, html, texto: `Novo lead Fiel Fundadores:\n\n${lead.nome}\n${lead.empresa || ''}\n${lead.whatsapp}\n\nDor:\n${lead.dor}\n\n${base}/fundadores/leads` });
    return { ok: true };
  } catch (e) { return { ok: false, motivo: e.message }; }
}

export function rotasFundadores(app) {
  prepararTabela();

  // POST — recebe o form da landing, salva o lead e dispara notificações
  app.post('/fundadores/inscrever', async (req, res) => {
    try {
      const { nome, empresa, whatsapp, dor, ritmo } = req.body || {};
      if (!nome?.trim() || !whatsapp?.trim()) return res.status(400).json({ erro: 'Nome e WhatsApp são obrigatórios' });
      if (nome.length > 200 || whatsapp.length > 40 || (dor || '').length > 3000) return res.status(400).json({ erro: 'Campos muito grandes' });

      const ua = String(req.headers['user-agent'] || '').slice(0, 300);
      const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.ip || '').trim().slice(0, 64);
      const ref = String(req.headers['referer'] || '').slice(0, 500);

      const info = db.prepare(`INSERT INTO leads_fundadores (nome, empresa, whatsapp, dor, ritmo, user_agent, ip, referer) VALUES (?,?,?,?,?,?,?,?)`)
        .run(nome.trim(), (empresa || '').trim(), whatsapp.trim(), (dor || '').trim(), (ritmo || '').trim(), ua, ip, ref);

      const lead = { id: info.lastInsertRowid, nome: nome.trim(), empresa: (empresa || '').trim(), whatsapp: whatsapp.trim(), dor: (dor || '').trim(), ritmo: (ritmo || '').trim() };

      // Dispara as duas notificações em paralelo e não bloqueia a resposta se alguma falhar
      const [tg, em] = await Promise.allSettled([notificarTelegram(lead), notificarEmail(lead)]);
      console.log(`[fundadores] lead #${lead.id} salvo · telegram: ${tg.value?.ok ? 'OK' : (tg.value?.description || tg.value?.motivo || 'falhou')} · email: ${em.value?.ok ? 'OK' : (em.value?.motivo || 'falhou')}`);

      res.json({ ok: true, id: lead.id });
    } catch (e) {
      console.error('[fundadores] POST /inscrever', e);
      res.status(500).json({ erro: 'Erro ao salvar. Tente novamente ou chame no WhatsApp.' });
    }
  });

  // POST — marca o lead como "clicou pra confirmar no WhatsApp" (dispara depois do redirect)
  app.post('/fundadores/confirmar/:id', (req, res) => {
    try {
      db.prepare('UPDATE leads_fundadores SET whatsapp_confirmado=1 WHERE id=?').run(Number(req.params.id) || 0);
      res.json({ ok: true });
    } catch { res.json({ ok: false }); }
  });

  // GET — painel HTML pra o Kauê ver todos os leads (protegido por chave)
  app.get('/fundadores/leads', (req, res) => {
    const chave = process.env.LEADS_PAINEL_KEY;
    if (!chave) return res.status(503).send('Defina LEADS_PAINEL_KEY no .env do servidor.');
    if (req.query.k !== chave) return res.status(401).send('Chave inválida.');

    const rows = db.prepare('SELECT * FROM leads_fundadores ORDER BY criado_em DESC').all();
    const total = rows.length;
    const novos = rows.filter(r => r.status === 'novo').length;
    const confirmados = rows.filter(r => r.whatsapp_confirmado).length;

    const fmt = (dt) => { try { return new Date(dt + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }); } catch { return dt; } };
    const escape = (s) => escapar(s || '');

    const linhas = rows.map(r => `
      <tr style="border-bottom:1px solid #E8E0CF">
        <td style="padding:14px 10px;font-weight:700;color:#E85D4A">#${r.id}</td>
        <td style="padding:14px 10px;font-weight:600">${escape(r.nome)}<div style="color:#7A7D87;font-weight:400;font-size:12px;margin-top:2px">${escape(r.empresa)}</div></td>
        <td style="padding:14px 10px"><a href="https://wa.me/${escape(r.whatsapp.replace(/\D/g, ''))}" target="_blank" style="color:#17152B;text-decoration:none;border-bottom:1px dotted #E85D4A">${escape(r.whatsapp)}</a><div style="color:#7A7D87;font-size:12px;margin-top:2px">${escape(r.ritmo)}</div></td>
        <td style="padding:14px 10px;font-size:13px;color:#4A4D59;max-width:360px">${escape(r.dor).slice(0, 320)}${(r.dor || '').length > 320 ? '…' : ''}</td>
        <td style="padding:14px 10px;font-size:12px;color:#7A7D87;white-space:nowrap">${fmt(r.criado_em)}</td>
        <td style="padding:14px 10px"><span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:${r.status === 'novo' ? '#FDE3DE' : r.status === 'aprovado' ? '#D7E8DC' : '#E8E0CF'};color:${r.status === 'novo' ? '#B23A28' : r.status === 'aprovado' ? '#3F6B50' : '#4A4D59'}">${escape(r.status)}</span>${r.whatsapp_confirmado ? '<div style="margin-top:4px;font-size:11px;color:#3F6B50">✓ confirmou wpp</div>' : ''}</td>
      </tr>`).join('');

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fiel Fundadores · Leads</title><link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400..900;1,400..900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>body{margin:0;background:#FAF5EC;font-family:Inter,sans-serif;color:#17152B}header{background:#17152B;color:#FAF5EC;padding:28px 24px}h1{margin:0;font-family:Fraunces,serif;font-weight:800;font-size:32px;letter-spacing:-0.02em}.wrap{max-width:1280px;margin:0 auto;padding:24px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px}.card{background:#fff;border-radius:16px;padding:20px;border:1px solid #E8E0CF}.card .n{font-family:Fraunces,serif;font-weight:800;font-size:38px;line-height:1;color:#E85D4A}.card .l{font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#7A7D87;font-weight:600;margin-top:4px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E8E0CF}th{background:#F3EBDA;text-align:left;padding:12px 10px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#4A4D59;font-weight:700}@media(max-width:800px){table,thead,tbody,th,td,tr{display:block}thead{display:none}tr{margin-bottom:12px;border:1px solid #E8E0CF;border-radius:12px;padding:8px}td{padding:6px 10px !important}}</style></head><body><header><div class="wrap" style="padding:0"><h1>🔥 Fiel Fundadores · Leads</h1><div style="opacity:.75;font-size:14px;margin-top:4px">Meta: 10 vagas · Encerra sábado 7/nov 20h</div></div></header><main class="wrap"><div class="cards"><div class="card"><div class="n">${total}</div><div class="l">Total</div></div><div class="card"><div class="n" style="color:#3358E8">${novos}</div><div class="l">Novos</div></div><div class="card"><div class="n" style="color:#3F6B50">${confirmados}</div><div class="l">Confirmaram WhatsApp</div></div><div class="card"><div class="n" style="color:${10 - total > 0 ? '#E85D4A' : '#7A7D87'}">${Math.max(0, 10 - total)}</div><div class="l">Vagas restantes</div></div></div>${rows.length === 0 ? '<div style="padding:60px;text-align:center;color:#7A7D87;background:#fff;border-radius:16px;border:1px solid #E8E0CF">Nenhum lead ainda. Compartilhe <b>usefiel.com/fundadores</b> para começar.</div>' : `<table><thead><tr><th>#</th><th>Lead</th><th>Contato</th><th>Dor</th><th>Quando</th><th>Status</th></tr></thead><tbody>${linhas}</tbody></table>`}<p style="margin-top:24px;font-size:12px;color:#7A7D87;text-align:center">Atualize a página para ver novos leads. Desta página você não aprova/rejeita — faça pelo WhatsApp e atualize o status direto no banco quando fechar. (Vou botar botões se virar necessidade.)</p></main></body></html>`);
  });

  // GET JSON — pra consumir de algum painel externo seu
  app.get('/fundadores/leads.json', (req, res) => {
    const chave = process.env.LEADS_PAINEL_KEY;
    if (!chave || req.query.k !== chave) return res.status(401).json({ erro: 'chave inválida' });
    const rows = db.prepare('SELECT * FROM leads_fundadores ORDER BY criado_em DESC').all();
    res.json({ total: rows.length, leads: rows });
  });
}
