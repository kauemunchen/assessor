import * as ig from '../integracoes/instagram.js';
import { db } from '../db/index.js';
export function ferramentas(_conta) {
  return [
    { name: 'criar_post', description: 'Salva um post no calendário editorial (rascunho)', parameters: { type: 'OBJECT', properties: { formato: { type: 'STRING', description: 'post|carrossel|reels|story' }, pilar: { type: 'STRING' }, data: { type: 'STRING' }, legenda: { type: 'STRING' }, briefing_imagem: { type: 'STRING' } }, required: ['formato', 'data'] } },
    { name: 'gerar_midia', description: 'Gera imagem via fal.ai a partir de briefing', parameters: { type: 'OBJECT', properties: { briefing: { type: 'STRING' }, ratio: { type: 'STRING' } }, required: ['briefing'] } },
    { name: 'listar_calendario', description: 'Lista posts planejados', parameters: { type: 'OBJECT', properties: { inicio: { type: 'STRING' }, fim: { type: 'STRING' } } } },
    { name: 'publicar', description: 'Publica post aprovado no Instagram (requer confirmação)', parameters: { type: 'OBJECT', properties: { post_id: { type: 'NUMBER' } }, required: ['post_id'] } },
    { name: 'ler_metricas', description: 'Métricas da conta nos últimos N dias', parameters: { type: 'OBJECT', properties: { dias: { type: 'NUMBER' } } } },
  ];
}
export const requerConfirmacao = new Set(['publicar']);
export async function executar(nome, a, conta) {
  const cred = db.prepare('SELECT * FROM instagram_auth WHERE conta_id=?').get(conta.id);
  switch (nome) {
    case 'criar_post': { const r = db.prepare('INSERT INTO posts (conta_id, formato, pilar, data, legenda, briefing_imagem, status) VALUES (?,?,?,?,?,?,?)').run(conta.id, a.formato, a.pilar || null, a.data, a.legenda || null, a.briefing_imagem || null, 'rascunho'); return { id: r.lastInsertRowid }; }
    case 'gerar_midia': return { url: await ig.gerarImagemFal(a.briefing, a.ratio || '4:5') };
    case 'listar_calendario': return db.prepare('SELECT id, formato, pilar, data, status FROM posts WHERE conta_id=? AND data BETWEEN ? AND ? ORDER BY data').all(conta.id, a.inicio || '2000-01-01', a.fim || '2100-01-01');
    case 'publicar': {
      if (!cred) throw new Error('Instagram não conectado.');
      const p = db.prepare('SELECT * FROM posts WHERE id=? AND conta_id=?').get(a.post_id, conta.id);
      if (!p || !p.midia_url) throw new Error('Post sem mídia aprovada.');
      const id = await ig.publicar({ igUserId: cred.ig_user_id, token: cred.token, legenda: p.legenda, url: p.midia_url, tipo: p.formato === 'story' ? 'story' : p.formato === 'reels' ? 'reels' : 'imagem' });
      db.prepare('UPDATE posts SET status=?, ig_media_id=? WHERE id=?').run('publicado', id, p.id); return { ig_media_id: id };
    }
    case 'ler_metricas': { if (!cred) throw new Error('Instagram não conectado.'); return ig.metricas({ igUserId: cred.ig_user_id, token: cred.token, desde: Math.floor(Date.now() / 1000) - (a.dias || 30) * 86400 }); }
    default: throw new Error(`social.${nome}: não implementada`);
  }
}
