/** 解析金额输入，支持简单加减，比如 "23.5+12-3" → 3250 分。无效返回 null */
export function parseAmount(input: string): number | null {
  const t = input.replace(/[\s,，]/g, '').replace(/＋/g, '+').replace(/－/g, '-');
  if (!/^[+-]?\d+(\.\d{1,2})?([+-]\d+(\.\d{1,2})?)*$/.test(t)) return null;
  const terms = t.match(/[+-]?\d+(\.\d{1,2})?/g) ?? [];
  let sum = 0;
  for (const term of terms) {
    const neg = term.startsWith('-');
    const [i, f = ''] = term.replace(/^[+-]/, '').split('.');
    const cents = parseInt(i, 10) * 100 + parseInt((f + '00').slice(0, 2), 10);
    sum += neg ? -cents : cents;
  }
  return sum;
}

export function fmt(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const a = Math.abs(Math.round(cents));
  const whole = Math.floor(a / 100).toLocaleString('en-US');
  return `${sign}${currency}${whole}.${String(a % 100).padStart(2, '0')}`;
}

export const centsToInput = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, '');
