// Grava a identidade de marca do Kauê na conta informada. Uso: node scripts/seed-identidade-km.js [conta_id=1]
import { db } from '../src/db/index.js';
import { migrar } from '../src/db/migrate.js';
migrar();
const contaId = Number(process.argv[2] || 1);
const dados = {
  perfil: 'Kauê München (@kauemunchen)',
  nicho: 'Gestão e estruturação de empresas para empresários. O gestor que saiu do operacional e ensina o dono a fazer o mesmo, com processo, pessoas e tecnologia (IA e automação).',
  publico: 'Donos de PMEs, 28–50 anos, presos na operação (indústria, confecção, serviços, comércio); secundário: gestores e líderes em crescimento.',
  tom: 'Direto, prático, autoridade de quem fez na prática; de igual para igual, sem guru, números reais; ironia leve contra o "aqui sempre foi assim".',
  pilares: 'Prática · Clareza · Provocação · Proximidade · Visão de futuro',
  hashtags_fixas: '#kauemunchen #gestao #empreendedorismo',
  descricao: 'Ver conhecimento/estrategia-conteudo.md para a versão completa.',
};
db.prepare('INSERT INTO social_identidade (conta_id, dados) VALUES (?,?) ON CONFLICT(conta_id) DO UPDATE SET dados=excluded.dados').run(contaId, JSON.stringify(dados));
console.log('identidade gravada para conta', contaId);
