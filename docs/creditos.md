# KM APP · Créditos (etapa A)

- **Ledger**: tabela `creditos_mov` (conta_id, tipo trial|compra|plano|credito|ajuste|debito, quantidade ±, motivo, modulo, ref). Saldo = soma. Nunca se edita saldo direto.
- **Medida**: 1 crédito = 1.000 tokens de IA (todos os modelos, debitado em `registrarUso`). Tarifas fixas: story/arte 1, carrossel 3, edição de vídeo 5, áudio de vídeo 1, imagem IA (fal) 4 — em `src/creditos/index.js` (`TARIFAS`).
- **Conta admin**: a primeira conta do banco vira `admin=1, plano='ilimitado'` na migração (nunca cobrada nem bloqueada). Contas novas ganham `TRIAL_CREDITOS` (250) no onboarding.
- **Bloqueio**: saldo ≤ 0 → o roteador só aceita comandos livres (`créditos`, `saldo`, `status`, `comprar`, `sim/não`, `web CÓDIGO`); o Gemini recusa chamadas com saldo < −3 (tolerância para terminar a mensagem em curso). Publicações agendadas e lembretes continuam.
- **Alertas** (uma vez por nível, zerados na recarga): 20% e 5% da última recarga, e zero (conta passa a `bloqueada`; volta a `ativa` ao creditar).
- **Comandos no Telegram/Conversa**: `créditos` (saldo/consumo), `comprar` (pacotes).
- **App web**: tela *Créditos* (saldo, barra, pacotes, consumo por assessor/tipo/dia, histórico) e saldo na lateral. API: `GET /api/creditos`; `/api/me` traz `creditos`.
- **Próximas etapas**: B onboarding + isolamento; C Asaas (Pix/cartão, webhook, mensal com renovação); D painel /admin (contas, créditos manuais, pacotes, financeiro); E operação/broadcast/NFS-e.
