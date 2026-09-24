import { useState } from 'react';
import type { Config, MonthData, Payment, Settlements } from '../lib/types';
import { fmt } from '../lib/money';
import { monthLabel } from '../lib/dates';
import { buildFlow } from '../lib/settle';
import { TransferDialog } from './TransferDialog';

type Props = {
  config: Config;
  meId: string;
  monthsData: Record<string, MonthData>;
  settlements: Settlements;
  loading: boolean;
  saving: boolean;
  onSavePayment: (p: Payment) => Promise<boolean>;
  onDeletePayment: (p: Payment) => void;
  onSetStartDate: (d: string | null) => void;
  onBack: () => void;
};

export function BalancePage({
  config, meId, monthsData, settlements, loading, saving,
  onSavePayment, onDeletePayment, onSetStartDate, onBack,
}: Props) {
  const [dialog, setDialog] = useState<'new' | Payment | null>(null);
  const [editingStart, setEditingStart] = useState(false);
  const [startDraft, setStartDraft] = useState(settlements.startDate ?? '');

  const c = config.currency;
  const me = config.members.find((m) => m.id === meId);
  const other = config.members.find((m) => m.id !== meId) ?? config.members[0];
  const name = (id: string) => config.members.find((m) => m.id === id)?.name ?? id;

  const flow = buildFlow(monthsData, settlements.payments, meId, settlements.startDate);
  const owedByMe = flow.balance > 0;
  const [debtor, creditor] = owedByMe ? [me, other] : [other, me];

  return (
    <div className="balance">
      <div className="balance-head">
        <h2>结算</h2>
        <button className="ghost small" onClick={onBack}>返回账本</button>
      </div>

      {!me ? (
        <p className="empty">先在设置里选一下你是谁。</p>
      ) : (
        <div className="balance-cols">
          <div className="balance-main">
            <section className="verdict">
              {flow.balance === 0 ? (
                <p className="verdict-line">两清，谁也不欠谁。</p>
              ) : (
                <p className="verdict-line">
                  <span className="who">{debtor?.name}</span>
                  <span className="verb">欠</span>
                  <span className="who">{creditor?.name}</span>
                  <span className="big num">{fmt(Math.abs(flow.balance), c)}</span>
                </p>
              )}
              <div className="verdict-foot">
                <span>支出累计 <strong className="num">{fmt(flow.expenseTotal, c)}</strong></span>
                <span>已转账 <strong className="num">{fmt(flow.paidTotal, c)}</strong></span>
                <button className="primary" onClick={() => setDialog('new')}>记一次转账</button>
              </div>
            </section>

            <section className="block">
              <h3 className="block-title">流水</h3>
              {loading ? (
                <p className="empty">正在读取各月账目…</p>
              ) : !flow.rows.length ? (
                <p className="empty">还没有可结算的记录。</p>
              ) : (
                <div className="ledger-table">
                  <div className="flow-head">
                    <span>时间</span><span>项目</span><span className="right">变化</span><span className="right">{me.name} 欠款余额</span>
                  </div>
                  {flow.rows.map((r) => (
                    <div key={r.key} className={`flow-row ${r.kind === 'payment' ? 'pay' : ''}`}>
                      <span className="lt-date num">{r.date}</span>
                      <span className="lt-note">
                        {r.kind === 'payment' && r.payment ? (
                          <button className="link" onClick={() => setDialog(r.payment!)}>
                            {name(r.payment.from)} 转给 {name(r.payment.to)}
                          </button>
                        ) : r.label}
                        {r.sub && <small> · {r.sub}</small>}
                      </span>
                      <span className={`num right ${r.delta && r.delta < 0 ? 'accent' : ''}`}>
                        {r.delta === null ? '' : `${r.delta > 0 ? '+' : '−'}${fmt(Math.abs(r.delta), c)}`}
                      </span>
                      <span className={`num right strong ${r.balance < 0 ? 'accent' : ''}`}>{fmt(r.balance, c)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="balance-aside">
            <section className="card-row">
              <span className="card-row-label">
                <small>对账起点</small>
                {editingStart ? (
                  <input type="date" value={startDraft} onChange={(e) => setStartDraft(e.target.value)} />
                ) : (
                  <span className="num">{settlements.startDate ?? '不限'}</span>
                )}
              </span>
              {editingStart ? (
                <span className="card-row-actions">
                  <button className="ghost small" onClick={() => { setEditingStart(false); setStartDraft(settlements.startDate ?? ''); }}>取消</button>
                  <button className="primary small" disabled={saving}
                    onClick={() => { onSetStartDate(startDraft || null); setEditingStart(false); }}>保存</button>
                </span>
              ) : (
                <button className="ghost small" onClick={() => setEditingStart(true)}>修改</button>
              )}
            </section>

            {flow.byMonth.length > 0 && (
              <section className="block">
                <h3 className="block-title">按月看</h3>
                <ul className="month-nets">
                  {flow.byMonth.map((m) => (
                    <li key={m.month}>
                      <span>{monthLabel(m.month)}</span>
                      <span className={`num ${m.delta < 0 ? 'accent' : ''}`}>
                        {m.delta === 0 ? '两清' : `${m.delta > 0 ? me.name : other?.name} 欠 ${fmt(Math.abs(m.delta), c)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      {dialog && me && (
        <TransferDialog config={config} meId={meId} balance={flow.balance} saving={saving}
          initial={dialog === 'new' ? null : dialog}
          onSave={onSavePayment}
          onDelete={(p) => { onDeletePayment(p); setDialog(null); }}
          onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
