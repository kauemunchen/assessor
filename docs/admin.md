# Painel admin do KM APP (/admin)

Acessível em `https://SEU_DOMINIO/admin` para qualquer conta com `contas.admin=1` ou `contas.plano='ilimitado'`. Qualquer outra sessão recebe 403. A autenticação reaproveita o cookie/token do app (`/app`), então o admin faz login normalmente em `/app` e depois abre `/admin`.

## Telas
- **📊 Resumo** — números dos últimos 30 dias: contas (total, ativas, bloqueadas, em trial), faturamento, pendente, MRR das assinaturas, créditos emitidos/consumidos, chamadas e tokens de IA, novas contas por dia, top 10 consumidores.
- **🏢 Contas** — lista completa com busca livre e filtros (ativas, bloqueadas, em trial, mensal, inativas há 14 dias). Clicar abre um diálogo com:
  - Saldo, plano, status, uso por assessor (30d).
  - **+/- créditos manuais** com motivo (vai para o histórico como `tipo=ajuste`, `ref=admin:<seu id>`).
  - Trocar plano (`trial / prepago / ilimitado / mensal_pro / mensal_max`).
  - Trocar status (`ativa / bloqueada / suspensa`).
  - Marcar/desmarcar como admin (não dá para tirar o próprio).
  - Lista de cobranças (com link da fatura) e movimentos de crédito.
- **💳 Financeiro** — todas as cobranças do Asaas (filtra por status), total pago, faturamento por mês.
- **🛒 Pacotes & preços** — tabela `pacotes_cfg` editável em linha: nome, créditos, preço, tipo, ativo, ordem. Edição entra em vigor imediatamente (tela Créditos do app, comando `comprar` no Telegram, assinaturas futuras). Para criar um pacote novo use o formulário abaixo. Tarifas fixas de render/vídeo/fal são mostradas em modo leitura (mudar exige editar `TARIFAS` em `src/creditos/index.js`).
- **📣 Avisos** — broadcast para os donos no Telegram (`📣 KM APP — <texto>`), com filtro de público (ativas, todas, trial, bloqueadas).

## Como virar admin
Na migração, a primeira conta do banco vira admin automática. Para promover outra:
```sql
UPDATE contas SET admin=1 WHERE id=?
```
Ou pelo próprio painel admin, abrindo a conta e marcando a caixa "admin".

## Rotas HTTP
Todas sob `/api/admin/*`, auth gate em `src/canal/api-admin.js`:
- `GET /resumo`, `GET /contas?filtro=&q=`, `GET /conta/:id`
- `POST /conta/:id/creditos` (operacao=credito|debito, quantidade, motivo)
- `POST /conta/:id` (plano, status, admin)
- `GET /pacotes`, `POST /pacotes/:id`, `DELETE /pacotes/:id`
- `GET /financeiro?status=`
- `POST /broadcast` (texto, filtro)
