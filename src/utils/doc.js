// Validadores de CPF e CNPJ com dígito verificador (não é só tamanho).
export const limparDoc = (s) => String(s || '').replace(/\D/g, '');
export function validaCPF(c) {
  c = limparDoc(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += Number(c[i]) * (10 - i);
  let d = (s * 10) % 11; if (d === 10) d = 0; if (d !== Number(c[9])) return false;
  s = 0; for (let i = 0; i < 10; i++) s += Number(c[i]) * (11 - i);
  d = (s * 10) % 11; if (d === 10) d = 0; return d === Number(c[10]);
}
export function validaCNPJ(c) {
  c = limparDoc(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const p2 = [6, ...p1];
  let s = 0; for (let i = 0; i < 12; i++) s += Number(c[i]) * p1[i];
  let d = s % 11; d = d < 2 ? 0 : 11 - d; if (d !== Number(c[12])) return false;
  s = 0; for (let i = 0; i < 13; i++) s += Number(c[i]) * p2[i];
  d = s % 11; d = d < 2 ? 0 : 11 - d; return d === Number(c[13]);
}
export const docValido = (s) => { const d = limparDoc(s); return validaCPF(d) || validaCNPJ(d); };
export const tipoDoc = (s) => { const d = limparDoc(s); return validaCPF(d) ? 'CPF' : validaCNPJ(d) ? 'CNPJ' : null; };
export const formatarDoc = (s) => { const d = limparDoc(s); if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'); if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); return d; };
