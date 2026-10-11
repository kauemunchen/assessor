import cron from 'node-cron';
// Rotinas por conta e módulo lidas de persona_config (hora_resumo etc.). Esqueleto.
export function iniciarRotinas(_canal) {
  cron.schedule('* * * * *', async () => { /* TODO: para cada conta, disparar rotinas cujo horário bate agora */ }, { timezone: process.env.TZ || 'America/Sao_Paulo' });
}
