# App web — Assessor KM

URL: https://assessor.kauemunchen.com.br/app  (instalável como app no celular: "Adicionar à tela inicial")

## Login
1. Abra o app → aparece um código (ex.: `web 123456`).
2. Mande esse texto ao @AssessorKM_bot (botão "Abrir o Telegram" já preenche).
3. O app entra sozinho. Sessão dura 180 dias (cookie). "sair" encerra.

## Conversa
- Mesmo cérebro do Telegram: tudo que você manda num lado aparece no outro em tempo real; respostas vão para os dois.
- Mensagens da web aparecem no Telegram com 💻. Botões de confirmação funcionam nos dois lados.
- Arraste/cole foto, vídeo, PDF; 🎙 grava áudio no navegador (transcrito como no Telegram).
- Filtro por assessor no topo; atalhos na lateral.

## Telas
- **Equipe**: dono/empresa, módulos (liga/desliga), persona de cada assessor (nome, tom, tamanho, autonomia, horários), pessoas no Telegram e convites.
- **Conexões**: Google (escopos, autorizar), Instagram (token validado ao vivo), pasta do Drive, empresas, planilhas, serviços.
- **Identidade & Marca**: padrão visual, logos, prévia de story ao vivo, identidade editável da MIA, regras operacionais do manual.
- **Calendário editorial**: grade mensal (arrastar para reagendar, clique para editar/publicar/apagar), rascunhos, biblioteca de mídias (criar post, guardar, apagar).
- **Documentos**: arquivo (busca/filtros/editar → move no Drive), vencimentos (registrar/renovar/encerrar), cadastros.
- **Ajustes**: preferências por conta, uso e custo de IA, dados, backup sob demanda, log.

## Técnica
- `src/canal/hub.js` (Telegram + Web) · `src/canal/web.js` (API, WebSocket, login) · `api-config.js` (equipe/conexões) · `api-marca.js` (marca/ajustes/uso) · `api-dados.js` (editorial/biblioteca/documentos) · `src/painel/` (HTML/CSS/JS sem build, montado como volume).
- Tabelas: `mensagens` (histórico unificado), `web_sessoes`, `web_codigos`. Uploads em `data/uploads`.
- Variável: `TELEGRAM_BOT_USERNAME` (padrão AssessorKM_bot).
