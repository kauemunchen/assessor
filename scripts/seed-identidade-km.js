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
  pilares: 'Tom: Prática · Clareza · Provocação · Proximidade · Visão de futuro. Conteúdo: GESTÃO · NEGÓCIOS · IA · AUTOMAÇÃO (máx. 2 seguidos do mesmo).',
  hashtags_fixas: '#gestaoempresarial #empreendedorismo #kauemunchen',
  hashtags_pilar: { gestao: '#gestao #processos #lideranca #indicadores', negocios: '#negocios #empresario #pme #donodeempresa', ia: '#inteligenciaartificial #ia #ferramentasdeia', automacao: '#automacao #produtividade #bots' },
  ctas: { salvar: 'Salva para aplicar na segunda-feira.', compartilhar: 'Manda para aquele sócio que ainda faz tudo sozinho.', comentar: 'Comenta PROCESSO que eu te mando o modelo.', seguir: 'Segue @kauemunchen para tirar sua empresa das suas costas.', conversa: 'Me conta nos comentários: qual tarefa você queria automatizar?', direct: 'Chama no direct com a palavra 3R. (só após o post 30)' },
  agenda: 'seg–sex: reel 12h (um pilar) + carrossel/estático 19h (outro pilar); stories ao longo do dia. Sáb/dom/feriado: só stories de família.',
  fase: '30 primeiros posts, 13/10 a 03/11/2026; sem venda, só alcance e relacionamento.',
  formatos: 'reel/story 9:16 1080×1920; carrossel/estático 3:4 1080×1440; carrossel 6–8 slides',
  cores: 'primária #37414E · secundária #C8CFD7 · branco · preto · dourado #B9964B só destaque',
  tipografia: 'Poppins (etiqueta Bold 30 caixa alta; título 64–72 / 52–54 Bold; texto Regular 30–32; assinatura Medium 22 caixa alta)',
  provas: '15 anos em gestão · +80 sob gestão · +500 formados · +30 operações · +350 OPs/mês · reprovação ≤1% · 3h → 15 min/dia',
  series: 'Antes do processo · Método 3R (Raio-X, Rota, Ritmo) · Ferramenta da semana',
  descricao: 'Manual completo em conhecimento/estrategia-conteudo.md.',
};
db.prepare('INSERT INTO social_identidade (conta_id, dados) VALUES (?,?) ON CONFLICT(conta_id) DO UPDATE SET dados=excluded.dados').run(contaId, JSON.stringify(dados));
console.log('identidade gravada para conta', contaId);
