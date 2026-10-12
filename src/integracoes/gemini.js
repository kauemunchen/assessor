// Gemini: transcrição de áudio, geração de texto/JSON, classificação. Portado de crm_bot/gemini_service.py
import { GoogleGenerativeAI } from '@google/generative-ai';
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODELO = process.env.MODELO_PADRAO || 'gemini-3.8-flash';
export const modelo = (opts = {}) => genai.getGenerativeModel({ model: MODELO, ...opts });

export async function transcrever(bytes, mime = 'audio/ogg') {
  const r = await modelo().generateContent([
    { inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType: mime } },
    'Transcreva o áudio em português brasileiro. Retorne apenas a transcrição.',
  ]);
  return r.response.text().trim();
}

export async function gerarJSON(prompt) {
  const r = await modelo({ generationConfig: { responseMimeType: 'application/json' } }).generateContent(prompt);
  try { return JSON.parse(r.response.text()); } catch { return {}; }
}

export async function lerImagem(bytes, mime, instrucao) {
  const r = await modelo().generateContent([{ inlineData: { data: Buffer.from(bytes).toString('base64'), mimeType: mime } }, instrucao]);
  return r.response.text().trim();
}
