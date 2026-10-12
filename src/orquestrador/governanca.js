// Comandos de governança tratados antes da IA: ligar/desligar módulos, conectar Google, ajustar persona.
import { db } from '../db/index.js';
import { urlAutorizacao, listarEventos, listarCalendarios, obterOuCriarCalendario } from '../integracoes/google-calendar.js';
const MODS = { secretaria: 'Secretária', producao: 'Produção', documentos: 'Documentos', financeiro: 'Financeiro', social: 'MIA (Social Media)' };
const alias = { secretária: 'secretaria', produção: 'producao', financeira: 'financeiro', 'social media': 'social', instagram: 'social', mia: 'social', docs: 'documentos' };
const semAcento = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => alias[s] || alias[semAcento(s)] || semAcento(s);

const fmtHora = (e) => e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : 'dia todo';
const fmtDia = (e) => new Date(e.start?.dateTime || e.start?.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
async function agenda(conta, dias, titulo) {
  const ini = new Date(); ini.setHours(0, 0, 0, 0); if (dias === 'amanha') ini.setDate(ini.getDate() + 1);
  const fim = new Date(ini); fim.setDate(fim.getDate() + (dias === 'semana' ? 7 : 1));
  const evs = await listarEventos(conta.id, { inicio: ini.toISOString(), fim: fim.toISOString() });
  if (!evs.length) return `${titulo}: nada marcado.`;
  const linhas = evs.map(e => `- ${dias === 'semana' ? fmtDia(e) + ' ' : ''}${fmtHora(e)} ${e.summary || '(sem título)'}${e.categoria && e.categoria !== conta.nome_dono ? ' [' + e.categoria + ']' : ''}${e.location ? ' · ' + e.location : ''}`);
  return `*${titulo}* (${evs.length})\n${linhas.join('\n')}`;
}

export async function governanca(msg, conta) {
  const orig = msg.texto.trim();
  const t = orig.toLowerCase();
  const caso = (frag) => orig.slice(t.indexOf(frag), t.indexOf(frag) + frag.length); // mesmo trecho com a caixa original
  let m;
  if ((m = t.match(/^(?:me chamo|meu nome é|pode me chamar de)\s+(.+)$/))) { db.prepare('UPDATE contas SET nome_dono=? WHERE id=?').run(caso(m[1]), conta.id); return `Anotado, ${caso(m[1])}.`; }
  if ((m = t.match(/^(?:minha empresa é|a empresa é|empresa:)\s+(.+)$/))) { db.prepare('UPDATE contas SET empresa=? WHERE id=?').run(caso(m[1]), conta.id); return `Empresa principal: ${caso(m[1])}.`; }
  if ((m = t.match(/^(?:diretor,?\s*)?(ativa|liga|ativar|ligar)\s+(?:o|a|módulo|modulo)?\s*([\wçãõáéíóú ]+)$/))) {
    const mod = norm(m[2].trim()); if (!MODS[mod]) return `Não conheço o módulo "${m[2]}". Disponíveis: ${Object.values(MODS).join(', ')}.`;
    db.prepare('INSERT INTO modulos (conta_id, modulo, ligado) VALUES (?,?,1) ON CONFLICT(conta_id, modulo) DO UPDATE SET ligado=1').run(conta.id, mod);
    return `✅ ${MODS[mod]} ligado. ${mod === 'producao' ? 'Preciso do token do AgilFac da sua empresa.' : mod === 'social' ? 'Preciso conectar seu Instagram.' : mod === 'documentos' ? 'Diga "conectar google" de novo e aceite o acesso ao Drive; depois é só mandar foto, PDF ou link do Drive. Para escolher a pasta: documentos pasta <link>.' : 'Já pode usar.'}`;
  }
  if ((m = t.match(/^(?:diretor,?\s*)?(desativa|desliga|desativar|desligar)\s+(?:o|a|módulo|modulo)?\s*([\wçãõáéíóú ]+)$/))) {
    const mod = norm(m[2].trim()); if (!MODS[mod]) return `Não conheço o módulo "${m[2]}".`;
    db.prepare('UPDATE modulos SET ligado=0 WHERE conta_id=? AND modulo=?').run(conta.id, mod);
    return `${MODS[mod]} desligado. Os dados ficam guardados.`;
  }
  if (/^status$|^conex[õo]es$/.test(t)) {
    const g = db.prepare('SELECT token_json FROM google_auth WHERE conta_id=?').get(conta.id);
    const ig = db.prepare('SELECT 1 FROM instagram_auth WHERE conta_id=?').get(conta.id);
    return `Conexões:\n- Google Agenda/Gmail: ${g ? '✅ conectado' : '❌ não conectado (diga "conectar google")'}\n- Google Drive: ${g && /auth\/drive/.test(JSON.parse(g.token_json || '{}').scope || '') ? '✅' : '❌ (diga "conectar google" de novo e aceite o Drive)'}\n- Instagram: ${ig ? '✅' : '❌'}\n- AgilFac: ${process.env.AGILFAC_API_URL ? '✅' : '❌'}`;
  }
  if (/^agenda( de)? hoje$|^(o que|oq) (eu )?tenho hoje\??$|^hoje\??$/.test(t)) return agenda(conta, 'hoje', 'Hoje');
  if (/^agenda( de)? amanh[ãa]$|^(o que|oq) (eu )?tenho amanh[ãa]\??$/.test(t)) return agenda(conta, 'amanha', 'Amanhã');
  if (/^agenda( da)? semana$|^(o que|oq) (eu )?tenho (essa |nesta |na )?semana\??$|^semana$/.test(t)) return agenda(conta, 'semana', 'Próximos 7 dias');
  if (/^(programa[çc][ãa]o|posts? agendados?|calend[áa]rio editorial)$/.test(t)) {
    const ps = db.prepare("SELECT id, formato, tema, data, status FROM posts WHERE conta_id=? AND status IN ('rascunho','agendado') ORDER BY data IS NULL, data").all(conta.id);
    if (!ps.length) return 'Nada programado. Peça à MIA: "cria um post sobre …".';
    return `*Programação* (${ps.length})\n${ps.map(p => `- #${p.id} ${p.status === 'agendado' ? new Date(p.data).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'rascunho'} · ${p.formato}: ${p.tema || '(sem tema)'}`).join('\n')}`;
  }
  if (/^(categorias|marcadores|calend[áa]rios)$/.test(t)) {
    const c = await listarCalendarios(conta.id);
    return `Marcadores da agenda:\n${c.map(x => `- ${x.nome}${x.primario ? ' (principal)' : ''}`).join('\n')}\n\nPara criar: "criar marcador Família". Para usar: "marca dentista quinta 15h, marcador Saúde".`;
  }
  if ((m = t.match(/^(?:cria|criar|novo|nova) (?:marcador|categoria|calend[áa]rio)[:\s]+(.+)$/))) {
    const c = await obterOuCriarCalendario(conta.id, caso(m[1].trim()));
    return `✅ Marcador *${c.nome}* pronto na sua agenda Google.`;
  }
  if ((m = t.match(/^conectar? instagram\s+(\d{5,})\s+(\S+)$/))) {
    db.prepare('INSERT INTO instagram_auth (conta_id, ig_user_id, token) VALUES (?,?,?) ON CONFLICT(conta_id) DO UPDATE SET ig_user_id=excluded.ig_user_id, token=excluded.token').run(conta.id, m[1], caso(m[2]));
    db.prepare('INSERT INTO modulos (conta_id, modulo, ligado) VALUES (?,?,1) ON CONFLICT(conta_id, modulo) DO UPDATE SET ligado=1').run(conta.id, 'social');
    return '✅ Instagram conectado e módulo Social ligado. Agora me conte a identidade da marca (perfil, nicho, público, tom, pilares) ou peça "cria um post sobre …".';
  }
  if (/^conectar? instagram$/.test(t)) return 'Me mande numa linha: `conectar instagram <IG_USER_ID> <ACCESS_TOKEN>` (os mesmos do bot antigo). Depois eu apago a mensagem do histórico.';
  if (/^(quais|que) módulos|^módulos$|^equipe$/.test(t)) {
    const nomeDe = (mod) => { const r = db.prepare('SELECT nome FROM persona_config WHERE conta_id=? AND modulo=?').get(conta.id, mod); return r?.nome ? `${r.nome} (${mod === 'diretor' ? 'Diretor' : MODS[mod]})` : (mod === 'diretor' ? 'Diretor' : MODS[mod]); };
    const ligados = db.prepare('SELECT modulo FROM modulos WHERE conta_id=? AND ligado=1').all(conta.id).map(r => r.modulo);
    const off = Object.keys(MODS).filter(k => !ligados.includes(k));
    return `Equipe ativa: ${['diretor', ...ligados].map(nomeDe).join(', ')}.\nDesligados: ${off.map(k => MODS[k]).join(', ') || 'nenhum'}.`;
  }
  if ((m = msg.texto.trim().match(/^documentos?\s+pasta\s+(\S+)$/i))) {
    try { const { definirPastaRaiz } = await import('../integracoes/google-drive.js'); const r = await definirPastaRaiz(conta.id, m[1]); return `📂 Pasta raiz dos documentos: "${r.nome}". Vou criar dentro dela Empresa/Tipo/Ano.`; }
    catch (e) { return `Não consegui usar essa pasta: ${e.message}`; }
  }
  if (/^documentos?\s+pasta$/.test(t)) { try { const d = await import('../integracoes/google-drive.js'); const id = await d.pastaRaiz(conta.id); return `📂 Documentos ficam em: https://drive.google.com/drive/folders/${id}\nPara trocar: documentos pasta <link da pasta>`; } catch (e) { return e.message; } }
  if (/conectar? (o )?google|conectar? (a )?agenda|conectar? (o )?drive/.test(t)) {
    const base = process.env.PUBLIC_URL || '';
    return `Abra este link para autorizar o Google Agenda:\n${base}/oauth/google/iniciar/${conta.id}\n\n(ou direto: ${urlAutorizacao(conta.id)})`;
  }
  if ((m = t.match(/^(?:diretor,?\s*)?(?:a|o)?\s*([\wÀ-ÿ]+) (?:agora )?se chama (.+)$/))) {
    const mod = norm(m[1]); if (!MODS[mod] && mod !== 'diretor') return null;
    db.prepare('INSERT INTO persona_config (conta_id, modulo, nome) VALUES (?,?,?) ON CONFLICT(conta_id, modulo) DO UPDATE SET nome=excluded.nome').run(conta.id, mod, caso(m[2].trim()));
    return `Combinado. ${MODS[mod] || 'Diretor'} agora se chama ${caso(m[2].trim())}.`;
  }
  if ((m = t.match(/^(?:me )?(?:chame|trate|chama) (?:de|como) (.+)$/))) {
    db.prepare('INSERT INTO persona_config (conta_id, modulo, tratamento) VALUES (?,?,?) ON CONFLICT(conta_id, modulo) DO UPDATE SET tratamento=excluded.tratamento').run(conta.id, 'diretor', caso(m[1].trim()));
    return `Certo, ${caso(m[1].trim())}.`;
  }
  if ((m = t.match(/^foco do m[êe]s[:\s]+(.+)$/))) { db.prepare('UPDATE contas SET foco_mes=? WHERE id=?').run(caso(m[1].trim()), conta.id); return `Foco do mês: ${caso(m[1].trim())}. Toda a equipe vai priorizar isso.`; }
  return null;
}
