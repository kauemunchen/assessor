import fs from 'node:fs';
import path from 'node:path';
import { configPersona } from '../db/contas.js';
import { lerMemoria } from './memoria.js';

const base = (n) => fs.readFileSync(path.resolve(`src/personas/${n}.md`), 'utf8');
const conhecimento = (n) => { const p = path.resolve(`src/conhecimento/${n}.md`); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };
const MAPA_CONHECIMENTO = { diretor: 'metodo-km', secretaria: 'secretariado', producao: 'agilfac-regras', documentos: 'taxonomia-docs', financeiro: 'plano-de-contas', social: 'estrategia-conteudo' };

/** Prompt final = base da persona + ajustes do dono + conhecimento + memória. Ferramentas e regras duras entram por código. */
export function montarPrompt({ modulo, conta, ativos }) {
  const cfg = configPersona(conta.id, modulo);
  const vars = {
    nome: cfg.nome, dono: conta.nome_dono, tratamento: cfg.tratamento, tom: cfg.tom, tamanho: cfg.tamanho,
    autonomia: cfg.autonomia, perfil_analise: cfg.perfil_analise, foco_mes: conta.foco_mes || 'nenhum',
    modulos_ativos: ativos.join(', '), carteiras: conta.carteiras || 'a definir',
    hora_resumo: cfg.hora_resumo, hora_fechamento: cfg.hora_fechamento, hora_semana: cfg.hora_semana,
    hora_retornos: cfg.hora_retornos, hora_checagem: cfg.hora_checagem, hora_checagem_1: '12h', hora_checagem_2: '17h',
    janela_silencio: conta.janela_silencio || '22h–6h e domingo', padrao_tarde: cfg.padrao_tarde || '14h',
    memoria: lerMemoria(conta.id, modulo).map(m => `- ${m}`).join('\n') || '- (nada ainda)',
  };
  let texto = base(modulo).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  let ref = conhecimento(MAPA_CONHECIMENTO[modulo]);
  if (ref) {
    // se o arquivo tiver um bloco "## Regras operacionais", usa só dali para baixo (resumo executável); senão corta em 7000 chars
    const i = ref.indexOf('## Regras operacionais'); if (i > 0) ref = ref.slice(i);
    if (ref.length > 7000) ref = ref.slice(0, 7000) + '\n[…]';
    texto += `\n\nREFERÊNCIA DE EXPERTISE\n${ref}`;
  }
  return texto;
}
