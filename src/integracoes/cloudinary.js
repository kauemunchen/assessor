// Upload de imagem para URL pública (o Instagram exige URL). Assinatura manual, sem SDK.
import crypto from 'node:crypto';
export function configurado() { return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET); }
export async function upload(bytes, { pasta = 'assessor', nome, tipo = 'image' } = {}) {
  if (!configurado()) throw new Error('Cloudinary não configurado (CLOUDINARY_*).');
  const ts = Math.floor(Date.now() / 1000);
  const params = { folder: pasta, timestamp: ts, ...(nome ? { public_id: nome } : {}) };
  const assinar = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + process.env.CLOUDINARY_API_SECRET;
  const fd = new FormData();
  fd.append('file', new Blob([bytes]), tipo === 'video' ? 'video.mp4' : 'img.jpg');
  for (const [k, v] of Object.entries(params)) fd.append(k, String(v));
  fd.append('api_key', process.env.CLOUDINARY_API_KEY);
  fd.append('signature', crypto.createHash('sha1').update(assinar).digest('hex'));
  const r = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${tipo === 'video' ? 'video' : 'image'}/upload`, { method: 'POST', body: fd }).then(r => r.json());
  if (!r.secure_url) throw new Error(`Cloudinary: ${r.error?.message || JSON.stringify(r)}`);
  return r.secure_url;
}
/** Upload de vídeo; devolve url + metadados (duração, largura/altura, bytes). */
export async function uploadVideo(bytes, { pasta = 'assessor' } = {}) {
  if (!configurado()) throw new Error('Cloudinary não configurado (CLOUDINARY_*).');
  const ts = Math.floor(Date.now() / 1000);
  const params = { folder: pasta, timestamp: ts };
  const assinar = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + process.env.CLOUDINARY_API_SECRET;
  const fd = new FormData(); fd.append('file', new Blob([bytes]), 'video.mp4');
  for (const [k, v] of Object.entries(params)) fd.append(k, String(v));
  fd.append('api_key', process.env.CLOUDINARY_API_KEY); fd.append('signature', crypto.createHash('sha1').update(assinar).digest('hex'));
  const r = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`, { method: 'POST', body: fd }).then(r => r.json());
  if (!r.secure_url) throw new Error(`Cloudinary vídeo: ${r.error?.message || JSON.stringify(r)}`);
  return { url: r.secure_url, duracao: r.duration, largura: r.width, altura: r.height, bytes: r.bytes, formato: r.format };
}
