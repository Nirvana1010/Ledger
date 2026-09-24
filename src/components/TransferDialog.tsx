import { useState } from 'react';
import type { Config, Payment } from '../lib/types';
import { centsToInput, fmt, parseAmount } from '../lib/money';
import { today } from '../lib/dates';

type Props = {
  config: Config;
  meId: string;
  /** 当前余额：正数表示 meId 欠别人 */
  balance: number;
  initial?: Payment | null;
  saving: boolean;
  onSave: (p: Payment) => Promise<boolean>;
  onDelete?: (p: Payment) => void;
  onClose: () => void;
};

export function TransferDialog({ config, meId, balance, initial, saving, onSave, onDelete, onClose }: Props) {
  const members = config.members;
  const other = members.find((m) => m.id !== meId) ?? members[0];
  const owedByMe = balance > 0;

  const [from, setFrom] = useState(initial?.from ?? (owedByMe ? meId : other.id));
  const [to, setTo] = useState(initial?.to ?? (owedByMe ? other.id : meId));
  const [amountText, setAmountText] = useState(initial ? centsToInput(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? today());
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? id;
  const signed = amount ? (from === meId ? -amount : amount) : 0;
  const after = balance + signed;

  const describe = (v: number) => {
    if (v === 0) return '两清';
    const [a, b] = v > 0 ? [meId, other.id] : [other.id, meId];
    return `${name(a)} 欠 ${name(b)} ${fmt(Math.abs(v), config.currency)}`;
  };

  async function submit() {
    if (amount === null || amount <= 0) { setError('填一个大于 0 的金额。'); return; }
    if (from === to) { setError('转出和转入不能是同一个人。'); return; }
    const now = new Date().toISOString();
    const ok = await onSave({
      id: initial?.id ?? crypto.randomUUID(),
      date, from, to, amount, note: note.trim(),
      createdBy: initial?.createdBy ?? meId,
      createdAt: initial?.createdAt ?? now,
      ...(initial ? { updatedAt: now } : {}),
    });
    if (ok) onClose();
  }

  const swap = () => { setFrom(to); setTo(from); };

  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="modal" onSubmit={(e) => { e.preventDefault(); submit(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="modal-head">
          <h2>{initial ? '修改转账' : '记一次转账'}</h2>
          <button type="button" className="icon" onClick={onClose} aria-label="关闭">×</button>
        </div>

        <div className="row2">
          <div className="field">
            <span className="field-label">谁付给谁</span>
            <div className="direction">
              <span>{name(from)}</span>
              <span className="muted">付给</span>
              <span>{name(to)}</span>
              <button type="button" className="icon" onClick={swap} aria-label="对调方向">⇄</button>
            </div>
          </div>
          <label className="field">
            <span className="field-label">转账日期</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        <div className="field amount-field">
          <label htmlFor="pay-amount">金额</label>
          <div className="amount-input">
            <span aria-hidden>{config.currency}</span>
            <input id="pay-amount" inputMode="decimal" autoFocus placeholder="0.00"
              value={amountText} onChange={(e) => setAmountText(e.target.value)} />
            {balance !== 0 && (
              <button type="button" className="ghost small" onClick={() => {
                setAmountText(centsToInput(Math.abs(balance)));
                setFrom(owedByMe ? meId : other.id);
                setTo(owedByMe ? other.id : meId);
              }}>正好结清 {fmt(Math.abs(balance), config.currency)}</button>
            )}
          </div>
        </div>

        <div className="preview">
          <div><span className="muted">转账前</span><span className="num">{describe(balance)}</span></div>
          <div className="after"><span className="muted">转账后</span><span className="num">{describe(after)}</span></div>
        </div>

        <label className="field">
          <span className="field-label">备注</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Zelle、微信…" />
        </label>

        {error && <p className="error" role="alert">{error}</p>}

        <div className="modal-foot">
          {initial && onDelete && (
            <button type="button" className="link danger" onClick={() => onDelete(initial)}>删除这笔转账</button>
          )}
          <button type="button" className="ghost" onClick={onClose}>取消</button>
          <button type="submit" className="primary" disabled={saving}>
            {saving ? '保存中…' : initial ? '保存修改' : '记下这笔转账'}
          </button>
        </div>
      </form>
    </div>
  );
}
