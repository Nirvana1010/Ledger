import type { Expense, Member } from './types';

/** 一笔支出里每个人应承担多少（分），保证总和等于 amount */
export function computeShares(e: Pick<Expense, 'amount' | 'split'>): Record<string, number> {
  const out: Record<string, number> = {};
  const s = e.split;
  if (s.type === 'equal') {
    const n = s.participants.length;
    if (!n) return out;
    const base = Math.floor(e.amount / n);
    let rem = e.amount - base * n;
    for (const id of s.participants) {
      out[id] = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
    }
  } else if (s.type === 'ratio') {
    const entries = Object.entries(s.weights).filter(([, w]) => w > 0);
    const W = entries.reduce((a, [, w]) => a + w, 0);
    if (!W) return out;
    const raw = entries.map(([id, w]) => {
      const x = (e.amount * w) / W;
      return { id, fl: Math.floor(x), fr: x - Math.floor(x) };
    });
    let rem = e.amount - raw.reduce((a, r) => a + r.fl, 0);
    [...raw].sort((a, b) => b.fr - a.fr).forEach((r) => {
      if (rem > 0) { r.fl++; rem--; }
    });
    raw.forEach((r) => (out[r.id] = r.fl));
  } else {
    for (const [id, v] of Object.entries(s.amounts)) if (v) out[id] = v;
  }
  return out;
}

export type Balance = { id: string; paid: number; owed: number; net: number };

export function computeBalances(expenses: Expense[], members: Member[]): Balance[] {
  const map = new Map<string, Balance>();
  const get = (id: string) => {
    let b = map.get(id);
    if (!b) { b = { id, paid: 0, owed: 0, net: 0 }; map.set(id, b); }
    return b;
  };
  members.forEach((m) => get(m.id));
  for (const e of expenses) {
    get(e.payerId).paid += e.amount;
    for (const [id, v] of Object.entries(computeShares(e))) get(id).owed += v;
  }
  const list = [...map.values()];
  list.forEach((b) => (b.net = b.paid - b.owed));
  return list;
}

export type Transfer = { from: string; to: string; amount: number };

/** 贪心配对：欠得最多的付给该收最多的，转账次数最少（两人时就是一笔） */
export function computeTransfers(balances: Balance[]): Transfer[] {
  const debtors = balances.filter((b) => b.net < 0).map((b) => ({ id: b.id, amt: -b.net })).sort((a, b) => b.amt - a.amt);
  const creditors = balances.filter((b) => b.net > 0).map((b) => ({ id: b.id, amt: b.net })).sort((a, b) => b.amt - a.amt);
  const out: Transfer[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const x = Math.min(debtors[i].amt, creditors[j].amt);
    if (x > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: x });
    debtors[i].amt -= x;
    creditors[j].amt -= x;
    if (!debtors[i].amt) i++;
    if (!creditors[j].amt) j++;
  }
  return out;
}

export function categoryTotals(expenses: Expense[]): { category: string; total: number }[] {
  const m = new Map<string, number>();
  for (const e of expenses) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
  return [...m.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}
