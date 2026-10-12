// Comandos de governança tratados antes da IA: ligar/desligar módulos, conectar Google, ajustar persona.
import { db } from '../db/index.js';
import { urlAutorizacao, listarEventos, listarCalendarios, obterOuCriarCalendario } from '../integracoes/google-calendar.js';
const MODS = { secretaria: 'Secretária', producao: 'Produção', documentos: 'Documentos', financeiro: 'Financeiro', social: 'Social' };
const alias = { secretária: 'secretaria', produção: 'producao', financeira: 'financeiro', 'social media': 'social', instagram: 'social', docs: 'documentos' };
const norm = (s) => alias[s] || s;

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
    return `✅ ${MODS[mod]} ligado. ${mod === 'producao' ? 'Preciso do token do AgilFac da sua empresa.' : mod === 'social' ? 'Preciso conectar seu Instagram.' : 'Já pode usar.'}`;
  }
  if ((m = t.match(/^(?:diretor,?\s*)?(desativa|desliga|desativar|desligar)\s+(?:o|a|módulo|modulo)?\s*([\wçãõáéíóú ]+)$/))) {
    const mod = norm(m[2].trim()); if (!MODS[mod]) return `Não conheço o módulo "${m[2]}".`;
    db.prepare('UPDATE modulos SET ligado=0 WHERE conta_id=? AND modulo=?').run(conta.id, mod);
    return `${MODS[mod]} desligado. Os dados ficam guardados.`;
  }
  if (/^status$|^conex[õo]es$/.test(t)) {
    const g = db.prepare('SELECT 1 FROM google_auth WHERE conta_id=?').get(conta.id);
    const ig = db.prepare('SELECT 1 FROM instagram_auth WHERE conta_id=?').get(conta.id);
    return `Conexões:\n- Google Agenda: ${g ? '✅ conectado' : '❌ não conectado (diga "conectar google")'}\n- Instagram: ${ig ? '✅' : '❌'}\n- AgilFac: ${process.env.AGILFAC_API_URL ? '✅' : '❌'}`;
  }
  if (/^agenda( de)? hoje$|^(o que|oq) (eu )?tenho hoje\??$|^hoje\??$/.test(t)) return agenda(conta, 'hoje', 'Hoje');
  if (/^agenda( de)? amanh[ãa]$|^(o que|oq) (eu )?tenho amanh[ãa]\??$/.test(t)) return agenda(conta, 'amanha', 'Amanhã');
  if (/^agenda( da)? semana$|^(o que|oq) (eu )?tenho (essa |nesta |na )?semana\??$|^semana$/.test(t)) return agenda(conta, 'semana', 'Próximos 7 dias');
  if (/^(categorias|marcadores|calend[áa]rios)$/.test(t)) {
    const c = await listarCalendarios(conta.id);
    return `Marcadores da agenda:\n${c.map(x => `- ${x.nome}${x.primario ? ' (principal)' : ''}`).join('\n')}\n\nPara criar: "criar marcador Família". Para usar: "marca dentista quinta 15h, marcador Saúde".`;
  }
  if ((m = t.match(/^(?:cria|criar|novo|nova) (?:marcador|categoria|calend[áa]rio)[:\s]+(.+)$/))) {
    const c = await obterOuCriarCalendario(conta.id, caso(m[1].trim()));
    return `✅ Marcador *${c.nome}* pronto na sua agenda Google.`;
  }
  if (/^(quais|que) módulos|^módulos$|^equipe$/.test(t)) {
    const on = db.prepare('SELECT modulo FROM modulos WHERE conta_id=? AND ligado=1').all(conta.id).map(r => MODS[r.modulo]);
    return `Equipe ativa: Diretor${on.length ? ', ' + on.join(', ') : ''}.\nDesligados: ${Object.entries(MODS).filter(([k]) => !on.includes(MODS[k])).map(([, v]) => v).join(', ') || 'nenhum'}.`;
  }
  if (/conectar? (o )?google|conectar? (a )?agenda/.test(t)) {
    const base = process.env.PUBLIC_URL || '';
    return `Abra este link para autorizar o Google Agenda:\n${base}/oauth/google/iniciar/${conta.id}\n\n(ou direto: ${urlAutorizacao(conta.id)})`;
  }
  if ((m = t.match(/^(?:diretor,?\s*)?(?:a|o)?\s*(\w+) (?:agora )?se chama (.+)$/))) {
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
