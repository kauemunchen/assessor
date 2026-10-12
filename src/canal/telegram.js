// Adaptador Telegram Bot API (webhook). Reaproveitar lógica do bot de agenda existente.
export class TelegramCanal {
  constructor(app) { this.app = app; this.token = process.env.TELEGRAM_BOT_TOKEN; }
  aoReceber(fn) {
    this.app.post('/webhook/telegram', async (req, res) => {
      res.sendStatus(200);
      const m = req.body.message; if (!m) return;
      await fn({
        conta: null, chatId: String(m.chat.id), remetente: String(m.from.id),
        tipo: m.voice ? 'audio' : m.photo ? 'imagem' : m.document ? 'arquivo' : 'texto',
        texto: m.text || m.caption || '',
        midia: m.voice ? { ref: m.voice.file_id, mime: 'audio/ogg' }
             : m.photo ? { ref: m.photo.at(-1).file_id, mime: 'image/jpeg' }
             : m.document ? { ref: m.document.file_id, mime: m.document.mime_type } : null,
        recebidoEm: new Date(m.date * 1000),
      });
    });
  }
  async enviar(_conta, chatId, resposta) {
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
  s = s.replace(/^\s*#{1,6}\s*(.+)$/gm, '<b>$1</b>');        // títulos -> negrito
  s = s.replace(/^\s*[-*_]{3,}\s*$/gm, '');                   // separadores fora
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');              // **x** -> <b>
  s = s.replace(/(^|[^*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1<b>$2</b>'); // *x* -> <b>
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/^\s*[*•]\s+/gm, '- ');                       // bullets uniformes
  return s.replace(/\n{3,}/g, '\n\n').trim();
}
function semMarkdown(t) {
  return t.replace(/^\s*#{1,6}\s*/gm, '').replace(/^\s*[-*_]{3,}\s*$/gm, '').replace(/\*\*|__|`/g, '').replace(/^\s*[*•]\s+/gm, '- ').replace(/\n{3,}/g, '\n\n').trim();
}
