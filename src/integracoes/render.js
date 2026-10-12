// Cliente do serviço de renderização (render/render_km.py — código fiel ao bot Instagram KM)
import { inflateRawSync } from 'node:zlib';
const BASE = process.env.RENDER_URL || 'http://render:5055';
async function post(path, body, json = true) {
  const r = await fetch(BASE + path, { method: 'POST', headers: json ? { 'content-type': 'application/json' } : {}, body: json ? JSON.stringify(body) : body });
  if (!r.ok) throw new Error(`render ${path}: ${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}
export const paletas = () => fetch(BASE + '/paletas').then(r => r.json());
export const frase = (texto, { paleta = 'km', autoria = '@kauemunchen', template = 'manual', palavra_dourada, etiqueta } = {}) => post('/frase', { frase: texto, paleta, autoria, template, palavra_dourada, etiqueta });
export const letreiro = (gancho) => post('/letreiro', { gancho });
export async function marcaDagua(bytes, { posicao = 'inferior-direito', proporcao = 0.14, assinatura = true } = {}) {
  const r = await fetch(`${BASE}/marca-dagua?posicao=${posicao}&proporcao=${proporcao}&assinatura=${assinatura ? 1 : 0}`, { method: 'POST', body: bytes });
  if (!r.ok) throw new Error(`render /marca-dagua: ${r.status} ${await r.text()}`);
  let info = {}; try { info = JSON.parse(r.headers.get('x-marca-info') || '{}'); } catch {}
  return { bytes: Buffer.from(await r.arrayBuffer()), info };
}
export const comLogo = (bytes) => post('/logo', bytes, false);
export async function carrossel(dados, { paleta = 'km', template = 'manual' } = {}) {
  const zip = await post('/carrossel', { dados, paleta, template });
  return extrairZip(zip);
}
// ZIP "stored"/deflate mínimo sem dependência
function extrairZip(buf) {
  const out = []; let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === 0x04034b50) {
    const metodo = buf.readUInt16LE(p + 8), csize = buf.readUInt32LE(p + 18), nlen = buf.readUInt16LE(p + 26), elen = buf.readUInt16LE(p + 28);
    const nome = buf.toString('utf8', p + 30, p + 30 + nlen); const ini = p + 30 + nlen + elen; const dados = buf.subarray(ini, ini + csize);
    out.push({ nome, bytes: metodo === 8 ? inflateRawSync(dados) : Buffer.from(dados) });
    p = ini + csize;
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome)).map(x => x.bytes);
}
