// Gemini: transcrição de áudio, geração de texto/JSON, classificação. Portado de crm_bot/gemini_service.py
import { GoogleGenerativeAI } from '@google/generative-ai';
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODELO = process.env.MODELO_PADRAO || 'gemini-3.8-flash';
const transitorio = (e) => /503|429|high demand|overloaded|RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(String(e?.message || e));
async function comRetry(fn, tentativas = 2) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try { return await fn(); }
    catch (e) { ultimo = e; if (!transitorio(e)) throw e; if (i < tentativas - 1) await new Promise(r => setTimeout(r, 600)); }
  }
  const msg = String(ultimo?.message || '');
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) throw new Error('Cota da API Gemini esgotada (429). Verifique limites/faturamento do projeto no Google AI Studio.');
  throw new Error('IA indisponível no momento (pico de demanda no Google). Tente de novo em 1 minuto.');
}
// Cadeia de modelos: MODELOS="a,b,c" ou MODELO_PADRAO + MODELO_FALLBACK + reservas conhecidas
const CADEIA = [...new Set([
  ...(process.env.MODELOS ? process.env.MODELOS.split(',') : [MODELO, process.env.MODELO_FALLBACK]),
  'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.1-flash-lite',
].map(m => (m || '').trim()).filter(Boolean))];
const RAPIDO = process.env.MODELO_RAPIDO || 'gemini-3.1-flash-lite';
export const modelo = (opts = {}, { rapido = false } = {}) => {
  const cadeia = rapido ? [RAPIDO, ...CADEIA.filter(x => x !== RAPIDO)] : CADEIA;
  const m = genai.getGenerativeModel({ model: cadeia[0], ...opts });
  m.generateContent = async (...a) => {
    let ultimo;
    for (const nome of cadeia) {
      const inst = genai.getGenerativeModel({ model: nome, ...opts });
      try { return await comRetry(() => inst.generateContent(...a), nome === cadeia[0] ? 2 : 1); }
      catch (e) { ultimo = e; if (!transitorio(e) && !/indisponível/i.test(String(e?.message))) throw e; console.warn(`[gemini] ${nome} falhou: ${String(e?.message).slice(0, 160)}`); }
    }
    throw ultimo;
  };
  return m;
};

export async function transcrever(bytes, mime = 'audio/ogg') {
  const r = await modelo({}, { rapido: true }).generateContent([
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
