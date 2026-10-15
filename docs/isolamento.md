# Isolamento entre contas (KM APP)

Cada conta é um registro em `contas`; tudo que uma conta cria (posts, biblioteca, documentos, cadastros, memória, pendências, créditos, cobranças, assinaturas, planilhas, convites) carrega `conta_id` referenciando-a. As rotas `/api/*` autenticam por cookie/token (`web_sessoes`), extraem `req.contaId = sessao.conta_id` e TODA query usa esse id no WHERE. Operações de cron (lembretes vencendo, limpeza de biblioteca, publicação de posts agendados, aviso de Instagram token) são as únicas que varrem todas as contas — e cada ação dispara `canal.enviar()` para o dono daquela conta, nunca para outro.

## Teste automatizado
`node scripts/testar-isolamento.js` cria um banco temporário, monta duas contas (Alice/Alpha e Bob/Beta), popula dados em todas as tabelas sensíveis e verifica em 23 pontos:
- `/api/me`, `/api/editorial`, `/api/biblioteca`, `/api/documentos`, `/api/cadastros`, `/api/creditos` só devolvem dados da conta do token.
- Tentativa de A alterar/apagar recurso de B → 404.
- Débito de créditos em A não altera saldo de B.
- Sem token ou com token inválido → 401.

Rode esse teste antes de qualquer deploy que mexa em rotas, queries ou autenticação.

## Operações de admin
A primeira conta cadastrada vira `admin=1, plano='ilimitado'` (ver `src/creditos/index.js`). Admin não é cobrada nem bloqueada; para transformar outra conta em admin: `UPDATE contas SET admin=1, plano='ilimitado' WHERE id=?`. Nenhuma rota do app expõe isso — é intencional. O painel /admin da etapa D vai dar essa visibilidade com login separado.
