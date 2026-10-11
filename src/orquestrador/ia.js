// Camada de IA: transcrição, classificação de intenção, resposta com ferramentas. Gemini por padrão.
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ferramentasDe } from '../ferramentas/index.js';
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelo = () => genai.getGenerativeModel({ model: process.env.MODELO_PADRAO || 'gemini-2.5-flash' });

export async function transcrever(_midia) { /* TODO: reaproveitar do bot de agenda */ return ''; }

export async function classificar(texto, ativos) {
  const r = await modelo().generateContent(`Classifique a mensagem em UM destes módulos: ${ativos.join(', ')}. Responda só o nome.\nMensagem: ${texto}`);
  const m = r.response.text().trim().toLowerCase();
  return ativos.includes(m) ? m : 'diretor';
}

export async function responder({ prompt, conta, modulo, msg }) {
  const tools = ferramentasDe(modulo, conta);          // funções + validações (regras duras)
  // TODO: loop de function-calling com confirmação para ações externas
  const r = await modelo().generateContent({ systemInstruction: prompt, contents: [{ role: 'user', parts: [{ text: msg.texto }] }] });
  return r.response.text();
}
