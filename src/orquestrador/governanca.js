// Comandos de governança tratados antes da IA: ligar/desligar módulos, conectar Google, ajustar persona.
import { db } from '../db/index.js';
import { urlAutorizacao } from '../integracoes/google-calendar.js';
const MODS = { secretaria: 'Secretária', producao: 'Produção', documentos: 'Documentos', financeiro: 'Financeiro', social: 'Social' };
const alias = { secretária: 'secretaria', produção: 'producao', financeira: 'financeiro', 'social media': 'social', instagram: 'social', docs: 'documentos' };
const norm = (s) => alias[s] || s;

export function governanca(msg, conta) {
  const t = msg.texto.trim().toLowerCase();
  let m;
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
    db.prepare('INSERT INTO persona_config (conta_id, modulo, nome) VALUES (?,?,?) ON CONFLICT(conta_id, modulo) DO UPDATE SET nome=excluded.nome').run(conta.id, mod, m[2].trim());
    return `Combinado. ${MODS[mod] || 'Diretor'} agora se chama ${m[2].trim()}.`;
  }
  if ((m = t.match(/^(?:me )?(?:chame|trate|chama) (?:de|como) (.+)$/))) {
    db.prepare('INSERT INTO persona_config (conta_id, modulo, tratamento) VALUES (?,?,?) ON CONFLICT(conta_id, modulo) DO UPDATE SET tratamento=excluded.tratamento').run(conta.id, 'diretor', m[1].trim());
    return `Certo, ${m[1].trim()}.`;
  }
  if ((m = t.match(/^foco do m[êe]s[:\s]+(.+)$/))) { db.prepare('UPDATE contas SET foco_mes=? WHERE id=?').run(m[1].trim(), conta.id); return `Foco do mês: ${m[1].trim()}. Toda a equipe vai priorizar isso.`; }
  return null;
}
