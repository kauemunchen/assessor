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

// ---------------- IDENTIDADE & MARCA ----------------
const ROTULOS_ID = { perfil: 'Perfil', nicho: 'Nicho / posicionamento', publico: 'Público', tom: 'Tom de voz', pilares: 'Pilares', hashtags_fixas: 'Hashtags fixas (3)', hashtags_pilar: 'Hashtags por pilar', ctas: 'CTAs por objetivo', agenda: 'Agenda de publicação', fase: 'Fase atual', formatos: 'Formatos', cores: 'Cores', tipografia: 'Tipografia', provas: 'Provas de autoridade', series: 'Séries', descricao: 'Observações' };
telas.marca = async () => {
  const d = await api('/api/marca'); const id = d.identidade || {};
  const val = (k) => { const v = id[k]; return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v, null, 1).replace(/[{}"]/g, '').replace(/,\n/g, '\n').trim() : String(v)); };
  const campo = (k, rows = 2) => `<div class="campo"><label>${ROTULOS_ID[k]}</label><textarea name="${k}" rows="${rows}">${esc(val(k))}</textarea></div>`;
  const cores = ['#37414E', '#C8CFD7', '#FFFFFF', '#000000', '#B9964B'];
  const corpo = `<div class="grade">
    <div class="cartao" style="grid-column:1/-1"><h3>Padrão visual <span class="tag">regra dura</span></h3>
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
        <div><p class="d">Cores</p><div style="display:flex;gap:8px">${cores.map(c => `<div title="${c}" style="width:40px;height:40px;border-radius:10px;background:${c};border:1px solid var(--sec)"></div>`).join('')}</div><p class="d" style="margin-top:6px">#37414E fundo · #C8CFD7 apoio · branco títulos · dourado #B9964B só UMA palavra</p></div>
        <div><p class="d">Logos (marca d'água automática, cor pela luminosidade)</p><div style="display:flex;gap:10px">${d.logos.map((l, i) => `<div style="padding:10px;border-radius:10px;background:${['#FFFFFF', '#37414E', '#000000'][i]}"><img src="${l}" style="height:36px"></div>`).join('')}</div></div>
        <div><p class="d">Tipografia</p><div style="font-family:Poppins;font-weight:700;font-size:22px">Poppins Bold <span style="color:#B9964B">dourado</span></div><p class="d">Regular para texto · etiqueta Bold caixa alta</p></div>
        <div style="margin-left:auto"><p class="d">Prévia ao vivo (story "frase do dia")</p><img id="previaMarca" src="" style="height:260px;border-radius:12px;background:var(--fundo);display:block"><div style="display:flex;gap:6px;margin-top:6px"><input id="previaTexto" value="Processo não é burocracia, é *liberdade*" style="flex:1;font:inherit;padding:6px 8px;border:1px solid var(--sec);border-radius:8px;background:var(--fundo);color:var(--texto)"><button class="btn sec" id="gerarPrevia">Gerar</button></div></div>
      </div></div>
    <div class="cartao" style="grid-column:1/-1"><h3>Identidade (o que a MIA usa em toda peça) ${d.atualizado_em ? `<span class="tag">atualizado ${esc(d.atualizado_em.slice(0, 10).split('-').reverse().join('/'))}</span>` : ''}</h3>
      <form id="fId"><div class="grade">${['perfil', 'nicho', 'publico', 'tom', 'pilares', 'series'].map(k => campo(k, 3)).join('')}${['hashtags_fixas', 'hashtags_pilar', 'ctas', 'provas'].map(k => campo(k, 4)).join('')}${['agenda', 'fase', 'formatos', 'cores', 'tipografia', 'descricao'].map(k => campo(k, 2)).join('')}</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px"><button class="btn prim">Salvar identidade</button><span class="salvo"></span><span class="d" style="font-size:12px;color:var(--mudo)">Hashtags por pilar e CTAs: uma linha por item, "chave: valor".</span></div></form></div>
    <div class="cartao" style="grid-column:1/-1"><h3>Regras operacionais do manual <span class="tag">entra no prompt da MIA</span></h3>
      <p class="d">É o trecho do Manual da Marca que a MIA carrega ao criar conteúdo. Edite com cuidado; o arquivo anterior fica salvo como .bak.</p>
      <form id="fRegras"><textarea name="regras" rows="16" style="width:100%;font:13px/1.5 ui-monospace,Menlo,monospace;padding:10px;border:1px solid var(--sec);border-radius:10px;background:var(--fundo);color:var(--texto)">${esc(d.regras_operacionais)}</textarea>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px"><button class="btn prim">Salvar regras</button><span class="salvo"></span></div></form></div>
  </div>`;
  return { titulo: '✨ Identidade & Marca', sub: 'Tudo que define como a MIA escreve e desenha. Mudou aqui, vale no próximo post.', corpo, depois() {
    const gerar = async () => { const t = $('#previaTexto').value; const m = t.match(/\*([^*]+)\*/); const r = await fetch('/api/marca/previa', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tokenLocal() }, body: JSON.stringify({ modelo: 'frase', texto: t.replace(/\*/g, ''), palavra_dourada: m ? m[1] : null }) }); if (r.ok) $('#previaMarca').src = URL.createObjectURL(await r.blob()); else toast('render indisponível'); };
    $('#gerarPrevia').onclick = gerar; gerar();
    $('#fId').onsubmit = async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); for (const k of ['hashtags_pilar', 'ctas']) { const linhas = (f[k] || '').split('\n').map(x => x.trim()).filter(x => x.includes(':')); if (linhas.length) f[k] = Object.fromEntries(linhas.map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })); } await post('/api/marca/identidade', f); e.target.querySelector('.salvo').textContent = 'salvo ✓'; };
    $('#fRegras').onsubmit = async (e) => { e.preventDefault(); await post('/api/marca/regras', { regras: e.target.regras.value }); e.target.querySelector('.salvo').textContent = 'salvo ✓'; };
  } };
};

// ---------------- AJUSTES ----------------
telas.ajustes = async () => {
  const d = await api('/api/ajustes'); const a = d.ajustes;
  const fmtN = (n) => (n || 0).toLocaleString('pt-BR');
  const maxDia = Math.max(1, ...d.uso.por_dia.map(x => x.t || 0));
  const corpo = `<div class="grade">
    <div class="cartao"><h3>Preferências da MIA</h3><form id="fAj">
      <div class="campo"><label>Grade de horários sugeridos (separe por vírgula)</label><input name="grade_horarios" value="${esc(a.grade_horarios.join(', '))}"></div>
      <div class="linha2"><div class="campo"><label>Vídeo: áudio por padrão</label><select name="video_sem_audio_padrao"><option value="true" ${a.video_sem_audio_padrao ? 'selected' : ''}>retirar (story mudo)</option><option value="false" ${!a.video_sem_audio_padrao ? 'selected' : ''}>manter</option></select></div><div class="campo"><label>Faixa de texto no vídeo</label><select name="story_posicao_faixa">${['base', 'rodape', 'topo', 'meio'].map(o => `<option ${a.story_posicao_faixa === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
      <div class="linha2"><div class="campo"><label>Biblioteca: apagar após (dias)</label><input name="retencao_biblioteca_dias" type="number" min="1" max="365" value="${a.retencao_biblioteca_dias}"></div><div class="campo"><label>Marcador na agenda (posts)</label><input name="marcador_social" value="${esc(a.marcador_social)}"></div></div>
      <div style="display:flex;align-items:center;gap:10px"><button class="btn prim">Salvar</button><span class="salvo"></span></div></form></div>
    <div class="cartao"><h3>Documentos</h3><form id="fAj2">
      <div class="linha2"><div class="campo"><label>Marcador de vencimentos</label><input name="marcador_vencimentos" value="${esc(a.marcador_vencimentos)}"></div><div class="campo"><label>Avisos (dias antes)</label><input name="avisos_vencimento" value="${esc(a.avisos_vencimento.join(', '))}"></div></div>
      <div class="linha2"><div class="campo"><label>Hora dos avisos</label><input name="hora_vencimentos" type="time" value="${esc(a.hora_vencimentos)}"></div><div class="campo"><label>Hora da limpeza da biblioteca</label><input name="hora_limpeza" type="time" value="${esc(a.hora_limpeza)}"></div></div>
      <div style="display:flex;align-items:center;gap:10px"><button class="btn prim">Salvar</button><span class="salvo"></span></div><p class="d" style="margin-top:8px">Horários de rotina exigem reinício do bot para valer (deploy).</p></form></div>
    <div class="cartao"><h3>Uso e custo (30 dias)</h3>
      <ul class="lista-s"><li><span>Mensagens enviadas</span><b>${fmtN(d.uso.mensagens_30d)}</b></li><li><span>Chamadas de IA</span><b>${fmtN(d.uso.por_modulo.reduce((s, x) => s + x.n, 0))}</b></li><li><span>Tokens (entrada / saída)</span><b>${fmtN(d.uso.por_modulo.reduce((s, x) => s + (x.tin || 0), 0))} / ${fmtN(d.uso.por_modulo.reduce((s, x) => s + (x.tout || 0), 0))}</b></li><li><span>Custo estimado Gemini</span><b>US$ ${d.uso.custo_usd_30d.toFixed(2)} ≈ R$ ${(d.uso.custo_usd_30d * 5.5).toFixed(2)}</b></li></ul>
      <p class="d" style="margin-top:10px">Por assessor</p><ul class="lista-s">${d.uso.por_modulo.map(x => `<li><span>${esc(x.modulo || '—')}</span><span>${fmtN(x.n)} chamadas · ${fmtN((x.tin || 0) + (x.tout || 0))} tokens</span></li>`).join('') || '<li>Sem registros ainda (começa a contar a partir desta versão).</li>'}</ul>
      <p class="d" style="margin-top:10px">Últimos 14 dias</p><div style="display:flex;align-items:flex-end;gap:3px;height:60px">${d.uso.por_dia.map(x => `<div title="${x.d}: ${fmtN(x.t)} tokens" style="flex:1;background:var(--ouro);border-radius:3px 3px 0 0;height:${Math.max(3, Math.round((x.t || 0) / maxDia * 60))}px"></div>`).join('') || '<span class="d">—</span>'}</div></div>
    <div class="cartao"><h3>Dados</h3><ul class="lista-s"><li><span>Posts (publicados)</span><b>${d.contagens.posts} (${d.contagens.publicados})</b></li><li><span>Documentos arquivados</span><b>${d.contagens.documentos}</b></li><li><span>Mídias na biblioteca</span><b>${d.contagens.biblioteca}</b></li><li><span>Lembretes pendentes</span><b>${d.contagens.lembretes}</b></li></ul>
      <p class="d" style="margin-top:10px">Servidor: modelos ${esc(d.servidor.modelos.join(' → ') || '—')} · rápido ${esc(d.servidor.rapido || '—')} · fuso ${esc(d.servidor.tz)} · versão ${esc(d.servidor.versao)}</p></div>
    <div class="cartao"><h3>Backups <button class="btn sec" id="btBackup">Fazer backup agora</button></h3><p class="d">Diário às 04:00 → servidor + Google Drive (Assessor KM/Backups). 10 últimos em cada.</p>
      <ul class="lista-s">${d.backups.map(b => `<li><span>${esc(b.nome)}</span><span>${b.mb} MB</span></li>`).join('') || '<li>Nenhum backup local ainda.</li>'}</ul><p class="d" id="bkSaida" style="margin-top:8px"></p></div>
    <div class="cartao" style="grid-column:1/-1"><h3>Últimas interações (log)</h3><div id="logs" class="d">carregando…</div></div>
  </div>`;
  return { titulo: '⚙️ Ajustes', sub: 'Preferências por conta, uso de IA, dados e backups.', corpo, depois() {
    const salvar = async (e, campos) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const body = {}; for (const k of campos) { let v = f[k]; if (k === 'grade_horarios') v = v.split(/[,;\s]+/).filter(x => /^\d{1,2}:\d{2}$/.test(x)); if (k === 'avisos_vencimento') v = v.split(/[,;\s]+/).map(Number).filter(n => n >= 0); if (k === 'video_sem_audio_padrao') v = v === 'true'; if (k === 'retencao_biblioteca_dias') v = Number(v); body[k] = v; } await post('/api/ajustes', body); e.target.querySelector('.salvo').textContent = 'salvo ✓'; };
    $('#fAj').onsubmit = (e) => salvar(e, ['grade_horarios', 'video_sem_audio_padrao', 'story_posicao_faixa', 'retencao_biblioteca_dias', 'marcador_social']);
    $('#fAj2').onsubmit = (e) => salvar(e, ['marcador_vencimentos', 'avisos_vencimento', 'hora_vencimentos', 'hora_limpeza']);
    $('#btBackup').onclick = async () => { $('#bkSaida').textContent = 'gerando… (até 1 min)'; const r = await post('/api/ajustes/backup', {}); $('#bkSaida').textContent = (r.saida || []).join(' · '); setTimeout(() => mostrarTela('ajustes'), 1500); };
    api('/api/ajustes/logs').then(l => { $('#logs').innerHTML = `<ul class="lista-s">${l.map(x => `<li style="flex-direction:column;align-items:flex-start;gap:2px"><span style="font-size:11px;color:var(--mudo)">${esc(x.em)} · ${esc(x.modulo || '')}</span><span>→ ${esc(x.entrada)}</span><span style="color:var(--mudo)">← ${esc(x.saida)}</span></li>`).join('')}</ul>`; });
  } };
};
