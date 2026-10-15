# KM APP · Gateway de pagamento

Hoje suportamos dois provedores com a mesma interface pública:
- **Mercado Pago** (padrão, recomendado — API sem geo-block)
- **Asaas** (alternativa — bloqueada por CloudFront fora do Brasil)

A escolha é feita por `PAGAMENTO_PROVEDOR=mercadopago|asaas`. O código do bot e do painel não muda — só a chamada ao gateway. Trocar entre provedores só exige mudar o env e reiniciar: cobranças antigas continuam vinculadas ao provedor que as criou (coluna `cobrancas.provedor`).

## Mercado Pago
- Pix: cria `/v1/payments` com `payment_method_id=pix`; retorna QR + copia e cola.
- Cartão: cria `/checkout/preferences`; retorna `init_point` (checkout hospedado do MP).
- Boleto: cria `/v1/payments` com `payment_method_id=bolbradesco`.
- Assinatura mensal: cria `/preapproval` + `auto_recurring`; retorna `init_point` para o cliente autorizar o cartão recorrente.
- Webhook: `POST /webhooks/mercadopago`. Se `MERCADOPAGO_WEBHOOK_SECRET` estiver definido, valida HMAC SHA256 (headers `x-signature` + `x-request-id`).
- Polling: `conferirPendentes()` roda a cada 5 min e no abrir da cobrança.

Configurar no MP:
1. `mercadopago.com.br/developers/panel/app` → sua aplicação → **Credenciais** → **Credenciais de produção** → copia Access Token para `MERCADOPAGO_ACCESS_TOKEN`.
2. Mesma tela, aba **Webhooks** → cadastre URL `https://assessor.kauemunchen.com.br/webhooks/mercadopago`, eventos: `payment`, `subscription_preapproval`. Pegue o segredo e coloque em `MERCADOPAGO_WEBHOOK_SECRET`.

## Asaas
Mantido como alternativa. Precisa de VPS em IP brasileiro (CloudFront geo-block). `ASAAS_API_KEY`, `ASAAS_AMBIENTE`, `ASAAS_WEBHOOK_TOKEN`.
