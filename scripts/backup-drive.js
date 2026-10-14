// Envia um arquivo de backup para o Google Drive do dono (conta 1): pasta <raiz Assessor KM>/Backups. Mantém os 10 últimos lá.
import 'dotenv/config';
import fs from 'node:fs';
import { db } from '../src/db/index.js';
import * as drive from '../src/integracoes/google-drive.js';
const arq = process.argv[2]; if (!arq || !fs.existsSync(arq)) { console.error('arquivo?'); process.exit(1); }
const conta = db.prepare('SELECT id FROM contas ORDER BY id LIMIT 1').get(); if (!conta) process.exit(0);
try {
  const raiz = await drive.pastaRaiz(conta.id); const pasta = await drive.obterOuCriarPasta(conta.id, 'Backups', raiz);
  const r = await drive.upload(conta.id, { nome: arq.split('/').pop(), mime: 'application/gzip', bytes: fs.readFileSync(arq), pastaId: pasta, descricao: 'Backup automático Assessor KM' });
  console.log('☁️ Drive:', r.link);
  // retenção no Drive
  const lista = await drive.buscarNoDrive(conta.id, 'assessor-km-backup', 50).catch(() => []);
  const antigos = lista.filter(f => /assessor-km-backup/.test(f.nome)).sort((a, b) => b.modificado.localeCompare(a.modificado)).slice(10);
  for (const f of antigos) { try { await drive.mover(conta.id, f.drive_id, await drive.obterOuCriarPasta(conta.id, 'Lixeira-backups', pasta)); } catch {} }
} catch (e) { console.error('Drive:', e.message); process.exit(2); }
