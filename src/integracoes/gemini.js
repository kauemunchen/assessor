// Gemini: transcrição de áudio, geração de texto/JSON, classificação. Portado de crm_bot/gemini_service.py
import { GoogleGenerativeAI } from '@google/generative-ai';
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODELO = process.env.MODELO_PADRAO || 'gemini-3.8-flash';
const transitorio = (e) => /503|429|high demand|overloaded|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(String(e?.message || e));
async function comRetry(fn, tentativas = 4) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try { return await fn(); }
    catch (e) { ultimo = e; if (!transitorio(e)) throw e; await new Promise(r => setTimeout(r, 1500 * 2 ** i)); }
  }
  throw new Error('IA indisponível no momento (pico de demanda no Google). Tente de novo em 1 minuto.');
}
export const modelo = (opts = {}) => {
  const m = genai.getGenerativeModel({ model: MODELO, ...opts });
  const gc = m.generateContent.bind(m);
  m.generateContent = (...a) => comRetry(() => gc(...a));
  return m;
};

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
