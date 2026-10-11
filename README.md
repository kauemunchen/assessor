# Assessor KM

Escritório de assessores de IA em mensageria (Telegram no piloto, WhatsApp na v2) para donos de PMEs. Um Diretor fixo roteia para até cinco módulos que o dono liga ou desliga: Secretária, Produção (AgilFac), Documentos, Financeiro PJ+PF e Social Media.

Plano completo, fases e personas: ver `docs/` e o doc "Projeto Assessor KM".

## Estrutura
```
src/
  canal/          adaptadores Telegram / WhatsApp (mesma interface)
  orquestrador/   roteador, montador de prompt, IA, memória
  personas/       prompt-base de cada assessor (editável sem deploy)
  conhecimento/   expertise de cada módulo em texto (método KM, regras AgilFac, plano de contas…)
  ferramentas/    funções que cada módulo pode chamar + regras duras validadas em código
  rotinas/        scheduler (resumo 7h, fechamento 20h, alertas)
  db/             SQLite, schema e acesso
  painel/         (v2)
```

## Como o prompt é montado
`personas/{modulo}.md` + ajustes do dono (`persona_config`) + `conhecimento/{modulo}.md` + memória da conta + conversa. Ferramentas e regras duras entram por código, não por texto.

## Rodar local
```bash
cp .env.example .env   # preencher TELEGRAM_BOT_TOKEN e GEMINI_API_KEY
npm install
npm run migrate
npm run dev
```
Webhook do Telegram: `https://SEU_HOST/webhook/telegram`.

## Deploy (VPS, Docker + Traefik)
```bash
docker compose up -d --build
```

## Status
- [x] Estrutura, personas, esqueleto do orquestrador
- [ ] Transcrição de áudio (reaproveitar bot de agenda)
- [ ] Function-calling com confirmação
- [ ] Ferramentas da Secretária (Google Calendar/Meet)
- [ ] Onboarding por conversa
- [ ] Rotinas (scheduler)
- [ ] Conhecimento: metodo-km, agilfac-regras, plano-de-contas
