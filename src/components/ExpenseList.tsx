import { useMemo, useState } from 'react';
import type { Config, Expense, MonthData } from '../lib/types';
import { fmt } from '../lib/money';
import { dayLabel } from '../lib/dates';
import { computeShares } from '../lib/settle';

type Props = {
  config: Config;
  data: MonthData;
  onEdit: (e: Expense) => void;
  onDelete: (e: Expense) => void;
};

export function splitSummary(e: Expense, config: Config): string {
  const name = (id: string) => config.members.find((m) => m.id === id)?.name ?? '已移除';
  const s = e.split;
  if (s.type === 'equal') {
    if (s.participants.length === config.members.length) return '平分';
    if (s.participants.length === 1) return `只算 ${name(s.participants[0])}`;
    return `${s.participants.map(name).join('、')}平分`;
  }
  if (s.type === 'ratio') {
    const ids = config.members.map((m) => m.id);
    return `按 ${ids.map((id) => s.weights[id] ?? 0).join(' : ')}`;
  }
  return '指定金额';
}

function toCSV(data: MonthData, config: Config): string {
  const name = (id: string) => config.members.find((m) => m.id === id)?.name ?? id;
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['日期', '分类', '金额', '付款人', '备注', '分摊方式', ...config.members.map((m) => `${m.name}承担`)];
  const rows = data.expenses.map((e) => {
    const sh = computeShares(e);
    return [e.date, e.category, (e.amount / 100).toFixed(2), name(e.payerId), e.note, splitSummary(e, config),
      ...config.members.map((m) => ((sh[m.id] ?? 0) / 100).toFixed(2))];
  });
  return '\uFEFF' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}

export function ExpenseList({ config, data, onEdit, onDelete }: Props) {
  const [filter, setFilter] = useState<string | null>(null);
  const name = (id: string) => config.members.find((m) => m.id === id)?.name ?? '已移除';

  const shown = useMemo(
    () => [...data.expenses].filter((e) => !filter || e.category === filter)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [data.expenses, filter],
  );
  const groups = useMemo(() => {
    const m = new Map<string, Expense[]>();
    shown.forEach((e) => m.set(e.date, [...(m.get(e.date) ?? []), e]));
    return [...m.entries()];
  }, [shown]);
  const usedCats = [...new Set(data.expenses.map((e) => e.category))];
  const total = shown.reduce((a, e) => a + e.amount, 0);

  function exportCSV() {
    const blob = new Blob([toCSV(data, config)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `账本-${data.month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!data.expenses.length) {
    return <p className="empty">这个月还没有记录。去「记一笔」添加第一笔支出。</p>;
  }

  return (
    <div className="list">
      <div className="list-bar">
        <div className="chips scroll">
          <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setFilter(null)}>全部</button>
          {usedCats.map((c) => (
            <button key={c} className={`chip ${filter === c ? 'on' : ''}`} onClick={() => setFilter(filter === c ? null : c)}>{c}</button>
          ))}
        </div>
      </div>
      <p className="list-total">
        {shown.length} 笔，共 <strong className="num">{fmt(total, config.currency)}</strong>
        <button className="link" onClick={exportCSV}>导出 CSV</button>
      </p>

      {groups.map(([date, items]) => (
        <section key={date} className="day">
          <h3>{dayLabel(date)}</h3>
          <ul>
            {items.map((e) => (
              <li key={e.id} className="item">
                <button className="item-main" onClick={() => onEdit(e)} aria-label={`编辑 ${e.category} ${fmt(e.amount, config.currency)}`}>
                  <span className="item-cat">{e.note ? e.category : ''}</span>
                  <span className="item-text">
                    <span>{e.note || e.category}</span>
                    <small>{name(e.payerId)} 付，{splitSummary(e, config)}</small>
                  </span>
                  <span className="item-amt num">{fmt(e.amount, config.currency)}</span>
                </button>
                <button className="item-del" onClick={() => onDelete(e)} aria-label="删除这笔">删除</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
