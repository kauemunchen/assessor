import { montarPrompt } from './montador-prompt.js';
import { transcrever, classificar, responder } from './ia.js';
import { obterConta, modulosAtivos } from '../db/contas.js';
import * as memoria from './memoria.js';

const MODULOS = ['diretor', 'secretaria', 'producao', 'documentos', 'financeiro', 'social'];

export async function tratarMensagem(msg) {
  const conta = await obterConta(msg.chatId);
  if (!conta) return 'Olá! Sou o Diretor do seu escritório. Para começar, me diga seu nome e o nome da sua empresa.';

  if (msg.tipo === 'audio') msg.texto = await transcrever(msg.midia);
  const ativos = modulosAtivos(conta.id);
  const modulo = await classificar(msg.texto, ativos);          // sempre devolve um de MODULOS ativos ou 'diretor'
  const prompt = montarPrompt({ modulo, conta, ativos });
  const resposta = await responder({ prompt, conta, modulo, msg });
  await memoria.registrarInteracao(conta.id, modulo, msg, resposta);
  return resposta;
}
