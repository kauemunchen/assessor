// Telas de configuração do app: Equipe e Conexões. Usa api()/esc() de app.js (global).
const telas = {};
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2200); }
async function post(url, body) { const r = await api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (r.erro) { toast('⚠️ ' + r.erro); throw new Error(r.erro); } return r; }
async function del(url) { return api(url, { method: 'DELETE' }); }
const sel = (nome, opcoes, atual) => `<select name="${nome}">${opcoes.map(o => `<option ${o === atual ? 'selected' : ''}>${o}</option>`).join('')}</select>`;

function mostrarTela(nome) {
  const principal = $('#principal'); const cfg = $('#tela-config');
  document.querySelectorAll('.menu a').forEach(a => a.classList.toggle('ativo', a.dataset.tela === nome));
  if (nome === 'conversa') { principal.classList.remove('modo-config'); cfg.classList.add('oculto'); cfg.innerHTML = ''; irParaFim(); return; }
  if (!telas[nome]) { toast('Essa tela entra na próxima etapa.'); return; }
  principal.classList.add('modo-config'); cfg.classList.remove('oculto'); cfg.innerHTML = '<p class="sub">carregando…</p>';
  telas[nome]().then(html => { cfg.innerHTML = `<h1><button class="icone" id="voltarConversa">☰</button>${html.titulo}</h1><p class="sub">${html.sub || ''}</p>${html.corpo}`; $('#voltarConversa').onclick = () => $('#lateral').classList.add('aberta'); html.depois?.(); });
}

// ---------------- EQUIPE ----------------
telas.equipe = async () => {
  const d = await api('/api/equipe'); const o = d.opcoes;
  const cartaoModulo = (m) => { const p = m.persona || {}; const nomePad = m.nome; return `
    <div class="cartao" data-mod="${m.id}">
      <h3><span>${esc(p.nome || nomePad)} <span class="tag">${m.nome}</span></span>${m.fixo ? '<span class="tag ok">sempre ativo</span>' : `<label class="chave"><input type="checkbox" class="liga" ${m.ligado ? 'checked' : ''}> ${m.ligado ? 'ligado' : 'desligado'}</label>`}</h3>
      <p class="d">${m.desc}</p>
      <form class="persona">
        <div class="linha2"><div class="campo"><label>Nome da persona</label><input name="nome" value="${esc(p.nome || '')}" placeholder="${nomePad}"></div><div class="campo"><label>Como te chama</label>${sel('tratamento', o.tratamento, p.tratamento || 'primeiro nome')}</div></div>
        <div class="linha2"><div class="campo"><label>Tom</label>${sel('tom', o.tom, p.tom || 'direto')}</div><div class="campo"><label>Tamanho das respostas</label>${sel('tamanho', o.tamanho, p.tamanho || 'curta')}</div></div>
        <div class="linha2"><div class="campo"><label>Autonomia</label>${sel('autonomia', o.autonomia, p.autonomia || 'confirma ação externa')}</div><div class="campo"><label>Proatividade</label>${sel('proatividade', o.proatividade, p.proatividade || 'essencial')}</div></div>
        ${m.id === 'diretor' ? `<div class="linha2"><div class="campo"><label>Perfil de análise</label>${sel('perfil_analise', o.perfil_analise, p.perfil_analise || 'equilibrado')}</div><div class="campo"><label>Resumo do dia às</label><input name="hora_resumo" type="time" value="${esc((p.hora_resumo || '07:00').replace('h', ':00').padStart(5, '0'))}"></div></div>` : ''}
        ${m.id === 'secretaria' ? `<div class="linha2"><div class="campo"><label>Retornos às</label><input name="hora_retornos" type="time" value="${esc((p.hora_retornos || '18:00').replace('h', ':00').padStart(5, '0'))}"></div><div class="campo"><label>Fechamento às</label><input name="hora_fechamento" type="time" value="${esc((p.hora_fechamento || '20:00').replace('h', ':00').padStart(5, '0'))}"></div></div>` : ''}
        <div style="display:flex;align-items:center;gap:10px;margin-top:6px"><label class="chave"><input type="checkbox" name="emojis" ${p.emojis ? 'checked' : ''}> usa emojis</label><button class="btn prim" type="submit" style="margin-left:auto">Salvar</button><span class="salvo"></span></div>
      </form>
    </div>`; };
  const corpo = `
    <div class="grade">
      <div class="cartao"><h3>Dono e empresa</h3><form id="fConta">
        <div class="linha2"><div class="campo"><label>Seu nome</label><input name="nome_dono" value="${esc(d.conta.nome_dono || '')}"></div><div class="campo"><label>Empresa principal</label><input name="empresa" value="${esc(d.conta.empresa || '')}"></div></div>
        <div class="campo"><label>Foco do mês</label><input name="foco_mes" value="${esc(d.conta.foco_mes || '')}" placeholder="ex.: tirar o operacional da Mais Têxtil"></div>
        <div class="campo"><label>Janela de silêncio</label><input name="janela_silencio" value="${esc(d.conta.janela_silencio || '')}" placeholder="22h–6h e domingo"></div>
        <div style="display:flex;align-items:center"><button class="btn prim" type="submit">Salvar</button><span class="salvo"></span></div></form></div>
      <div class="cartao"><h3>Pessoas no Telegram <span class="tag">${d.pessoas.length}</span></h3><p class="d">Recebem recados e tarefas pela Secretária; respondem e marcam "feito".</p>
        <ul class="lista-s" id="pessoas">${d.pessoas.map(p => `<li><span>${esc(p.nome)}</span><button class="btn perigo" data-rm="${p.id}">remover</button></li>`).join('') || '<li>Ninguém ainda.</li>'}</ul>
        ${d.convites.length ? `<p class="d" style="margin-top:10px">Convites pendentes:</p><ul class="lista-s">${d.convites.map(c => `<li><span>${esc(c.nome)} · <code>entrar ${c.codigo}</code></span><button class="btn perigo" data-rmc="${c.codigo}">cancelar</button></li>`).join('')}</ul>` : ''}
        <form id="fConvite" style="display:flex;gap:8px;margin-top:10px"><input name="nome" placeholder="Nome da pessoa" style="flex:1;font:inherit;padding:9px 10px;border:1px solid var(--sec);border-radius:10px;background:var(--fundo);color:var(--texto)"><button class="btn prim">Convidar</button></form>
        <p class="d" id="convResultado" style="margin-top:8px"></p></div>
    </div>
    <h2 style="font-size:16px;margin:22px 0 10px">Assessores</h2>
    <div class="grade">${d.modulos.map(cartaoModulo).join('')}</div>`;
  return { titulo: '👥 Equipe', sub: 'Ligue módulos, dê nome e ajuste o jeito de cada assessor. Vale na hora, no Telegram e aqui.', corpo, depois() {
    $('#fConta').onsubmit = async (e) => { e.preventDefault(); await post('/api/equipe/conta', Object.fromEntries(new FormData(e.target))); e.target.querySelector('.salvo').textContent = 'salvo ✓'; };
    document.querySelectorAll('.cartao[data-mod]').forEach(c => {
      const mod = c.dataset.mod;
      c.querySelector('.liga')?.addEventListener('change', async (e) => { await post('/api/equipe/modulo', { modulo: mod, ligado: e.target.checked }); e.target.parentElement.lastChild.textContent = e.target.checked ? ' ligado' : ' desligado'; toast(e.target.checked ? 'Módulo ligado' : 'Módulo desligado'); iniciar(); });
      c.querySelector('form.persona').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.emojis = e.target.emojis.checked; await post('/api/equipe/persona', { modulo: mod, ...f }); e.target.querySelector('.salvo').textContent = 'salvo ✓'; c.querySelector('h3 span').firstChild.textContent = (f.nome || c.querySelector('input[name=nome]').placeholder) + ' '; iniciar(); };
    });
    $('#fConvite').onsubmit = async (e) => { e.preventDefault(); const nome = e.target.nome.value.trim(); if (!nome) return; const r = await post('/api/equipe/convite', { nome }); $('#convResultado').innerHTML = `Peça para <b>${esc(nome)}</b> abrir @${r.bot} e mandar: <code>entrar ${r.codigo}</code>`; e.target.reset(); };
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (!confirm('Remover esta pessoa da equipe?')) return; await del('/api/equipe/pessoa/' + b.dataset.rm); mostrarTela('equipe'); });
    document.querySelectorAll('[data-rmc]').forEach(b => b.onclick = async () => { await del('/api/equipe/convite/' + b.dataset.rmc); mostrarTela('equipe'); });
  } };
};

// ---------------- CONEXÕES ----------------
telas.conexoes = async () => {
  const d = await api('/api/conexoes');
  const esc_ = (ok, t) => `<span class="tag ${ok ? 'ok' : 'off'}">${t}</span>`;
  const g = d.google, ig = d.instagram;
  const diasIg = ig.expira_em ? Math.ceil((new Date(ig.expira_em) - Date.now()) / 864e5) : null;
  const corpo = `<div class="grade">
    <div class="cartao"><h3>Google ${g.conectado ? '<span class="tag ok">conectado</span>' : '<span class="tag off">não conectado</span>'}</h3>
      <p class="d">Agenda, Gmail, Drive, Tasks e Planilhas na sua conta Google.</p>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${esc_(g.escopos.agenda, 'Agenda')}${esc_(g.escopos.gmail_ler, 'Gmail ler')}${esc_(g.escopos.gmail_enviar, 'Gmail enviar')}${esc_(g.escopos.drive, 'Drive')}${esc_(g.escopos.tasks, 'Tasks')}</div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><a class="btn prim" href="${g.url_autorizar}" target="_blank" rel="noopener">${g.conectado ? 'Reautorizar (novos escopos)' : 'Conectar Google'}</a>${g.conectado ? '<button class="btn perigo" id="descGoogle">desconectar</button>' : ''}</div></div>
    <div class="cartao"><h3>Instagram ${ig.conectado ? (ig.ok ? `<span class="tag ok">@${esc(ig.username)}</span>` : '<span class="tag off">token inválido</span>') : '<span class="tag off">não conectado</span>'}</h3>
      <p class="d">${ig.conectado ? (ig.ok ? `Conta ${esc(ig.tipo || '')} · token ${diasIg != null ? (diasIg > 0 ? `vence em ${diasIg} dias (${ig.expira_em.split('-').reverse().join('/')})` : 'vencido') : ''}` : esc(ig.erro || '')) : 'Publicação de posts, Reels e Stories pela MIA.'}</p>
      ${diasIg != null && diasIg <= 7 ? '<p class="d"><span class="tag warn">renove o token</span></p>' : ''}
      <form id="fIg" class="campo"><label>Token (Meta for Developers → KM Graph API → Instagram → Gerar token)</label><input name="token" placeholder="IGAA…" autocomplete="off"><div style="display:flex;gap:8px;margin-top:6px"><button class="btn prim">Salvar token</button>${ig.conectado ? '<button class="btn perigo" type="button" id="descIg">desconectar</button>' : ''}</div></form></div>
    <div class="cartao"><h3>Documentos no Drive ${d.drive.pasta_id ? '<span class="tag ok">pasta definida</span>' : '<span class="tag warn">padrão KM/Assessor/Documentos</span>'}</h3>
      <p class="d">Raiz onde o módulo Documentos cria Empresa / Tipo / Ano.${d.drive.link ? ` <a href="${d.drive.link}" target="_blank">abrir pasta</a>` : ''}</p>
      <form id="fDrive" class="campo"><label>Link da pasta</label><input name="link" placeholder="https://drive.google.com/drive/folders/…"><div><button class="btn prim" style="margin-top:6px">Usar esta pasta</button></div></form></div>
    <div class="cartao"><h3>Empresas</h3><p class="d">Nomes exatos das pastas por empresa. Documento pessoal vai para "PF".</p>
      <form id="fEmp" class="campo"><textarea name="empresas" rows="3" placeholder="Mais Têxtil, Douglas Confecções, KM, Forzz, Valora Imóveis, 3D Ultimate">${esc(d.empresas.join(', '))}</textarea><div><button class="btn prim" style="margin-top:6px">Salvar</button></div></form></div>
    <div class="cartao"><h3>Planilhas Google <span class="tag">${d.planilhas.length}</span></h3><p class="d">Cadastradas para a Secretária lançar e consultar.</p>
      <ul class="lista-s">${d.planilhas.map(p => `<li><span><a href="${p.link}" target="_blank">${esc(p.nome)}</a> <small style="color:var(--mudo)">· ${esc(p.aba_padrao)} · ${p.cabecalhos.slice(0, 5).map(esc).join(', ')}</small></span><button class="btn perigo" data-rmp="${esc(p.nome)}">remover</button></li>`).join('') || '<li>Nenhuma.</li>'}</ul>
      <form id="fPlan" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><input name="link" placeholder="Link do Google Sheets" style="grid-column:1/-1;font:inherit;padding:9px 10px;border:1px solid var(--sec);border-radius:10px;background:var(--fundo);color:var(--texto)"><input name="nome" placeholder="Nome curto (ex.: gastos PF)" style="font:inherit;padding:9px 10px;border:1px solid var(--sec);border-radius:10px;background:var(--fundo);color:var(--texto)"><button class="btn prim">Cadastrar</button></form></div>
    <div class="cartao"><h3>Inteligência e serviços</h3>
      <ul class="lista-s"><li><span>Modelos Gemini</span><span>${d.ia.modelos.map(esc).join(' → ') || '—'}</span></li><li><span>Modelo rápido</span><span>${esc(d.ia.rapido || '—')}</span></li><li><span>Imagens por IA (fal.ai)</span>${esc_(d.ia.fal, d.ia.fal ? 'ativo' : 'sem chave')}</li><li><span>Hospedagem de mídia (Cloudinary)</span>${esc_(d.ia.cloudinary, d.ia.cloudinary ? 'ativo' : 'sem chave')}</li><li><span>AgilFac</span>${esc_(d.agilfac.configurado, d.agilfac.configurado ? 'configurado' : 'aguardando API')}</li></ul>
      <p class="d" style="margin-top:8px">Chaves ficam no servidor (.env). Edição por conta entra na tela Ajustes.</p></div>
  </div>`;
  return { titulo: '🔌 Conexões', sub: 'Serviços ligados à sua conta. O status é verificado ao vivo.', corpo, depois() {
    $('#fIg').onsubmit = async (e) => { e.preventDefault(); const r = await post('/api/conexoes/instagram', { token: e.target.token.value }); toast('Instagram conectado: @' + r.username); mostrarTela('conexoes'); };
    $('#descIg') && ($('#descIg').onclick = async () => { if (confirm('Desconectar o Instagram? Posts agendados vão falhar até reconectar.')) { await del('/api/conexoes/instagram'); mostrarTela('conexoes'); } });
    $('#descGoogle') && ($('#descGoogle').onclick = async () => { if (confirm('Desconectar o Google? Agenda, Gmail, Drive e Tasks param de funcionar até reconectar.')) { await del('/api/conexoes/google'); mostrarTela('conexoes'); } });
    $('#fDrive').onsubmit = async (e) => { e.preventDefault(); const r = await post('/api/conexoes/drive', { link: e.target.link.value }); toast('Pasta: ' + r.nome); mostrarTela('conexoes'); };
    $('#fEmp').onsubmit = async (e) => { e.preventDefault(); await post('/api/conexoes/empresas', { empresas: e.target.empresas.value }); toast('Empresas salvas'); };
    $('#fPlan').onsubmit = async (e) => { e.preventDefault(); const r = await post('/api/conexoes/planilha', { link: e.target.link.value, nome: e.target.nome.value }); toast(`Planilha "${r.nome}" cadastrada`); mostrarTela('conexoes'); };
    document.querySelectorAll('[data-rmp]').forEach(b => b.onclick = async () => { await del('/api/conexoes/planilha/' + encodeURIComponent(b.dataset.rmp)); mostrarTela('conexoes'); });
  } };
};

window.mostrarTela = mostrarTela;
