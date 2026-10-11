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
    const body = typeof resposta === 'string' ? { chat_id: chatId, text: resposta } : { chat_id: chatId, text: resposta.texto, reply_markup: resposta.botoes };
    await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
  async baixarMidia(ref) {
    const r = await fetch(`https://api.telegram.org/bot${this.token}/getFile?file_id=${ref}`).then(r => r.json());
    return fetch(`https://api.telegram.org/file/bot${this.token}/${r.result.file_path}`).then(r => r.arrayBuffer());
  }
}
