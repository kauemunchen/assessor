// Ferramentas do módulo financeiro. REGRAS DURAS validadas aqui.
export function ferramentas(_conta) { return []; }
export async function executar(nome, args, conta) {
  if (nome === 'registrar_lancamento' && !args.carteira) throw new Error('Lançamento sem carteira. Pergunte ao dono qual carteira.');
  if (nome === 'dar_baixa' && !args.comprovante && !args.extrato_id) throw new Error('Baixa sem comprovante nem extrato.');
  if (['transferir', 'pagar'].includes(nome)) throw new Error('Este módulo nunca movimenta dinheiro.');
  throw new Error(`financeiro.${nome}: não implementada`);
}
