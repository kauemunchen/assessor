// Módulo Documentos: arquivo no Google Drive do dono (Raiz/Empresa/Tipo/Ano), OCR via Gemini, vigências com aviso 30/7/1, cadastros, dossiê.
import * as drive from '../integracoes/google-drive.js';
import * as gcal from '../integracoes/google-calendar.js';
import { lerArquivoJSON } from '../integracoes/gemini.js';
import { db } from '../db/index.js';

export const TIPOS = ['Contratos', 'Fiscal', 'Pessoal', 'Veículos', 'Licenças', 'Imóveis', 'Financeiro', 'Jurídico', 'Seguros', 'Outros'];
const LIMITE_OCR = 18 * 1024 * 1024; // inline do Gemini
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const slug = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 60);
const ext = (mime = '', nome = '') => (nome.match(/\.(\w{2,5})$/)?.[1] || { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime] || 'bin').toLowerCase();
const semAcento = (s = '') => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tipoValido = (t) => TIPOS.find(x => semAcento(x).slice(0, 4) === semAcento(t).trim().slice(0, 4)) || 'Outros';

const listaEmpresas = (conta) => { try { const l = JSON.parse(conta.empresas || '[]'); return l.length ? l : [conta.empresa].filter(Boolean); } catch { return [conta.empresa].filter(Boolean); } };
/** Encaixa o nome extraído em uma das empresas fixadas (grafia exata) ou PF/Geral. */
export function normalizarEmpresa(nome, conta) {
  const lista = listaEmpresas(conta); const n = semAcento(nome || '');
  if (!n || /^(geral|desconhecid)/.test(n)) return 'Geral';
  if (/^(pf|pessoal|pessoa fisica)$/.test(n) || /^kaue/.test(n)) return 'PF';
  const hit = lista.find(e => semAcento(e) === n) || lista.find(e => n.includes(semAcento(e)) || semAcento(e).includes(n)) || lista.find(e => semAcento(e).split(' ')[0].length > 2 && n.startsWith(semAcento(e).split(' ')[0]));
  return hit || (lista.length ? 'Geral' : (nome || 'Geral'));
}
const PROMPT_OCR = (empresas) => `Você classifica documentos de um empresário brasileiro. Empresas dele: ${empresas || 'desconhecidas'} — use EXATAMENTE um desses nomes em "empresa" quando o documento for de uma delas (razão social, nome fantasia ou CNPJ relacionado); se for pessoal (nome dele como pessoa física), empresa = "PF".
Leia o arquivo e devolva JSON com:
{"tipo": um de [${TIPOS.join(', ')}], "empresa": nome da empresa do dono a que pertence ou "PF" ou "Geral", "titulo": título curto e descritivo (ex.: "Contrato de prestação de serviços — Oficina Silva"), "contraparte": outra parte/emissor, "data_doc": "YYYY-MM-DD" ou null, "resumo": até 2 frases, "valor": número ou null, "vigencia": {"inicio": "YYYY-MM-DD"|null, "fim": "YYYY-MM-DD"|null, "renovacao_auto": bool, "aviso_previo_dias": número|null} ou null, "validade": "YYYY-MM-DD"|null (para certidão, alvará, CNH, apólice, licença), "sensivel": bool (RG, CPF, CNH, dados bancários, saúde), "legivel": bool, "campos": {outros dados úteis: CNPJ, CPF, número do documento, placa, endereço...}}
Se não conseguir ler, "legivel": false e o resto null.`;

/** Ponto de entrada quando o dono manda um arquivo/foto que é documento. Arquiva no Drive e registra; devolve contexto para a persona. */
export async function receberArquivo(conta, { bytes, mime, nome }) {
  const empresas = listaEmpresas(conta).join(', ');
  let dados = {};
  if (bytes.byteLength <= LIMITE_OCR && /^(image\/|application\/pdf)/.test(mime || '')) {
    try { dados = await lerArquivoJSON(bytes, mime, PROMPT_OCR(empresas)); } catch (e) { dados = { erro_ocr: e.message }; }
  } else dados = { legivel: false, motivo: 'arquivo grande ou formato sem OCR; classificado pelo nome' };
  return arquivar(conta, { bytes, mime, nomeOriginal: nome, dados });
}
/** Dono mandou link do Drive: move o arquivo para a pasta certa e registra. */
export async function receberLinkDrive(conta, texto) {
  const id = drive.extrairId(texto); if (!id) throw new Error('Não reconheci o link do Drive.');
  const m = await drive.metadados(conta.id, id);
  if (m.mime === 'application/vnd.google-apps.folder') throw new Error('É uma pasta; mande o link de um arquivo (ou diga "documentos pasta <link>" para usá-la como raiz).');
  let dados = {}; const empresas = listaEmpresas(conta).join(', ');
  if (m.tamanho && m.tamanho <= LIMITE_OCR && /^(image\/|application\/pdf)/.test(m.mime)) {
    try { dados = await lerArquivoJSON(await drive.baixar(conta.id, id), m.mime, PROMPT_OCR(empresas)); } catch (e) { dados = { erro_ocr: e.message }; }
  } else dados = { legivel: false, motivo: 'arquivo grande ou formato sem OCR; classificado pelo nome' };
  return arquivar(conta, { driveId: id, mime: m.mime, tamanho: m.tamanho, nomeOriginal: m.nome, dados });
}

async function arquivar(conta, { bytes, driveId, mime, tamanho, nomeOriginal = '', dados = {} }) {
  const tipo = tipoValido(dados.tipo); const empresa = normalizarEmpresa(dados.empresa, conta);
  const dataDoc = dados.data_doc || hoje(); const ano = dataDoc.slice(0, 4);
  const titulo = dados.titulo || nomeOriginal.replace(/\.\w+$/, '') || `Documento ${dataDoc}`;
  const nome = `${dataDoc}_${slug(tipo.replace(/s$/, ''))}_${slug(titulo) || 'documento'}.${ext(mime, nomeOriginal)}`;
  const pastaId = await drive.pastaDestino(conta.id, { empresa, tipo, ano });
  const arq = bytes ? await drive.upload(conta.id, { nome, mime, bytes, pastaId, descricao: dados.resumo }) : await drive.mover(conta.id, driveId, pastaId, nome);
  const r = db.prepare(`INSERT INTO documentos (conta_id, empresa, tipo, titulo, contraparte, data_doc, drive_id, drive_link, pasta, mime, tamanho, resumo, dados_json, sensivel)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(conta.id, empresa, tipo, titulo, dados.contraparte || null, dataDoc, arq.id, arq.link, `${empresa}/${tipo}/${ano}`, mime, tamanho ?? bytes?.byteLength ?? null, dados.resumo || null, JSON.stringify(dados), dados.sensivel ? 1 : 0);
  const doc = { documento_id: r.lastInsertRowid, titulo, empresa, tipo, pasta: `${empresa}/${tipo}/${ano}`, link: arq.link, contraparte: dados.contraparte, data_doc: dataDoc, resumo: dados.resumo, valor: dados.valor, sensivel: !!dados.sensivel, legivel: dados.legivel !== false, campos: dados.campos };
  // Vigência/validade detectada → registra e agenda avisos automaticamente
  const fim = dados.vigencia?.fim || dados.validade;
  if (fim && /^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    try { doc.vigencia = await registrarVigencia(conta, { documento_id: doc.documento_id, descricao: titulo, empresa, tipo, inicio: dados.vigencia?.inicio, vence_em: fim, aviso_previo_dias: dados.vigencia?.aviso_previo_dias || 0, renovacao_auto: !!dados.vigencia?.renovacao_auto }); }
    catch (e) { doc.vigencia_erro = e.message; }
  }
  return doc;
}

async function registrarVigencia(conta, a) {
  const r = db.prepare(`INSERT INTO vigencias (conta_id, documento_id, descricao, empresa, tipo, inicio, vence_em, aviso_previo_dias, renovacao_auto) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(conta.id, a.documento_id || null, a.descricao, a.empresa || null, a.tipo || null, a.inicio || null, a.vence_em, a.aviso_previo_dias || 0, a.renovacao_auto ? 1 : 0);
  const id = r.lastInsertRowid; let gcal_link = null;
  try {
    const ev = await gcal.criarEvento(conta.id, { titulo: `📄 Vence: ${a.descricao}`, inicio: `${a.vence_em}T09:00`, fim: `${a.vence_em}T09:30`, categoria: 'Profissional', lembreteMin: 1440,
      descricao: `Vigência registrada pelo módulo Documentos.${a.aviso_previo_dias ? ` Aviso prévio: ${a.aviso_previo_dias} dias.` : ''}${a.renovacao_auto ? ' Renovação automática.' : ''}` });
    db.prepare('UPDATE vigencias SET gcal_event_id=? WHERE id=?').run(ev.id, id); gcal_link = ev.link;
  } catch {}
  return { vigencia_id: id, vence_em: a.vence_em, aviso_previo_dias: a.aviso_previo_dias || 0, avisos: '30, 7 e 1 dia antes (e no dia)', agenda: gcal_link || 'não criado na agenda' };
}

export function ferramentas(_conta) {
  return [
    { name: 'buscar_documento', description: 'Busca documentos arquivados por descrição (título, contraparte, empresa, tipo, texto). Devolve até 5 com link do Drive.', parameters: { type: 'OBJECT', properties: { texto: { type: 'STRING' }, empresa: { type: 'STRING' }, tipo: { type: 'STRING', description: TIPOS.join('|') } }, required: ['texto'] } },
    { name: 'listar_documentos', description: 'Lista documentos recentes, filtrando por empresa/tipo/período.', parameters: { type: 'OBJECT', properties: { empresa: { type: 'STRING' }, tipo: { type: 'STRING' }, de: { type: 'STRING', description: 'YYYY-MM-DD' }, ate: { type: 'STRING' }, max: { type: 'NUMBER' } } } },
    { name: 'atualizar_documento', description: 'Corrige dados de um documento já arquivado (título, empresa, tipo, contraparte, data). Se empresa/tipo mudar, move o arquivo de pasta no Drive.', parameters: { type: 'OBJECT', properties: { documento_id: { type: 'NUMBER' }, titulo: { type: 'STRING' }, empresa: { type: 'STRING' }, tipo: { type: 'STRING' }, contraparte: { type: 'STRING' }, data_doc: { type: 'STRING' } }, required: ['documento_id'] } },
    { name: 'registrar_vigencia', description: 'Registra vencimento/validade (contrato, certidão, alvará, seguro, CNH…). Cria evento no marcador Profissional e avisos 30/7/1 dias antes. Use quando o dono informar uma data que o OCR não pegou.', parameters: { type: 'OBJECT', properties: { descricao: { type: 'STRING' }, vence_em: { type: 'STRING', description: 'YYYY-MM-DD' }, documento_id: { type: 'NUMBER' }, empresa: { type: 'STRING' }, tipo: { type: 'STRING' }, inicio: { type: 'STRING' }, aviso_previo_dias: { type: 'NUMBER' }, renovacao_auto: { type: 'BOOLEAN' } }, required: ['descricao', 'vence_em'] } },
    { name: 'listar_vencimentos', description: 'Lista vigências/validades que vencem nos próximos N dias (padrão 60), inclusive já vencidas em aberto.', parameters: { type: 'OBJECT', properties: { dias: { type: 'NUMBER' }, empresa: { type: 'STRING' } } } },
    { name: 'encerrar_vigencia', description: 'Marca uma vigência como renovada/encerrada (para de avisar). Se renovada com nova data, passe nova_data.', parameters: { type: 'OBJECT', properties: { vigencia_id: { type: 'NUMBER' }, nova_data: { type: 'STRING' }, motivo: { type: 'STRING' } }, required: ['vigencia_id'] } },
    { name: 'salvar_cadastro', description: 'Cria ou atualiza cadastro de cliente, fornecedor, colaborador ou prestador. Se já existir pelo nome/documento, atualiza (requer confirmação quando sobrescreve).', parameters: { type: 'OBJECT', properties: { tipo: { type: 'STRING', description: 'cliente|fornecedor|colaborador|prestador|outro' }, nome: { type: 'STRING' }, documento: { type: 'STRING', description: 'CNPJ/CPF' }, email: { type: 'STRING' }, telefone: { type: 'STRING' }, endereco: { type: 'STRING' }, empresa_vinculo: { type: 'STRING', description: 'empresa do dono a que se vincula' }, campos: { type: 'OBJECT', description: 'outros campos livres' } }, required: ['tipo', 'nome'] } },
    { name: 'buscar_cadastro', description: 'Busca cadastros por nome, documento, e-mail ou telefone.', parameters: { type: 'OBJECT', properties: { texto: { type: 'STRING' }, tipo: { type: 'STRING' } }, required: ['texto'] } },
    { name: 'montar_dossie', description: 'Junta todos os documentos de uma empresa num período numa pasta "Dossiês/<empresa>/<período>" do Drive, com um índice. Devolve o link da pasta. Use para "manda para o contador".', parameters: { type: 'OBJECT', properties: { empresa: { type: 'STRING' }, de: { type: 'STRING', description: 'YYYY-MM-DD' }, ate: { type: 'STRING' }, tipos: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['empresa', 'de', 'ate'] } },
    { name: 'pasta_raiz', description: 'Mostra onde os documentos estão sendo guardados no Drive (link da pasta raiz).', parameters: { type: 'OBJECT', properties: {} } },
  ];
}
export const requerConfirmacao = new Set(['encerrar_vigencia']);

const mapaDoc = (d) => ({ documento_id: d.id, titulo: d.titulo, empresa: d.empresa, tipo: d.tipo, contraparte: d.contraparte, data: d.data_doc, pasta: d.pasta, link: d.drive_link, resumo: d.resumo, sensivel: !!d.sensivel });

export async function executar(nome, a, conta, ctx) {
  switch (nome) {
    case 'buscar_documento': {
      const termos = String(a.texto).toLowerCase().split(/\s+/).filter(t => t.length > 2);
      let rows = db.prepare(`SELECT * FROM documentos WHERE conta_id=? AND status='ativo' ${a.empresa ? 'AND lower(empresa) LIKE ?' : ''} ${a.tipo ? 'AND lower(tipo) LIKE ?' : ''} ORDER BY data_doc DESC LIMIT 200`)
        .all(conta.id, ...(a.empresa ? [`%${a.empresa.toLowerCase()}%`] : []), ...(a.tipo ? [`%${a.tipo.toLowerCase().slice(0, 5)}%`] : []));
      const score = (d) => { const t = `${d.titulo} ${d.contraparte} ${d.empresa} ${d.tipo} ${d.resumo} ${d.dados_json}`.toLowerCase(); return termos.filter(x => t.includes(x)).length; };
      rows = rows.map(d => ({ d, s: score(d) })).filter(x => x.s > 0 || termos.length === 0).sort((x, y) => y.s - x.s).slice(0, 5).map(x => mapaDoc(x.d));
      if (!rows.length) { try { const dr = await drive.buscarNoDrive(conta.id, a.texto, 5); return { no_banco: [], no_drive: dr, aviso: dr.length ? 'Achei só na busca geral do Drive (não registrados por mim).' : 'Nada encontrado.' }; } catch (e) { return { no_banco: [], erro_drive: e.message }; } }
      return rows;
    }
    case 'listar_documentos': {
      const rows = db.prepare(`SELECT * FROM documentos WHERE conta_id=? AND status='ativo' ${a.empresa ? 'AND lower(empresa) LIKE ?' : ''} ${a.tipo ? 'AND lower(tipo) LIKE ?' : ''} ${a.de ? 'AND data_doc>=?' : ''} ${a.ate ? 'AND data_doc<=?' : ''} ORDER BY data_doc DESC LIMIT ?`)
        .all(conta.id, ...(a.empresa ? [`%${a.empresa.toLowerCase()}%`] : []), ...(a.tipo ? [`%${a.tipo.toLowerCase().slice(0, 5)}%`] : []), ...(a.de ? [a.de] : []), ...(a.ate ? [a.ate] : []), a.max || 20);
      return rows.map(mapaDoc);
    }
    case 'atualizar_documento': {
      const d = db.prepare('SELECT * FROM documentos WHERE id=? AND conta_id=?').get(a.documento_id, conta.id); if (!d) throw new Error('Documento não encontrado.');
      const empresa = a.empresa ? normalizarEmpresa(a.empresa, conta) : d.empresa, tipo = a.tipo ? tipoValido(a.tipo) : d.tipo, dataDoc = a.data_doc || d.data_doc, titulo = a.titulo || d.titulo;
      let link = d.drive_link, pasta = d.pasta;
      if (empresa !== d.empresa || tipo !== d.tipo || dataDoc.slice(0, 4) !== d.data_doc.slice(0, 4) || titulo !== d.titulo) {
        const pastaId = await drive.pastaDestino(conta.id, { empresa, tipo, ano: dataDoc.slice(0, 4) });
        const mv = await drive.mover(conta.id, d.drive_id, pastaId, `${dataDoc}_${slug(tipo.replace(/s$/, ''))}_${slug(titulo)}.${ext(d.mime, '')}`);
        link = mv.link; pasta = `${empresa}/${tipo}/${dataDoc.slice(0, 4)}`;
      }
      db.prepare('UPDATE documentos SET empresa=?, tipo=?, titulo=?, contraparte=COALESCE(?, contraparte), data_doc=?, drive_link=?, pasta=? WHERE id=?').run(empresa, tipo, titulo, a.contraparte || null, dataDoc, link, pasta, d.id);
      return mapaDoc(db.prepare('SELECT * FROM documentos WHERE id=?').get(d.id));
    }
    case 'registrar_vigencia': return registrarVigencia(conta, a);
    case 'listar_vencimentos': {
      const lim = new Date(Date.now() + (a.dias || 60) * 864e5).toISOString().slice(0, 10);
      return db.prepare(`SELECT v.*, d.drive_link FROM vigencias v LEFT JOIN documentos d ON d.id=v.documento_id WHERE v.conta_id=? AND v.status='ativa' AND v.vence_em<=? ${a.empresa ? 'AND lower(v.empresa) LIKE ?' : ''} ORDER BY v.vence_em`).all(conta.id, lim, ...(a.empresa ? [`%${a.empresa.toLowerCase()}%`] : []))
        .map(v => ({ vigencia_id: v.id, descricao: v.descricao, empresa: v.empresa, vence_em: v.vence_em, dias_restantes: Math.ceil((new Date(v.vence_em) - new Date(hoje())) / 864e5), aviso_previo_dias: v.aviso_previo_dias, renovacao_auto: !!v.renovacao_auto, link: v.drive_link }));
    }
    case 'encerrar_vigencia': {
      const v = db.prepare('SELECT * FROM vigencias WHERE id=? AND conta_id=?').get(a.vigencia_id, conta.id); if (!v) throw new Error('Vigência não encontrada.');
      db.prepare("UPDATE vigencias SET status=? WHERE id=?").run(a.nova_data ? 'renovada' : 'encerrada', v.id);
      if (v.gcal_event_id) { try { await gcal.cancelarEvento(conta.id, v.gcal_event_id); } catch {} }
      if (a.nova_data) return { encerrada: v.id, nova: await registrarVigencia(conta, { ...v, documento_id: v.documento_id, vence_em: a.nova_data, inicio: v.vence_em }) };
      return { encerrada: v.id, motivo: a.motivo || null };
    }
    case 'salvar_cadastro': {
      const ex = db.prepare(`SELECT * FROM cadastros WHERE conta_id=? AND (lower(nome)=? ${a.documento ? 'OR documento=?' : ''}) LIMIT 1`).get(conta.id, a.nome.toLowerCase(), ...(a.documento ? [a.documento] : []));
      const campos = { ...(ex ? JSON.parse(ex.campos_json || '{}') : {}), ...(a.campos || {}) };
      const dados = { tipo: a.tipo || ex?.tipo, nome: a.nome, documento: a.documento || ex?.documento || null, email: a.email || ex?.email || null, telefone: a.telefone || ex?.telefone || null, endereco: a.endereco || ex?.endereco || null, empresa_vinculo: a.empresa_vinculo || ex?.empresa_vinculo || null };
      const completo = !!(dados.documento && (dados.email || dados.telefone));
      if (ex) {
        if (!ctx?.confirmado && (a.documento && ex.documento && a.documento !== ex.documento)) throw new Error(`Já existe cadastro "${ex.nome}" com documento ${ex.documento}. Confirme com o dono antes de sobrescrever.`);
        db.prepare('UPDATE cadastros SET tipo=?, nome=?, documento=?, email=?, telefone=?, endereco=?, empresa_vinculo=?, campos_json=?, completo=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?').run(dados.tipo, dados.nome, dados.documento, dados.email, dados.telefone, dados.endereco, dados.empresa_vinculo, JSON.stringify(campos), completo ? 1 : 0, ex.id);
        return { cadastro_id: ex.id, atualizado: true, completo, faltando: completo ? [] : ['documento', 'email/telefone'].filter(f => f === 'documento' ? !dados.documento : !(dados.email || dados.telefone)) };
      }
      const r = db.prepare('INSERT INTO cadastros (conta_id, tipo, nome, documento, email, telefone, endereco, empresa_vinculo, campos_json, completo) VALUES (?,?,?,?,?,?,?,?,?,?)').run(conta.id, dados.tipo, dados.nome, dados.documento, dados.email, dados.telefone, dados.endereco, dados.empresa_vinculo, JSON.stringify(campos), completo ? 1 : 0);
      return { cadastro_id: r.lastInsertRowid, criado: true, completo, faltando: completo ? [] : ['documento', 'email/telefone'].filter(f => f === 'documento' ? !dados.documento : !(dados.email || dados.telefone)) };
    }
    case 'buscar_cadastro': {
      const q = `%${String(a.texto).toLowerCase()}%`;
      return db.prepare(`SELECT * FROM cadastros WHERE conta_id=? ${a.tipo ? 'AND tipo=?' : ''} AND (lower(nome) LIKE ? OR documento LIKE ? OR lower(email) LIKE ? OR telefone LIKE ?) LIMIT 10`).all(conta.id, ...(a.tipo ? [a.tipo] : []), q, q, q, q)
        .map(c => ({ cadastro_id: c.id, tipo: c.tipo, nome: c.nome, documento: c.documento, email: c.email, telefone: c.telefone, endereco: c.endereco, empresa_vinculo: c.empresa_vinculo, campos: JSON.parse(c.campos_json || '{}'), completo: !!c.completo }));
    }
    case 'montar_dossie': {
      const docs = db.prepare(`SELECT * FROM documentos WHERE conta_id=? AND status='ativo' AND lower(empresa) LIKE ? AND data_doc BETWEEN ? AND ? ORDER BY tipo, data_doc`).all(conta.id, `%${a.empresa.toLowerCase()}%`, a.de, a.ate)
        .filter(d => !a.tipos?.length || a.tipos.map(t => t.toLowerCase().slice(0, 5)).some(t => d.tipo.toLowerCase().startsWith(t)));
      if (!docs.length) return { itens: 0, aviso: 'Nenhum documento no período.' };
      const raiz = await drive.pastaRaiz(conta.id);
      const pasta = await drive.obterOuCriarPasta(conta.id, `${a.de} a ${a.ate}`, await drive.obterOuCriarPasta(conta.id, a.empresa, await drive.obterOuCriarPasta(conta.id, 'Dossiês', raiz)));
      const linhas = [`DOSSIÊ ${a.empresa} — ${a.de} a ${a.ate}`, `Gerado em ${hoje()} pelo Assessor KM`, ''];
      for (const d of docs) { try { await drive.copiar(conta.id, d.drive_id, pasta); } catch {} linhas.push(`[${d.tipo}] ${d.data_doc} — ${d.titulo}${d.contraparte ? ` (${d.contraparte})` : ''}${d.resumo ? `\n    ${d.resumo}` : ''}`); }
      await drive.criarTexto(conta.id, { nome: '00_indice.txt', conteudo: linhas.join('\n'), pastaId: pasta });
      return { itens: docs.length, link: await drive.linkPasta(conta.id, pasta), tipos: [...new Set(docs.map(d => d.tipo))] };
    }
    case 'pasta_raiz': { const id = await drive.pastaRaiz(conta.id); return { link: await drive.linkPasta(conta.id, id), estrutura: 'Raiz / Empresa / Tipo / Ano' }; }
    default: throw new Error(`documentos.${nome}: não implementada`);
  }
}

/** Rotina diária: avisos de vencimento 30/7/1/0 dias. Devolve mensagens por conta. */
export function avisosDeVencimento(contaId) {
  const h = new Date(hoje()); const out = [];
  for (const v of db.prepare("SELECT * FROM vigencias WHERE conta_id=? AND status='ativa'").all(contaId)) {
    const dias = Math.round((new Date(v.vence_em) - h) / 864e5);
    const marcos = [30, 7, 1, 0]; const enviados = (v.avisos_enviados || '').split(',').filter(Boolean).map(Number);
    const marco = marcos.find(m => dias <= m && !enviados.includes(m) && dias >= (m === 0 ? -3650 : 0));
    if (marco == null) continue;
    db.prepare('UPDATE vigencias SET avisos_enviados=? WHERE id=?').run([...new Set([...enviados, ...marcos.filter(m => m >= dias)])].join(','), v.id);
    const quando = dias < 0 ? `venceu há ${-dias} dia(s)` : dias === 0 ? 'vence HOJE' : `vence em ${dias} dia(s) (${v.vence_em.split('-').reverse().join('/')})`;
    out.push(`📄 ${v.descricao}${v.empresa ? ` — ${v.empresa}` : ''} ${quando}.${v.aviso_previo_dias ? ` Aviso prévio: ${v.aviso_previo_dias} dias.` : ''}${v.renovacao_auto ? ' Renova automaticamente — cancele antes se não quiser.' : ''}`);
  }
  return out;
}
