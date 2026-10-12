# Migração do crm_bot (/opt/crm_bot) e do telegram-instagram-bot para o Assessor KM

## O que foi portado
| Origem (Python) | Destino (Node) |
| --- | --- |
| gemini_service.transcrever_audio | integracoes/gemini.js → transcrever |
| google_calendar.py | integracoes/google-calendar.js (token por conta na tabela google_auth) |
| scheduler.py (lembretes 1/min, resumos) | rotinas/scheduler.js (horário por conta em persona_config) |
| handlers/audio, agenda, lembretes | ferramentas/secretaria.js via function-calling |
| instagram bot: publicar_ig, gerar_imagem_fal | integracoes/instagram.js + ferramentas/social.js |
| instagram bot: get_prompt (identidade da marca) | personas/social.md + conhecimento/estrategia-conteudo.md |

## Dados a migrar do crm.db (/opt/crm_bot/crm.db) — script a escrever
- projetos → carteiras/empresas da conta do Kauê
- compromissos → já estão no Google Agenda; não migrar
- lembretes ativos → lembretes
- notas → notas
- contatos → contatos
- google_token.json → google_auth (conta_id do Kauê)

## Ordem no VPS
1. Subir assessor em paralelo (subdomínio novo), testar com o Kauê.
2. Migrar dados e token Google.
3. Desligar crm_bot (pm2/systemd) e apontar agenda.kauemunchen.com.br para o painel novo (v2).
4. Bot do Instagram: manter rodando até o módulo Social cobrir carrossel e stories; depois desligar.
