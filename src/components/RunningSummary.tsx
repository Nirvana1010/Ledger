import type { Config, Expense, MonthData, Settlements } from '../lib/types';
import { fmt } from '../lib/money';
import { buildFlow, categoryTotals } from '../lib/settle';
import { CategoryDonut } from './CategoryDonut';

type Props = {
  config: Config;
  meId: string;
  /** 当前时间范围里的账目，用来算出资和分类 */
  expenses: Expense[];
  /** 全部月份，用来算余额（余额永远是全量的，不受时间筛选影响） */
  monthsData: Record<string, MonthData>;
  settlements: Settlements;
  compact?: boolean;
  onOpenBalance: () => void;
};

export function RunningSummary({ config, meId, expenses, monthsData, settlements, compact = false, onOpenBalance }: Props) {
  const c = config.currency;
  const me = config.members.find((m) => m.id === meId);
  const other = config.members.find((m) => m.id !== meId);
  const flow = buildFlow(monthsData, settlements.payments, meId, settlements.startDate);
  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const paidBy = (id: string) => expenses.filter((e) => e.payerId === id).reduce((a, e) => a + e.amount, 0);
  const [debtor, creditor] = flow.balance > 0 ? [me, other] : [other, me];

  return (
    <div className={`summary ${compact ? 'compact' : ''}`}>
      <section className="verdict">
        {!me || flow.balance === 0 ? (
          <p className="verdict-line">两清，谁也不欠谁。</p>
        ) : (
          <p className="verdict-line">
            <span className="who">{debtor?.name}</span>
            <span className="verb">欠</span>
            <span className="who">{creditor?.name}</span>
            <span className="big num">{fmt(Math.abs(flow.balance), c)}</span>
          </p>
        )}
        <div className="contrib">
          {config.members.map((m) => (
            <div key={m.id}>
              <span>{m.name} 出资</span>
              <span className="num">{fmt(paidBy(m.id), c)}</span>
            </div>
          ))}
          <div className="contrib-total">
            <span>合计</span>
            <span className="num">{fmt(total, c)}</span>
          </div>
        </div>
        <div className="verdict-foot">
          <span>{expenses.length} 笔</span>
          <button className="ghost" onClick={onOpenBalance}>结算</button>
        </div>
      </section>

      {expenses.length > 0 && (
        <section className="block">
          <h2>分类</h2>
          <CategoryDonut cats={categoryTotals(expenses)} config={config} size={compact ? 140 : 190} />
        </section>
      )}
    </div>
  );
}
