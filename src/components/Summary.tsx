import type { Config, MonthData } from '../lib/types';
import { fmt } from '../lib/money';
import { categoryTotals, computeBalances, computeTransfers } from '../lib/settle';
import { CategoryDonut } from './CategoryDonut';

type Props = {
  config: Config;
  data: MonthData;
  saving: boolean;
  /** compact = 电脑右侧窄栏，图表和表格都收窄 */
  compact?: boolean;
  onToggleSettled: () => void;
};

export function Summary({ config, data, saving, compact = false, onToggleSettled }: Props) {
  const name = (id: string) => config.members.find((m) => m.id === id)?.name ?? '已移除';
  const c = config.currency;
  const balances = computeBalances(data.expenses, config.members);
  const transfers = computeTransfers(balances);
  const cats = categoryTotals(data.expenses);
  const total = data.expenses.reduce((a, e) => a + e.amount, 0);

  return (
    <div className={`summary ${compact ? 'compact' : ''}`}>
      <section className={`verdict ${data.settledAt ? 'settled' : ''}`} aria-live="polite">
        {!data.expenses.length ? (
          <p className="verdict-empty">这个月还没有支出，没有需要结算的。</p>
        ) : transfers.length === 0 ? (
          <p className="verdict-line">两清，谁也不欠谁。</p>
        ) : (
          transfers.map((t, i) => (
            <p key={i} className="verdict-line">
              <span className="who">{name(t.from)}</span>
              <span className="verb">付给</span>
              <span className="who">{name(t.to)}</span>
              <span className="big num">{fmt(t.amount, c)}</span>
            </p>
          ))
        )}
        {data.expenses.length > 0 && (
          <div className="verdict-foot">
            {data.settledAt
              ? <span>已于 {new Date(data.settledAt).toLocaleDateString('zh-CN')} 结清{data.settledBy ? `（${name(data.settledBy)}）` : ''}</span>
              : <span>本月共 {data.expenses.length} 笔，{fmt(total, c)}</span>}
            <button className="ghost" disabled={saving} onClick={onToggleSettled}>
              {data.settledAt ? '撤销结清' : '标记为已结清'}
            </button>
          </div>
        )}
      </section>

      {data.expenses.length > 0 && (
        <>
          <section className="block">
            <h2>每个人</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th></th><th>实际付了</th><th>应该承担</th><th>差额</th></tr></thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.id}>
                      <th scope="row">{name(b.id)}</th>
                      <td className="num">{fmt(b.paid, c)}</td>
                      <td className="num">{fmt(b.owed, c)}</td>
                      <td className={`num ${b.net > 0 ? 'pos' : b.net < 0 ? 'neg' : ''}`}>{b.net > 0 ? '+' : ''}{fmt(b.net, c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">差额为正表示多付了，应该收回；为负表示少付了，应该补给别人。</p>
          </section>

          <section className="block">
            <h2>分类</h2>
            <CategoryDonut cats={cats} config={config} size={compact ? 140 : 190} />
          </section>
        </>
      )}
    </div>
  );
}
