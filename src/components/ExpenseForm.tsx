import { useEffect, useMemo, useState } from 'react';
import type { Config, Expense, Split } from '../lib/types';
import { centsToInput, fmt, parseAmount } from '../lib/money';
import { computeShares } from '../lib/settle';
import { Icon, iconFor, type IconName } from './icons';

type Mode = Split['type'];

type Props = {
  config: Config;
  meId: string;
  defaultDate: string;
  initial?: Expense | null;
  saving: boolean;
  /** stack = 手机的竖排表单；bar = 电脑顶部的常驻输入条 */
  layout?: 'stack' | 'bar';
  onSave: (e: Expense, original?: Expense) => Promise<boolean>;
  onCancel?: () => void;
};

export function ExpenseForm({ config, meId, defaultDate, initial, saving, layout = 'stack', onSave, onCancel }: Props) {
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
  const twoWay = members.length === 2;
  const [weights, setWeights] = useState<Record<string, string>>(() =>
    Object.fromEntries(allIds.map((id) => [
      id,
      initial?.split.type === 'ratio' ? String(initial.split.weights[id] ?? 0) : twoWay ? '50' : '1',
    ])),
  );
  /** 两人时被自动算出来的那一格，金额变了要跟着重算 */
  const [derivedId, setDerivedId] = useState<string | null>(null);
  const [exacts, setExacts] = useState<Record<string, string>>(() =>
    Object.fromEntries(allIds.map((id) => [id, initial?.split.type === 'exact' && initial.split.amounts[id] ? centsToInput(initial.split.amounts[id]) : ''])),
  );
  const [error, setError] = useState<string | null>(null);

  const otherOf = (id: string) => members.find((m) => m.id !== id);

  const changeWeight = (id: string, text: string) => {
    const next = { ...weights, [id]: text };
    const other = otherOf(id);
    if (twoWay && other) {
      const v = Number(text);
      if (text.trim() !== '' && Number.isFinite(v) && v >= 0 && v <= 100) {
        next[other.id] = String(Math.round((100 - v) * 100) / 100);
      }
    }
    setWeights(next);
  };

  const changeExact = (id: string, text: string) => {
    const next = { ...exacts, [id]: text };
    const other = otherOf(id);
    if (twoWay && other) {
      const v = parseAmount(text || '0');
      if (amount && amount > 0 && v !== null && v >= 0 && v <= amount) {
        next[other.id] = centsToInput(amount - v);
        setDerivedId(other.id);
      }
    }
    setExacts(next);
  };

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

  const ratioPct = (id: string): number | null => {
    if (split.type !== 'ratio') return null;
    const W = Object.values(split.weights).reduce((a, b) => a + b, 0);
    return W > 0 ? Math.round(((split.weights[id] ?? 0) / W) * 100) : null;
  };
  /** 比例模式下没填金额也能看出分法，避免「1 : 1」看着像没设置 */
  const shareLabel = (id: string): string => {
    const pct = ratioPct(id);
    const amt = preview[id];
    if (pct !== null) return amt ? `${pct}% · ${fmt(amt, config.currency)}` : `${pct}%`;
    return amt ? fmt(amt, config.currency) : '';
  };

  useEffect(() => {
    if (mode !== 'exact' || !twoWay || !derivedId || !amount || amount <= 0) return;
    const other = otherOf(derivedId);
    if (!other) return;
    const v = parseAmount(exacts[other.id] || '0');
    if (v === null || v < 0 || v > amount) return;
    const want = centsToInput(amount - v);
    if (exacts[derivedId] !== want) setExacts((x) => ({ ...x, [derivedId]: want }));
  }, [amount, mode]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setDerivedId(null);
      setPayerId(allIds.includes(meId) ? meId : allIds[0]);
      setError(null);
    }
  }

  const toggle = (id: string) =>
    setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const categoryChips = (
    <div className="chips" role="radiogroup" aria-label="分类">
      {config.categories.map((c) => (
        <button type="button" key={c} role="radio" aria-checked={category === c}
          className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
          <Icon name={iconFor(c, config.categoryIcons as Record<string, IconName>)} size={16} />{c}</button>
      ))}
      {!config.categories.includes(category) && (
        <button type="button" role="radio" aria-checked className="chip on">
          <Icon name={iconFor(category, config.categoryIcons as Record<string, IconName>)} size={16} />{category}</button>
      )}
    </div>
  );

  const modeSwitch = (
    <div className="segmented">
      {([['equal', '平分'], ['ratio', '按比例'], ['exact', '指定金额']] as const).map(([k, label]) => (
        <button type="button" key={k} className={mode === k ? 'on' : ''} aria-pressed={mode === k} onClick={() => setMode(k)}>{label}</button>
      ))}
    </div>
  );

  if (layout === 'bar') {
    const participating = members.filter((m) => participants.includes(m.id));
    const shareText = amount && amount > 0
      ? participating.map((m) => `${m.name} ${fmt(preview[m.id] ?? 0, config.currency)}`).join(' · ')
      : participating.length === members.length
        ? `${members.length} 人平分`
        : `只算 ${participating.map((m) => m.name).join('、')}`;
    return (
      <form className="bar" onSubmit={(ev) => { ev.preventDefault(); submit(); }}>
        <div className="bar-row">
          <div className="field bar-amount">
            <label htmlFor="amount">金额</label>
            <div className="amount-input">
              <span aria-hidden>{config.currency}</span>
              <input id="amount" inputMode="decimal" autoComplete="off" placeholder="0.00"
                value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            </div>
          </div>
          <label className="field bar-note">
            <span className="field-label">备注</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="比如：Costco、电费 8 月" />
          </label>
          <label className="field bar-date">
            <span className="field-label">日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="field">
            <span className="field-label">谁付的钱</span>
            {members.length <= 3 ? (
              <div className="segmented payer">
                {members.map((m) => (
                  <button type="button" key={m.id} className={payerId === m.id ? 'on' : ''}
                    aria-pressed={payerId === m.id} onClick={() => setPayerId(m.id)}>{m.name}</button>
                ))}
              </div>
            ) : (
              <select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>
          <button type="submit" className="primary bar-submit" disabled={saving}>
            {saving ? '保存中…' : initial ? '保存修改' : '记一笔'}
          </button>
          {onCancel && <button type="button" className="ghost" onClick={onCancel}>取消</button>}
        </div>

        {categoryChips}

        <div className="bar-split">
          <span className="field-label">怎么分</span>
          {modeSwitch}
          {mode === 'equal' && <span className="bar-shares num">{shareText}</span>}
          {mode === 'ratio' && members.map((m) => (
            <span key={m.id} className="bar-weight">
              <label htmlFor={`w-${m.id}`}>{m.name}</label>
              <input id={`w-${m.id}`} className="small" inputMode="decimal"
                value={weights[m.id] ?? ''} onChange={(e) => changeWeight(m.id, e.target.value)} />
              {twoWay && <span className="unit">%</span>}
              <span className="num muted">{twoWay ? (preview[m.id] ? fmt(preview[m.id], config.currency) : '') : shareLabel(m.id)}</span>
            </span>
          ))}
          {mode === 'exact' && members.map((m) => (
            <span key={m.id} className="bar-weight">
              <label htmlFor={`w-${m.id}`}>{m.name}</label>
              <span className="exact-input">
                <span aria-hidden>{config.currency}</span>
                <input id={`w-${m.id}`} className="small" inputMode="decimal" placeholder="0"
                  value={exacts[m.id] ?? ''} onChange={(e) => changeExact(m.id, e.target.value)} />
              </span>
            </span>
          ))}
          {mode === 'exact' && (
            <span className={`num ${amount && exactSum !== amount ? 'neg' : 'muted'}`}>
              合计 {fmt(exactSum, config.currency)}
              {amount ? ` / ${fmt(amount, config.currency)}` : ''}
            </span>
          )}
          {mode === 'equal' && members.length > 1 && (
            <span className="bar-quick">
              {members.map((m) => (
                <button type="button" key={m.id} className="link" onClick={() => setParticipants([m.id])}>只算 {m.name}</button>
              ))}
              {participants.length !== allIds.length && (
                <button type="button" className="link" onClick={() => setParticipants(allIds)}>全部平分</button>
              )}
            </span>
          )}
          {showsExpr && <span className="hint">= {fmt(amount!, config.currency)}</span>}
        </div>

        {error && <p className="error" role="alert">{error}</p>}
      </form>
    );
  }

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
        {categoryChips}
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
        {modeSwitch}

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
                  value={weights[m.id] ?? ''} onChange={(e) => changeWeight(m.id, e.target.value)} />
              )}
              {mode === 'exact' && (
                <input className="small" inputMode="decimal" placeholder="0" aria-label={`${m.name} 承担的金额`}
                  value={exacts[m.id] ?? ''} onChange={(e) => changeExact(m.id, e.target.value)} />
              )}
              <span className="share">{shareLabel(m.id) || '—'}</span>
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
