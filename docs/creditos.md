# KM APP · Créditos (etapa A)

- **Ledger**: tabela `creditos_mov` (conta_id, tipo trial|compra|plano|credito|ajuste|debito, quantidade ±, motivo, modulo, ref). Saldo = soma. Nunca se edita saldo direto.
- **Medida**: 1 crédito = 1.000 tokens de IA (todos os modelos, debitado em `registrarUso`). Tarifas fixas: story/arte 1, carrossel 3, edição de vídeo 5, áudio de vídeo 1, imagem IA (fal) 4 — em `src/creditos/index.js` (`TARIFAS`).
- **Conta admin**: a primeira conta do banco vira `admin=1, plano='ilimitado'` na migração (nunca cobrada nem bloqueada). Contas novas ganham `TRIAL_CREDITOS` (250) no onboarding.
- **Bloqueio**: saldo ≤ 0 → o roteador só aceita comandos livres (`créditos`, `saldo`, `status`, `comprar`, `sim/não`, `web CÓDIGO`); o Gemini recusa chamadas com saldo < −3 (tolerância para terminar a mensagem em curso). Publicações agendadas e lembretes continuam.
- **Alertas** (uma vez por nível, zerados na recarga): 20% e 5% da última recarga, e zero (conta passa a `bloqueada`; volta a `ativa` ao creditar).
- **Comandos no Telegram/Conversa**: `créditos` (saldo/consumo), `comprar` (pacotes).
- **App web**: tela *Créditos* (saldo, barra, pacotes, consumo por assessor/tipo/dia, histórico) e saldo na lateral. API: `GET /api/creditos`; `/api/me` traz `creditos`.
- **Próximas etapas**: B onboarding + isolamento; C Asaas (Pix/cartão, webhook, mensal com renovação); D painel /admin (contas, créditos manuais, pacotes, financeiro); E operação/broadcast/NFS-e.

## Etapa C — Asaas (Pix, cartão, boleto, plano mensal)
- `src/integracoes/asaas.js`: cliente por conta (`contas.asaas_cliente_id`, CPF/CNPJ e e-mail pedidos na 1ª compra), cobranças (`cobrancas`) e assinaturas (`assinaturas`).
- Pré-pago: `POST /payments` (PIX → QR + copia e cola; cartão/boleto → fatura do Asaas). Mensal: `POST /subscriptions` (ciclo MONTHLY) — cada cobrança paga soma os créditos do pacote e marca `contas.plano`.
- Confirmação: webhook `POST /webhooks/asaas` (eventos PAYMENT_RECEIVED/CONFIRMED creditam; REFUNDED/CHARGEBACK estornam; OVERDUE/DELETED marcam). Idempotente por `asaas_id`. Reforço: polling das pendentes a cada 5 min e ao abrir a cobrança no app.
- Comandos: `comprar` (lista), `comprar pro` (Pix, manda o QR), `comprar pro cartão`, `comprar start pix 000.000.000-00 email@x` (1ª vez, para cadastrar o pagador).
- App: tela Créditos → escolher pacote → forma + CPF/CNPJ → QR Pix / fatura; atualiza sozinha ao confirmar; cancelar plano mensal.
- **Configurar no Asaas** (sandbox e depois produção): Integrações → chave de API → `ASAAS_API_KEY`; Webhooks → URL `https://SEU_DOMINIO/webhooks/asaas`, versão v3, token de autenticação = `ASAAS_WEBHOOK_TOKEN`, eventos de cobrança (PAYMENT_*), fila síncrona ligada.
