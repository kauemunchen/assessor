# Taxonomia de documentos — KM

## Regras operacionais
- Estrutura no Drive: Raiz / Empresa / Tipo / Ano. Empresas do dono: as da conta (ex.: Mais Têxtil, Douglas Confecções, KM, Forzz, Valora, 3D Ultimate) ou "PF" para pessoal. "Geral" só quando não dá para saber.
- Tipos: Contratos | Fiscal | Pessoal | Veículos | Licenças | Imóveis | Financeiro | Jurídico | Seguros | Outros.
  - Contratos: prestação de serviço, facção, locação, parceria, NDA, distrato, aditivo.
  - Fiscal: NF-e/NFS-e, DAS, DARF, guias, certidões negativas (federal, FGTS, trabalhista, estadual, municipal), declarações.
  - Pessoal: RG, CNH, CPF, passaporte, certidões civis, diplomas, exames (sem detalhar conteúdo de saúde).
  - Veículos: CRLV, IPVA, seguro auto, multas, laudos.
  - Licenças: alvará, AVCB/bombeiros, licença ambiental, sanitária, registro em conselho.
  - Imóveis: matrícula, IPTU, contrato de locação, condomínio, laudos.
  - Financeiro: boletos, comprovantes, extratos, recibos (a Tina usa para baixa).
  - Jurídico: procurações, atas, contrato social, alterações, notificações.
  - Seguros: apólices, endossos, sinistros.
- Nome do arquivo: AAAA-MM-DD_Tipo_Titulo.ext (gerado automaticamente). Nunca pedir nome ao dono.
- Vigências: contrato → fim da vigência e início do aviso prévio; certidão/alvará/licença/CNH/apólice → data de validade. Avisos 30/7/1 dia antes e no dia, às 8h, mais evento no marcador Profissional.
- Guarda legal: fiscais e trabalhistas 5 anos; previdenciários 10 anos (orientar, não apagar).
- Cadastro mínimo: cliente (nome, CNPJ/CPF, contato, empresa vinculada); fornecedor (nome, CNPJ, contato, o que fornece); colaborador (nome, CPF, função, empresa, admissão); prestador (nome, CNPJ/CPF, serviço, contato). Marcar incompleto quando faltar documento ou contato.
- Sensível (RG, CPF, CNH, dados bancários): guardar normalmente. Quando o DONO pede o dado ("qual o CPF do meu filho"), entregue completo — é o documento dele. Só mascare em resumos automáticos e em dossiês para terceiros (esses só incluem sensíveis com confirmação).
- Pedido de dado que está num documento: buscar_documento (nome da pessoa/empresa/tipo) → ler_documento com a pergunta → responder o dado e o link. Se não achar no banco, a busca cai no Drive inteiro; aí ler_documento pelo drive_id.
- Dossiê para contador: por empresa e período, tipos Fiscal + Financeiro + Contratos por padrão; vira pasta Dossiês/Empresa/Período com índice.
- Resposta padrão ao arquivar (3 linhas): "Guardei: <título> — <empresa> / <tipo> / <ano>. <link>. <Vigência: dd/mm/aaaa, avisos agendados | sem vigência>."
