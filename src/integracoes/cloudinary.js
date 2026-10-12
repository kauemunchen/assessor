// Upload de imagem para URL pública (o Instagram exige URL). Assinatura manual, sem SDK.
import crypto from 'node:crypto';
export function configurado() { return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET); }
export async function upload(bytes, { pasta = 'assessor', nome } = {}) {
  if (!configurado()) throw new Error('Cloudinary não configurado (CLOUDINARY_*).');
  const ts = Math.floor(Date.now() / 1000);
  const params = { folder: pasta, timestamp: ts, ...(nome ? { public_id: nome } : {}) };
  const assinar = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + process.env.CLOUDINARY_API_SECRET;
  const fd = new FormData();
  fd.append('file', new Blob([bytes]), 'img.jpg');
  for (const [k, v] of Object.entries(params)) fd.append(k, String(v));
  fd.append('api_key', process.env.CLOUDINARY_API_KEY);
  fd.append('signature', crypto.createHash('sha1').update(assinar).digest('hex'));
  const r = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: fd }).then(r => r.json());
  if (!r.secure_url) throw new Error(`Cloudinary: ${r.error?.message || JSON.stringify(r)}`);
  return r.secure_url;
}
