CREATE TABLE IF NOT EXISTS contas (
  id INTEGER PRIMARY KEY, nome_dono TEXT, empresa TEXT, foco_mes TEXT, carteiras TEXT,
  janela_silencio TEXT DEFAULT '22h–6h e domingo', criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY, conta_id INTEGER REFERENCES contas(id), canal TEXT, chat_id TEXT UNIQUE,
  nome TEXT, papel TEXT DEFAULT 'dono'  -- dono | socio | gestor | colaborador
);
CREATE TABLE IF NOT EXISTS modulos (
  conta_id INTEGER REFERENCES contas(id), modulo TEXT, ligado INTEGER DEFAULT 0, PRIMARY KEY (conta_id, modulo)
);
CREATE TABLE IF NOT EXISTS persona_config (
  conta_id INTEGER REFERENCES contas(id), modulo TEXT,
  nome TEXT, tratamento TEXT DEFAULT 'primeiro nome', tom TEXT DEFAULT 'direto', tamanho TEXT DEFAULT 'curta',
  proatividade TEXT DEFAULT 'essencial', autonomia TEXT DEFAULT 'confirma acao externa', perfil_analise TEXT DEFAULT 'equilibrado',
  hora_resumo TEXT DEFAULT '07:00', hora_fechamento TEXT DEFAULT '20:00', hora_semana TEXT DEFAULT '17:00',
  hora_retornos TEXT DEFAULT '18:00', hora_checagem TEXT DEFAULT '12:00', padrao_tarde TEXT DEFAULT '14:00',
  emojis INTEGER DEFAULT 0, PRIMARY KEY (conta_id, modulo)
);
CREATE TABLE IF NOT EXISTS memoria (
  id INTEGER PRIMARY KEY, conta_id INTEGER, modulo TEXT, fato TEXT, criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS interacoes (
  id INTEGER PRIMARY KEY, conta_id INTEGER, modulo TEXT, entrada TEXT, saida TEXT, criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY, conta_id INTEGER, titulo TEXT, responsavel TEXT, prazo TEXT, status TEXT DEFAULT 'aberta', criado_em TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lembretes (
  id INTEGER PRIMARY KEY, conta_id INTEGER, modulo TEXT, texto TEXT, quando TEXT, recorrencia TEXT, destino_chat_id TEXT, enviado INTEGER DEFAULT 0
);
