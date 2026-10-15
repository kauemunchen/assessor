// Assessor KM — app web (Conversa). Vanilla JS, sem build.
const $ = (s) => document.querySelector(s);
const tokenLocal = () => new URLSearchParams(location.search).get('token') || localStorage.getItem('akm');
const api = async (p, o = {}) => { const tk = tokenLocal(); const r = await fetch(p, { credentials: 'same-origin', ...o, headers: { ...(o.headers || {}), ...(tk ? { authorization: 'Bearer ' + tk } : {}) } }); if (r.status === 401) { mostrarLogin(); throw new Error('401'); } return r.json(); };
const NOMES = { diretor: 'Diretor', secretaria: 'Secretária', documentos: 'Documentos', financeiro: 'Financeiro', producao: 'Produção', social: 'MIA' };
let me = null, ws = null, filtro = null, maisAntigo = null, anexo = null, rec = null;

// ---------- login ----------
async function mostrarLogin() {
  $('#app').classList.add('oculto'); $('#login').classList.remove('oculto');
  const { codigo, token, bot } = await (await fetch('/api/login/iniciar', { method: 'POST' })).json();
  $('#codigo').textContent = `web ${codigo}`; $('#botNome').textContent = '@' + bot;
  $('#abrirBot').href = `https://t.me/${bot}?text=${encodeURIComponent('web ' + codigo)}`;
  const timer = setInterval(async () => {
    const r = await (await fetch(`/api/login/status?token=${token}`)).json();
    if (r.ok) { clearInterval(timer); localStorage.setItem('akm', token); iniciar(); }
    if (!r.ok && !r.aguardando) { clearInterval(timer); mostrarLogin(); }
  }, 2000);
}
async function iniciar() {
  try { me = await api('/api/me'); } catch { return; }
  $('#login').classList.add('oculto'); $('#app').classList.remove('oculto');
  $('#donoNome').textContent = me.conta.nome_dono;
  const nome = (m) => me.personas.find(p => p.modulo === m)?.nome || NOMES[m];
  $('#equipeAtiva').innerHTML = `<div class="titulo">Equipe ativa</div>` + me.modulos.map(m => `<div class="equipe-item"><span class="dot"></span>${nome(m)} <span style="opacity:.6;font-size:12px">· ${NOMES[m]}</span></div>`).join('');
  $('#filtros').innerHTML = `<button class="ativo" data-f="">Todos</button>` + me.modulos.map(m => `<button data-f="${m}">${nome(m)}</button>`).join('');
  $('#filtros').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; filtro = b.dataset.f || null; [...$('#filtros').children].forEach(x => x.classList.toggle('ativo', x === b)); render(); };
  $('#texto').placeholder = `Fale com ${me.modulos.map(nome).slice(0, 4).join(', ')}…`;
  await carregar(); conectar();
}

// ---------- mensagens ----------
let msgs = [];
async function carregar(antes) {
  const lote = await api(`/api/mensagens?limite=60${antes ? `&antes=${antes}` : ''}`);
  msgs = antes ? [...lote, ...msgs] : lote; maisAntigo = msgs[0]?.id; render(!antes);
}
function render(rolar = true) {
  const lista = $('#lista'); const alturaAntes = lista.scrollHeight;
  const vis = filtro ? msgs.filter(m => m.direcao === 'entrada' || m.modulo === filtro) : msgs;
  let dia = ''; const html = [];
  for (const m of vis) {
    const d = new Date(m.em.replace(' ', 'T') + 'Z'); const dd = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
    if (dd !== dia) { dia = dd; html.push(`<div class="dia">${dd}</div>`); }
    html.push(bolha(m, d));
  }
  lista.innerHTML = html.join('');
  if (rolar) lista.scrollTop = lista.scrollHeight; else lista.scrollTop = lista.scrollHeight - alturaAntes;
}
const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function fmt(t) {
  let s = esc(t);
  s = s.replace(/^\s*#{1,6}\s+(.+)$/gm, '<b>$1</b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<b>$2</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.length > 60 ? u.slice(0, 57) + '…' : u}</a>`);
  return s;
}
function bolha(m, d) {
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const nome = m.modulo ? (me.personas.find(p => p.modulo === m.modulo)?.nome || NOMES[m.modulo]) : null;
  let midia = '';
  if (m.midia?.url && m.tipo === 'imagem') midia = `<img src="${m.midia.url}" loading="lazy">`;
  else if (m.midia?.url && m.tipo === 'video') midia = `<video src="${m.midia.url}" controls playsinline preload="metadata"></video>`;
  else if (m.midia?.urls) midia = `<div class="album">${m.midia.urls.map(u => `<img src="${u}" loading="lazy">`).join('')}</div>`;
  else if (m.midia?.url && m.tipo === 'audio') midia = `<audio src="${m.midia.url}" controls></audio>`;
  else if (m.midia?.url) midia = `<a class="doc" href="${m.midia.url}" target="_blank">📄 ${esc(m.midia.nome || 'arquivo')}</a>`;
  else if (m.midia && m.direcao === 'entrada') midia = `<span style="color:var(--mudo)">📎 ${esc(m.midia.nome || m.tipo)} (enviado pelo Telegram)</span>`;
  const botoes = m.botoes ? `<div class="botoes" data-id="${m.id}">${m.botoes.flat().map(b => `<button data-d="${esc(b.d ?? b.t)}">${esc(b.t)}</button>`).join('')}</div>` : '';
  const texto = m.texto && !(m.midia && /^\[(imagem|video|arquivo|audio)\]$/.test(m.texto)) ? fmt(m.texto) : '';
  return `<div class="msg ${m.direcao}" data-id="${m.id}">${nome ? `<div class="mod">${esc(nome)}</div>` : ''}${midia}${texto}${botoes}<div class="meta"><span>${hora}</span><span>${m.direcao === 'entrada' ? (m.canal === 'web' ? '💻 web' : '📱 telegram') : ''}</span></div></div>`;
}
$('#lista').addEventListener('click', (e) => {
  const b = e.target.closest('.botoes button'); if (!b) return;
  b.closest('.botoes').classList.add('usados'); enviar(b.dataset.d);
});
$('#lista').addEventListener('scroll', () => { if ($('#lista').scrollTop < 40 && maisAntigo) { const a = maisAntigo; maisAntigo = null; carregar(a); } });

// ---------- websocket ----------
function conectar() {
  const tok = tokenLocal(); const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${tok}`);
  ws.onopen = () => $('#estado').textContent = 'ao vivo · sincronizado com o Telegram';
  ws.onclose = () => { $('#estado').textContent = 'reconectando…'; setTimeout(conectar, 2500); };
  ws.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    if (e.tipo === 'mensagem') { msgs.push(e.mensagem); $('#digitando').classList.add('oculto'); render(); }
    if (e.tipo === 'digitando') { $('#digitando').classList.remove('oculto'); clearTimeout(conectar._t); conectar._t = setTimeout(() => $('#digitando').classList.add('oculto'), 6000); }
  };
}

// ---------- composer ----------
async function enviar(texto, arquivo) {
  if (!texto && !arquivo) return;
  const fd = new FormData(); if (texto) fd.append('texto', texto); if (arquivo) fd.append('arquivo', arquivo, arquivo.name || 'audio.webm');
  await api('/api/enviar', { method: 'POST', body: fd });
}
$('#form').onsubmit = async (e) => {
  e.preventDefault(); const t = $('#texto').value.trim(); const a = anexo; if (!t && !a) return;
  $('#texto').value = ''; $('#texto').style.height = 'auto'; limparAnexo();
  await enviar(t, a);
};
$('#texto').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#form').requestSubmit(); } });
$('#texto').addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(160, this.scrollHeight) + 'px'; });
$('#anexar').onclick = () => $('#arquivo').click();
$('#arquivo').onchange = () => { const f = $('#arquivo').files[0]; if (f) mostrarAnexo(f); $('#arquivo').value = ''; };
function mostrarAnexo(f) {
  anexo = f; const p = $('#previaAnexo'); p.classList.remove('oculto');
  const url = URL.createObjectURL(f); const tag = f.type.startsWith('image/') ? `<img src="${url}">` : f.type.startsWith('video/') ? `<video src="${url}" muted></video>` : '📄';
  p.innerHTML = `${tag}<span>${esc(f.name)} · ${(f.size / 1048576).toFixed(1)} MB</span><button class="icone" id="tirarAnexo">✕</button>`;
  $('#tirarAnexo').onclick = limparAnexo; $('#texto').focus();
}
function limparAnexo() { anexo = null; $('#previaAnexo').classList.add('oculto'); $('#previaAnexo').innerHTML = ''; }
document.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) mostrarAnexo(f); });
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) mostrarAnexo(f); });

// gravação de áudio (MediaRecorder) → envia como áudio (o bot transcreve)
$('#gravar').onclick = async () => {
  if (rec) { rec.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); const parts = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.onstop = async () => { stream.getTracks().forEach(t => t.stop()); const blob = new Blob(parts, { type: rec.mimeType || 'audio/webm' }); rec = null; $('#gravar').classList.remove('gravando'); $('#gravar').textContent = '🎙'; if (blob.size > 1000) await enviar('', new File([blob], blob.type.includes('mp4') ? 'audio.m4a' : 'audio.webm', { type: blob.type })); };
    rec.start(); $('#gravar').classList.add('gravando'); $('#gravar').textContent = '■';
  } catch (e) { alert('Não consegui acessar o microfone: ' + e.message); }
};

// ---------- lateral / atalhos / sair ----------
$('#abrirLateral').onclick = () => $('#lateral').classList.add('aberta');
$('#fecharLateral').onclick = () => $('#lateral').classList.remove('aberta');
document.querySelectorAll('.atalhos button').forEach(b => b.onclick = () => { enviar(b.dataset.cmd); $('#lateral').classList.remove('aberta'); });
document.querySelectorAll('.menu a').forEach(a => a.onclick = () => { if (a.dataset.tela !== 'conversa') alert('Essa tela entra na próxima etapa.'); $('#lateral').classList.remove('aberta'); });
$('#sair').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); localStorage.removeItem('akm'); location.reload(); };

// PWA
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/app/sw.js').catch(() => {});
iniciar();
