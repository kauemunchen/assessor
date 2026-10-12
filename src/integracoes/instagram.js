// Instagram Graph API + fal.ai. Portado de telegram-instagram-bot/bot.py (publicar_ig, gerar_imagem_fal).
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function publicar({ igUserId, token, legenda, url, tipo = 'imagem' }) {
  const params = new URLSearchParams({ access_token: token });
  if (tipo === 'story') { params.set('media_type', 'STORIES'); params.set('image_url', url); }
  else if (tipo === 'reels') { params.set('media_type', 'REELS'); params.set('video_url', url); params.set('caption', legenda); }
  else { params.set('image_url', url); params.set('caption', legenda); }
  const c = await fetch(`https://graph.instagram.com/${igUserId}/media`, { method: 'POST', body: params }).then(r => r.json());
  if (!c.id) throw new Error(`Instagram: ${JSON.stringify(c)}`);
  await sleep(5000);
  const p = await fetch(`https://graph.instagram.com/${igUserId}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: c.id, access_token: token }) }).then(r => r.json());
  if (!p.id) throw new Error(`Instagram publish: ${JSON.stringify(p)}`);
  return p.id;
}

export async function metricas({ igUserId, token, desde }) {
  const u = `https://graph.instagram.com/${igUserId}/insights?metric=reach,accounts_engaged,profile_views,follower_count&period=day&since=${desde}&access_token=${token}`;
  return fetch(u).then(r => r.json());
}

const TAMANHOS = { '1:1': 'square_hd', '3:4': 'portrait_4_3', '9:16': 'portrait_16_9', '16:9': 'landscape_16_9', '4:3': 'landscape_4_3', '4:5': 'portrait_4_3' };
export async function gerarImagemFal(prompt, ratio = '3:4', modelo = 'fal-ai/flux/schnell') {
  const h = { 'Content-Type': 'application/json', Authorization: `Key ${process.env.FAL_API_KEY}` };
  let r = await fetch(`https://queue.fal.run/${modelo}`, { method: 'POST', headers: h, body: JSON.stringify({ prompt, image_size: TAMANHOS[ratio] || 'portrait_4_3', num_images: 1, enable_safety_checker: true, output_format: 'jpeg' }) }).then(r => r.json());
  if (r.images) return r.images[0].url;
  for (let i = 0; i < 30 && r.request_id; i++) {
    await sleep(2000);
    const s = await fetch(`https://queue.fal.run/${modelo}/requests/${r.request_id}`, { headers: h }).then(r => r.json());
    if (s.status === 'COMPLETED') return s.output.images[0].url;
    if (['FAILED', 'CANCELLED'].includes(s.status)) throw new Error(`fal: ${s.error || s.status}`);
  }
  throw new Error('fal: timeout');
}
