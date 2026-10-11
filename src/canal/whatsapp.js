// Adaptador WhatsApp Cloud API (Meta). Implementar na Fase 2. Mesma interface do Telegram.
export class WhatsAppCanal {
  constructor(app) { this.app = app; }
  aoReceber(_fn) { throw new Error('WhatsAppCanal: implementar na Fase 2'); }
  async enviar() { throw new Error('WhatsAppCanal: implementar na Fase 2'); }
  async baixarMidia() { throw new Error('WhatsAppCanal: implementar na Fase 2'); }
}
