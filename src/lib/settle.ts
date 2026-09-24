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

// ——— 累计余额 ———

import type { MonthData, Payment } from './types';

/** 某人在一批支出里净增加的欠款：应承担 − 实际付出 */
export function debtDelta(expenses: Expense[], memberId: string): number {
  let owed = 0;
  let paid = 0;
  for (const e of expenses) {
    if (e.payerId === memberId) paid += e.amount;
    owed += computeShares(e)[memberId] ?? 0;
  }
  return owed - paid;
}

export type FlowRow = {
  kind: 'month' | 'payment' | 'start';
  key: string;
  date: string;
  label: string;
  sub: string;
  delta: number | null;
  balance: number;
  payment?: Payment;
};

export type Flow = {
  rows: FlowRow[]; // 倒序，最新在上
  balance: number; // 正数 = meId 欠别人，负数 = 别人欠 meId
  expenseTotal: number;
  paidTotal: number;
  byMonth: { month: string; delta: number }[];
};

/** 把每月支出净额和每笔转账按时间串成一条流水，算出滚动余额 */
export function buildFlow(
  monthsData: Record<string, MonthData>,
  payments: Payment[],
  meId: string,
  startDate?: string | null,
): Flow {
  const monthEvents = Object.values(monthsData)
    .filter((d) => d.expenses.length)
    .map((d) => {
      const expenses = startDate ? d.expenses.filter((e) => e.date >= startDate) : d.expenses;
      return { month: d.month, expenses, delta: debtDelta(expenses, meId) };
    })
    .filter((m) => m.expenses.length);

  const pays = payments
    .filter((p) => (!startDate || p.date >= startDate) && (p.from === meId || p.to === meId))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  type Ev = { at: string; row: Omit<FlowRow, 'balance'> };
  const events: Ev[] = [];

  for (const m of monthEvents) {
    events.push({
      at: `${m.month}-31`,
      row: {
        kind: 'month', key: `m-${m.month}`, date: monthLabelShort(m.month),
        label: `${Number(m.month.slice(5))} 月支出结算`, sub: `${m.expenses.length} 笔`, delta: m.delta,
      },
    });
  }
  for (const p of pays) {
    const iPaid = p.from === meId;
    events.push({
      at: p.date,
      row: {
        kind: 'payment', key: `p-${p.id}`, date: dayLabelShort(p.date),
        label: iPaid ? '我转出' : '我收到', sub: p.note, delta: iPaid ? -p.amount : p.amount, payment: p,
      },
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at));

  let running = 0;
  const rows: FlowRow[] = events.map((ev) => {
    running += ev.row.delta ?? 0;
    return { ...ev.row, balance: running };
  });

  if (startDate) {
    rows.unshift({ kind: 'start', key: 'start', date: startDate, label: '对账起点', sub: '', delta: null, balance: 0 });
  }

  return {
    rows: rows.reverse(),
    balance: running,
    expenseTotal: monthEvents.reduce((a, m) => a + m.expenses.reduce((x, e) => x + e.amount, 0), 0),
    paidTotal: pays.reduce((a, p) => a + p.amount, 0),
    byMonth: monthEvents.map((m) => ({ month: m.month, delta: m.delta })).sort((a, b) => b.month.localeCompare(a.month)),
  };
}

function dayLabelShort(date: string): string {
  return `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日`;
}

function monthLabelShort(month: string): string {
  const [y, m] = month.split('-');
  return `${y} 年 ${Number(m)} 月`;
}
