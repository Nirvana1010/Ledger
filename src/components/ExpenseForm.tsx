import { useMemo, useState } from 'react';
import type { Config, Expense, Split } from '../lib/types';
import { centsToInput, fmt, parseAmount } from '../lib/money';
import { computeShares } from '../lib/settle';

type Mode = Split['type'];

type Props = {
  config: Config;
  meId: string;
  defaultDate: string;
  initial?: Expense | null;
  saving: boolean;
  onSave: (e: Expense, original?: Expense) => Promise<boolean>;
  onCancel?: () => void;
};

export function ExpenseForm({ config, meId, defaultDate, initial, saving, onSave, onCancel }: Props) {
  const members = config.members;
  const allIds = members.map((m) => m.id);
  const [amountText, setAmountText] = useState(initial ? centsToInput(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [payerId, setPayerId] = useState(initial?.payerId ?? (allIds.includes(meId) ? meId : allIds[0]));
  const [category, setCategory] = useState(initial?.category ?? config.categories[0] ?? '其他');
  const [note, setNote] = useState(initial?.note ?? '');
  const [mode, setMode] = useState<Mode>(initial?.split.type ?? 'equal');
  const [participants, setParticipants] = useState<string[]>(
    initial?.split.type === 'equal' ? initial.split.participants : allIds,
  );
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(allIds.map((id) => [id, initial?.split.type === 'ratio' ? String(initial.split.weights[id] ?? 0) : '1'])),
  );
  const [exacts, setExacts] = useState<Record<string, string>>(() =>
    Object.fromEntries(allIds.map((id) => [id, initial?.split.type === 'exact' && initial.split.amounts[id] ? centsToInput(initial.split.amounts[id]) : ''])),
  );
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const showsExpr = /[+\-]/.test(amountText.replace(/^-/, '')) && amount !== null;

  const split: Split = useMemo(() => {
    if (mode === 'equal') return { type: 'equal', participants: allIds.filter((id) => participants.includes(id)) };
    if (mode === 'ratio') {
      return { type: 'ratio', weights: Object.fromEntries(allIds.map((id) => [id, Math.max(0, Number(weights[id]) || 0)])) };
    }
    return { type: 'exact', amounts: Object.fromEntries(allIds.map((id) => [id, parseAmount(exacts[id] || '0') ?? 0])) };
  }, [mode, participants, weights, exacts, allIds.join()]);

  const exactSum = split.type === 'exact' ? Object.values(split.amounts).reduce((a, b) => a + b, 0) : 0;
  const preview = amount && amount > 0 ? computeShares({ amount, split }) : {};

  function validate(): string | null {
    if (amount === null) return '金额格式不对，可以写 45.8 或 30+15.8 这样的算式。';
    if (amount <= 0) return '金额需要大于 0。';
    if (!date) return '请选择日期。';
    if (split.type === 'equal' && !split.participants.length) return '至少选一个人来分摊。';
    if (split.type === 'ratio' && !Object.values(split.weights).some((w) => w > 0)) return '比例里至少有一个人大于 0。';
    if (split.type === 'exact' && exactSum !== amount) {
      return `各人金额加起来是 ${fmt(exactSum, config.currency)}，和总额 ${fmt(amount, config.currency)} 对不上。`;
    }
    return null;
  }

  async function submit() {
    const msg = validate();
    setError(msg);
    if (msg || amount === null) return;
    const now = new Date().toISOString();
    const e: Expense = {
      id: initial?.id ?? crypto.randomUUID(),
      date, amount, payerId, category, note: note.trim(), split,
      createdBy: initial?.createdBy ?? meId,
      createdAt: initial?.createdAt ?? now,
      ...(initial ? { updatedAt: now } : {}),
    };
    const ok = await onSave(e, initial ?? undefined);
    if (ok && !initial) {
      // 连续记账：保留日期和分类，其余回到默认
      setAmountText('');
      setNote('');
      setMode('equal');
      setParticipants(allIds);
      setPayerId(allIds.includes(meId) ? meId : allIds[0]);
      setError(null);
    }
  }

  const toggle = (id: string) =>
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <form className="form" onSubmit={(ev) => { ev.preventDefault(); submit(); }}>
      <div className="amount-field">
        <label htmlFor="amount">金额</label>
        <div className="amount-input">
          <span aria-hidden>{config.currency}</span>
          <input
            id="amount" inputMode="decimal" autoComplete="off" placeholder="0.00"
            value={amountText} onChange={(e) => setAmountText(e.target.value)}
          />
        </div>
        {showsExpr && <p className="hint">= {fmt(amount!, config.currency)}</p>}
      </div>

      <div className="field">
        <span className="field-label">分类</span>
        <div className="chips" role="radiogroup">
          {config.categories.map((c) => (
            <button type="button" key={c} role="radio" aria-checked={category === c}
              className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>{c}</button>
          ))}
          {!config.categories.includes(category) && (
            <button type="button" role="radio" aria-checked className="chip on">{category}</button>
          )}
        </div>
      </div>

      <div className="row2">
        <label className="field">
          <span className="field-label">日期</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">谁付的钱</span>
          <select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field-label">备注</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="比如：Costco、电费 8 月" />
      </label>

      <fieldset className="field split">
        <legend className="field-label">怎么分</legend>
        <div className="segmented">
          {([['equal', '平分'], ['ratio', '按比例'], ['exact', '指定金额']] as const).map(([k, label]) => (
            <button type="button" key={k} className={mode === k ? 'on' : ''} aria-pressed={mode === k} onClick={() => setMode(k)}>{label}</button>
          ))}
        </div>

        <ul className="split-rows">
          {members.map((m) => (
            <li key={m.id}>
              {mode === 'equal' ? (
                <label className="check">
                  <input type="checkbox" checked={participants.includes(m.id)} onChange={() => toggle(m.id)} />
                  <span>{m.name}</span>
                </label>
              ) : (
                <span className="split-name">{m.name}</span>
              )}
              {mode === 'ratio' && (
                <input className="small" inputMode="decimal" aria-label={`${m.name} 的比例`}
                  value={weights[m.id] ?? ''} onChange={(e) => setWeights({ ...weights, [m.id]: e.target.value })} />
              )}
              {mode === 'exact' && (
                <input className="small" inputMode="decimal" placeholder="0" aria-label={`${m.name} 承担的金额`}
                  value={exacts[m.id] ?? ''} onChange={(e) => setExacts({ ...exacts, [m.id]: e.target.value })} />
              )}
              <span className="share">{preview[m.id] ? fmt(preview[m.id], config.currency) : '—'}</span>
            </li>
          ))}
        </ul>
        {mode === 'equal' && members.length > 1 && (
          <div className="quick">
            {members.map((m) => (
              <button type="button" key={m.id} className="link" onClick={() => setParticipants([m.id])}>只算 {m.name}</button>
            ))}
            <button type="button" className="link" onClick={() => setParticipants(allIds)}>全部平分</button>
          </div>
        )}
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="actions">
        {onCancel && <button type="button" className="ghost" onClick={onCancel}>取消</button>}
        <button type="submit" className="primary" disabled={saving}>
          {saving ? '保存中…' : initial ? '保存修改' : '记一笔'}
        </button>
      </div>
    </form>
  );
}
