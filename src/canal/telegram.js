// Adaptador Telegram Bot API (webhook). Reaproveitar lógica do bot de agenda existente.
export class TelegramCanal {
  constructor(app) { this.app = app; this.token = process.env.TELEGRAM_BOT_TOKEN; }
  aoReceber(fn) {
    this.app.post('/webhook/telegram', async (req, res) => {
      res.sendStatus(200);
      const m = req.body.message; if (!m) return;
      console.log(`[telegram] ${m.chat.id} ${m.voice ? 'voice' : m.audio ? 'audio' : m.photo ? 'photo' : m.document ? 'doc' : 'text'}`);
      await fn({
        conta: null, chatId: String(m.chat.id), remetente: String(m.from.id),
        tipo: (m.voice || m.audio) ? 'audio' : m.photo ? 'imagem' : m.document ? 'arquivo' : 'texto',
        texto: m.text || m.caption || '',
        midia: m.voice ? { ref: m.voice.file_id, mime: 'audio/ogg' }
             : m.audio ? { ref: m.audio.file_id, mime: m.audio.mime_type || 'audio/mpeg' }
             : m.photo ? { ref: m.photo.at(-1).file_id, mime: 'image/jpeg' }
             : m.document ? { ref: m.document.file_id, mime: m.document.mime_type } : null,
        recebidoEm: new Date(m.date * 1000),
      });
    });
  }
  async enviar(_conta, chatId, resposta) {
    if (resposta && typeof resposta === 'object' && resposta.fotos) {
      const media = resposta.fotos.slice(0, 10).map((u, i) => ({ type: 'photo', media: u, caption: i === 0 ? semMarkdown(resposta.texto || '').slice(0, 1000) : undefined }));
      const r = await fetch(`https://api.telegram.org/bot${this.token}/sendMediaGroup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, media }) }).then(r => r.json());
      if (!r.ok) console.error('[telegram] sendMediaGroup falhou:', r.description);
      return;
    }
    if (resposta && typeof resposta === 'object' && resposta.foto) {
      const r = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, photo: resposta.foto, caption: semMarkdown(resposta.texto || '').slice(0, 1000) }) }).then(r => r.json());
      if (!r.ok) console.error('[telegram] sendPhoto falhou:', r.description);
      return;
    }
    const texto = typeof resposta === 'string' ? resposta : resposta.texto;
    const base = { chat_id: chatId, reply_markup: resposta?.botoes };
    const html = paraHTML(texto);
    let r = await this._post({ ...base, text: html, parse_mode: 'HTML' });
    if (!r.ok) r = await this._post({ ...base, text: semMarkdown(texto) });
    if (!r.ok) console.error('[telegram] sendMessage falhou:', r.description);
  }
  async _post(body) {
    return fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  }
  async baixarMidia(ref) {
    const r = await fetch(`https://api.telegram.org/bot${this.token}/getFile?file_id=${ref}`).then(r => r.json());
    return fetch(`https://api.telegram.org/file/bot${this.token}/${r.result.file_path}`).then(r => r.arrayBuffer());
  }
}

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function paraHTML(t) {
  let s = esc(t);
  s = s.replace(/^\s*#{1,6}\s+(.+)$/gm, '<b>$1</b>');        // títulos (# seguido de espaço) -> negrito; #hashtag fica
  s = s.replace(/^\s*[-*_]{3,}\s*$/gm, '');                   // separadores fora
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');              // **x** -> <b>
  s = s.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<b>$2</b>'); // *x* -> <b>
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/^\s*[*•]\s+/gm, '- ');                       // bullets uniformes
  return s.replace(/\n{3,}/g, '\n\n').trim();
}
function semMarkdown(t) {
  return t.replace(/^\s*#{1,6}\s+/gm, '').replace(/^\s*[-*_]{3,}\s*$/gm, '').replace(/\*\*|__|`/g, '').replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2').replace(/^\s*[*•]\s+/gm, '- ').replace(/\n{3,}/g, '\n\n').trim();
}
