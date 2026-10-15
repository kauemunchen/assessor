# KM APP · Cadastro público e login

## Formas de entrar
- **E-mail + senha** (padrão) — `/app` abre com formulário de login. "Criar conta" cadastra na hora, com 250 créditos de boas-vindas; "Pelo Telegram" segue funcionando como antes.
- **Telegram** — dono que já tem conta via bot pode entrar sem senha mandando `web 123456`.

## Rotas
- `POST /api/cadastro` — body: `{nome, empresa?, email, senha (mín. 8), cpf_cnpj?}`. Cria `contas`+`usuarios(papel='dono', canal='web')`, concede trial 250, retorna token + seta cookie.
- `POST /api/login/senha` — body: `{email, senha}`. Verifica scrypt+salt; cria sessão.
- `POST /api/senha` (autenticado) — body: `{atual, nova}`. Troca a senha do dono.
- `POST /api/logout` — invalida a sessão.

## Admin
A **primeira conta** criada pelo cadastro vira automaticamente admin ilimitado (`admin=1, plano='ilimitado'`). Para promover outra conta: pelo painel admin → Contas → abrir → marcar "admin"; ou SQL direto. Quem é admin vê na lateral o botão **🛡 Painel admin** que abre `/admin` em nova aba.

## Segurança
- Senhas armazenadas com scrypt+salt (`crypto.scryptSync`, formato `s1$<salt>$<derivada>`). Sem bcrypt para não adicionar dependência.
- E-mails são únicos (índice parcial em `usuarios.email`).
- Cookie `akm` com `HttpOnly`, `SameSite=Lax`, `Secure` quando o site é HTTPS.
- Qualquer conta criada pode usar e-mail+senha e, se linkar com Telegram depois, as duas formas funcionam.
