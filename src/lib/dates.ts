const pad = (n: number) => String(n).padStart(2, '0');

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const currentMonth = () => today().slice(0, 7);
export const monthOf = (date: string) => date.slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y} 年 ${m} 月`;
}

/** 某月里的默认记账日期：本月用今天，其他月份用 1 号 */
export function defaultDateFor(month: string): string {
  return monthOf(today()) === month ? today() : `${month}-01`;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${m} 月 ${d} 日 周${WEEK[new Date(y, m - 1, d).getDay()]}`;
}
