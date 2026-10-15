# KM APP · Operação (etapa E)

## Painel admin
- **📈 Métricas** — conversão trial→pagante nos últimos 30 dias (contas criadas × as que já pagaram alguma cobrança), churn mensal (assinaturas canceladas ÷ ativas), contas que interagiram nos últimos 14 dias, cohort por mês (criadas × pagantes), receita mensal.
- **🧰 Operação**:
  - *Exportar CSV* — `contas`, `cobrancas`, `creditos`, `uso`. Baixa com BOM UTF-8 e separador `;` (abre direto no Excel pt-BR).
  - *Backups* — lista os `.tar.gz` em `backups/`, roda `scripts/backup.sh` sob demanda, baixa qualquer um pela interface, apaga.
  - *Limpeza de contas inativas* — digite N dias, "atualizar lista" mostra as candidatas (admin e ilimitadas ficam fora; conta sem interação OU criada há mais de N dias conta como inativa). Marque as caixas → "suspender selecionadas" muda `status='suspensa'` (não apaga nada).
  - *Log de ações do admin* — tudo que foi feito no painel admin (ajustes de crédito, mudança de plano/status, exportações, backup, limpeza, apagar pacote) fica em `logs_admin` (quem, o quê, alvo, detalhes JSON, quando). Mostra as 200 últimas.

## Automação
- Toda segunda às 09:00 (America/Sao_Paulo), o scheduler avisa cada admin no Telegram se há contas sem interação há 60+ dias, com um link para a tela Operação.
- Backups automáticos (`scripts/backup.sh`, cron 04:00) continuam como estavam; o painel agora dá visibilidade e botões para gerar/baixar/apagar manualmente.

## Rotas HTTP
Todas sob `/api/admin/*`, com guard de admin:
- `GET /logs`
- `GET /exportar/:tipo.csv` (tipo ∈ contas|cobrancas|creditos|uso)
- `GET /backups`, `POST /backup`, `GET /backup/:nome`, `DELETE /backup/:nome`
- `GET /limpeza?dias=`, `POST /limpeza/marcar` (body: `{ids: [...]}`)
- `GET /metricas`

Toda ação sensível (crédito manual, mudança de plano/status, apagar pacote, exportar CSV, rodar/baixar/apagar backup, suspender em lote) grava uma linha em `logs_admin`.
