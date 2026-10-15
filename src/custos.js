// Custos operacionais do KM APP (o que você paga aos fornecedores) — para medir margem real e o seu consumo pessoal como admin.
// Tabela custos_cfg guarda as taxas editáveis (preço por 1M tokens de cada modelo, custo do fal, taxas MP, VPS/mês).
import { db } from './db/index.js';

// Preços de referência atualizados (USD por 1M tokens, Google Gemini public pricing).
// Fonte: ai.google.dev/pricing — ajuste em /admin → Custos se seu plano for diferente.
export const PRECOS_PADRAO = {
  'gemini-2.5-pro_in': 1.25,   'gemini-2.5-pro_out': 10.00,  // prompts ≤200k. Acima: 2.50 / 15.00
  'gemini-2.5-flash_in': 0.30, 'gemini-2.5-flash_out': 2.50, // texto/imagem/vídeo. Áudio in: 1.00
  'gemini-flash-lite_in': 0.10,'gemini-flash-lite_out': 0.40,// Gemini 2.5 Flash-Lite
  'gemini-2.0-flash_in': 0.10, 'gemini-2.0-flash_out': 0.40, // texto. Áudio in: 0.70
  'gemini-2.0-flash-lite_in': 0.075, 'gemini-2.0-flash-lite_out': 0.30,
  'gemini-1.5-flash_in': 0.075,'gemini-1.5-flash_out': 0.30, // ≤128k. Acima: 0.15 / 0.60
  'gemini-1.5-pro_in': 1.25,   'gemini-1.5-pro_out': 5.00,   // ≤128k. Acima: 2.50 / 10.00
  // Fal.ai (USD por imagem) — flux/schnell que a MIA usa fica em torno de US$ 0,003
  'fal_imagem_usd': 0.003,
  // Mercado Pago (fração do valor + taxa fixa em R$) — ajuste pelo SEU plano MP
  'mp_pix_pct': 0.0099, 'mp_pix_fixo': 0,
  'mp_cartao_pct': 0.0499, 'mp_cartao_fixo': 0.40,  // crédito liberação imediata; parcelado 4,98%+0,40 à vista
  'mp_boleto_pct': 0.019, 'mp_boleto_fixo': 3.49,
  // Custo fixo mensal (R$) — VPS Hostinger KVM 2 ~R$ 50 + domínio prorrateado + backups
  'infra_mensal_brl': 60,
  // Câmbio USD → BRL de referência (base para converter o custo de IA)
  'usd_brl': 5.5,
};

export function prepararCustos() {
  db.exec(`CREATE TABLE IF NOT EXISTS custos_cfg (chave TEXT PRIMARY KEY, valor REAL)`);
  const ins = db.prepare('INSERT OR IGNORE INTO custos_cfg (chave, valor) VALUES (?,?)');
  for (const [k, v] of Object.entries(PRECOS_PADRAO)) ins.run(k, v);
}

export function precos() { prepararCustos(); const rows = db.prepare('SELECT chave, valor FROM custos_cfg').all(); return Object.fromEntries(rows.map(r => [r.chave, r.valor])); }
export function definirPreco(chave, valor) { prepararCustos(); db.prepare('INSERT INTO custos_cfg (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor').run(chave, Number(valor)); }

/** Casa o nome do modelo à chave de preço mais próxima (ex.: 'gemini-2.5-flash-002' → 'gemini-2.5-flash'). */
function normalizaModelo(modelo) {
  const m = String(modelo || '').toLowerCase();
  if (m.includes('2.5-flash') && !m.includes('lite')) return 'gemini-2.5-flash';
  if (m.includes('2.5-pro')) return 'gemini-2.5-pro';
  if (m.includes('flash-lite')) return 'gemini-flash-lite';
  if (m.includes('2.0-flash')) return 'gemini-2.0-flash';
  if (m.includes('1.5-flash')) return 'gemini-1.5-flash';
  if (m.includes('1.5-pro')) return 'gemini-1.5-pro';
  return 'gemini-2.5-flash';
}

/** Custo de IA (USD → BRL) nos últimos N dias, podendo filtrar por conta. */
export function custoIA({ contaId = null, dias = 30 } = {}) {
  const p = precos(); const cambio = p['usd_brl'] || 5.5;
  const rows = db.prepare(`SELECT modelo, SUM(tokens_in) ti, SUM(tokens_out) to_ FROM uso WHERE criado_em >= datetime('now','-'||?||' days') ${contaId ? 'AND conta_id=?' : ''} GROUP BY modelo`).all(dias, ...(contaId ? [contaId] : []));
  let totalUsd = 0; const detalhe = rows.map(r => { const m = normalizaModelo(r.modelo); const c = (r.ti || 0) / 1e6 * (p[m + '_in'] || 0) + (r.to_ || 0) / 1e6 * (p[m + '_out'] || 0); totalUsd += c; return { modelo: r.modelo, modelo_norm: m, tokens_in: r.ti || 0, tokens_out: r.to_ || 0, custo_usd: +c.toFixed(4), custo_brl: +(c * cambio).toFixed(2) }; });
  return { total_usd: +totalUsd.toFixed(4), total_brl: +(totalUsd * cambio).toFixed(2), por_modelo: detalhe, cambio };
}

/** Taxa do Mercado Pago sobre as cobranças pagas nos últimos N dias. */
export function custoMP({ dias = 30 } = {}) {
  const p = precos();
  const rows = db.prepare(`SELECT forma, SUM(valor) bruto, COUNT(*) n FROM cobrancas WHERE status='pago' AND pago_em >= datetime('now','-'||?||' days') GROUP BY forma`).all(dias);
  let totalTaxa = 0; let totalBruto = 0;
  const detalhe = rows.map(r => { const forma = /pix/i.test(r.forma) ? 'pix' : /cart|credit/i.test(r.forma) ? 'cartao' : /boleto/i.test(r.forma) ? 'boleto' : 'pix'; const taxa = (r.bruto || 0) * (p['mp_' + forma + '_pct'] || 0) + (r.n || 0) * (p['mp_' + forma + '_fixo'] || 0); totalTaxa += taxa; totalBruto += r.bruto || 0; return { forma: r.forma, bruto: r.bruto, cobrancas: r.n, taxa: +taxa.toFixed(2), liquido: +((r.bruto || 0) - taxa).toFixed(2) }; });
  return { total_bruto: +totalBruto.toFixed(2), total_taxa: +totalTaxa.toFixed(2), total_liquido: +(totalBruto - totalTaxa).toFixed(2), por_forma: detalhe };
}

/** Visão consolidada: receita, custos operacionais, margem. Para admin global ou para o próprio consumo (contaId). */
export function resumo({ contaId = null, dias = 30 } = {}) {
  const p = precos(); const ia = custoIA({ contaId, dias });
  const mp = contaId ? { total_bruto: 0, total_taxa: 0, total_liquido: 0, por_forma: [] } : custoMP({ dias });
  const infraDia = (p['infra_mensal_brl'] || 0) / 30; const infra = +(infraDia * dias).toFixed(2);
  const receita = contaId ? 0 : mp.total_bruto;
  const custoTotal = +((ia.total_brl || 0) + (mp.total_taxa || 0) + (contaId ? 0 : infra)).toFixed(2);
  const margem = +((receita - custoTotal) + (contaId ? 0 : 0)).toFixed(2); // líquido antes de MP já embutido? Vamos considerar: margem = liquido_mp - ia - infra
  const margemReal = contaId ? 0 : +((mp.total_liquido || 0) - (ia.total_brl || 0) - infra).toFixed(2);
  return { dias, ia, mp, infra_brl: contaId ? 0 : infra, receita_brl: receita, custo_total_brl: custoTotal, margem_brl: margemReal, precos: p };
}

/** Matriz pacote × modelo: para cada pacote, qual seria o custo e margem se o cliente usasse só aquele modelo. */
export async function matrizCustos() {
  const p = precos(); const cambio = p['usd_brl'] || 5.5;
  const { PACOTES, TOKENS_POR_CREDITO } = await import('./creditos/index.js');
  const MODELOS = [['Gemini 2.5 Pro','gemini-2.5-pro'],['Gemini 2.5 Flash','gemini-2.5-flash'],['Gemini 2.5 Flash-Lite','gemini-flash-lite'],['Gemini 2.0 Flash','gemini-2.0-flash'],['Gemini 2.0 Flash-Lite','gemini-2.0-flash-lite'],['Gemini 1.5 Flash','gemini-1.5-flash'],['Gemini 1.5 Pro','gemini-1.5-pro']];
  const custo1k = (k) => (TOKENS_POR_CREDITO * 0.7 * (p[k+'_in']||0) + TOKENS_POR_CREDITO * 0.3 * (p[k+'_out']||0)) / 1e6 * cambio;
  const modelos = MODELOS.map(([nome, chave]) => ({ nome, chave, r_por_1k: +custo1k(chave).toFixed(5) }));
  const matriz = PACOTES.map(pac => ({ pacote: pac.nome, tipo: pac.tipo, preco: pac.preco, creditos: pac.creditos, por_modelo: MODELOS.map(([nome, chave]) => { const custo = custo1k(chave) * pac.creditos; const taxa = pac.preco * (p['mp_pix_pct']||0) + (p['mp_pix_fixo']||0); const lucro = pac.preco - custo - taxa; return { modelo: nome, custo_ia: +custo.toFixed(2), lucro: +lucro.toFixed(2), margem_pct: pac.preco > 0 ? +(lucro / pac.preco * 100).toFixed(1) : 0 }; }) }));
  return { modelos, matriz };
}

/** Margem bruta estimada por pacote (preço vigente × créditos × custo médio por crédito × taxa MP). */
export async function margemPacotes() {
  const p = precos(); const cambio = p['usd_brl'] || 5.5;
  const { PACOTES, TOKENS_POR_CREDITO } = await import('./creditos/index.js' /* resolved relative to this file */);
  // Custo médio por crédito: 1000 tokens no Gemini 2.5 Flash, mix 70% in + 30% out
  const custoIAperCred = ((TOKENS_POR_CREDITO * 0.7) * p['gemini-2.5-flash_in'] + (TOKENS_POR_CREDITO * 0.3) * p['gemini-2.5-flash_out']) / 1e6 * cambio;
  return PACOTES.map(pac => {
    const custoIAtotal = pac.creditos * custoIAperCred;
    const taxaPix = pac.preco * p['mp_pix_pct'] + p['mp_pix_fixo'];
    const taxaCartao = pac.preco * p['mp_cartao_pct'] + p['mp_cartao_fixo'];
    const lucroPix = pac.preco - custoIAtotal - taxaPix;
    const lucroCartao = pac.preco - custoIAtotal - taxaCartao;
    return { ...pac, custo_credito: +custoIAperCred.toFixed(4), custo_ia: +custoIAtotal.toFixed(2), taxa_pix: +taxaPix.toFixed(2), taxa_cartao: +taxaCartao.toFixed(2), lucro_pix: +lucroPix.toFixed(2), lucro_cartao: +lucroCartao.toFixed(2), margem_pix_pct: +(lucroPix / pac.preco * 100).toFixed(1), margem_cartao_pct: +(lucroCartao / pac.preco * 100).toFixed(1) };
  });
}
