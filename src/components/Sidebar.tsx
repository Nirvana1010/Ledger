import type { Book, Config } from '../lib/types';
import { fmt } from '../lib/money';
import { currentMonth, monthLabel } from '../lib/dates';

type Props = {
  books: Book[];
  book: Book;
  bookBalances: Record<string, number>;
  months: string[];
  totals: Record<string, number>;
  month: string;
  years: string[];
  yearTotals: Record<string, number>;
  range: string;
  config: Config;
  meName: string;
  balanceActive: boolean;
  onSwitchBook: (id: string) => void;
  onPick: (m: string) => void;
  onPickRange: (r: string) => void;
  onCollapse: () => void;
  onSettings: () => void;
  onBalance: () => void;
};

export function Sidebar({
  books, book, bookBalances, months, totals, month, years, yearTotals, range,
  config, meName, balanceActive, onSwitchBook, onPick, onPickRange, onCollapse, onSettings, onBalance,
}: Props) {
  const c = config.currency;
  const list = [...new Set([currentMonth(), month, ...months])].sort((a, b) => b.localeCompare(a));

  return (
    <aside className="side">
      <div className="side-top">
        <span className="side-title">账本</span>
        <button className="icon" onClick={onCollapse} aria-label="收起侧栏">«</button>
      </div>

      <nav className="side-books" aria-label="账本">
        {books.map((b) => (
          <button key={b.id} className={`side-book ${b.id === book.id ? 'on' : ''}`}
            aria-current={b.id === book.id ? 'true' : undefined} onClick={() => onSwitchBook(b.id)}>
            <span className="side-book-name">
              <span className={`book-dot color-${b.color}`} />{b.name}
            </span>
            {bookBalances[b.id] !== undefined && bookBalances[b.id] !== 0 && (
              <span className="num">{fmt(Math.abs(bookBalances[b.id]), c)}</span>
            )}
          </button>
        ))}
      </nav>

      {book.mode === 'monthly' ? (
        <nav className="side-months" aria-label="月份">
          <span className="side-label">月份</span>
          {list.map((m) => (
            <button key={m} className={`side-month ${m === month && !balanceActive ? 'on' : ''}`}
              aria-current={m === month ? 'true' : undefined} onClick={() => onPick(m)}>
              <span>{monthLabel(m)}</span>
              <span className="num">{totals[m] !== undefined ? fmt(totals[m], c) : ''}</span>
            </button>
          ))}
        </nav>
      ) : (
        <nav className="side-months" aria-label="时间范围">
          <span className="side-label">时间范围</span>
          {['all', ...years].map((r) => (
            <button key={r} className={`side-month ${r === range && !balanceActive ? 'on' : ''}`}
              aria-current={r === range ? 'true' : undefined} onClick={() => onPickRange(r)}>
              <span>{r === 'all' ? '全部' : `${r} 年`}</span>
              <span className="num">{yearTotals[r] !== undefined ? fmt(yearTotals[r], c) : ''}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="side-settle">
        <span className="side-label">结算</span>
        <button className={`side-month ${balanceActive ? 'on' : ''}`} onClick={onBalance}>
          <span>当前余额</span>
        </button>
      </div>

      <div className="side-foot">
        <span className="side-label">当前身份</span>
        <span className="side-me">{meName}</span>
        <button className="link" onClick={onSettings}>设置</button>
      </div>
    </aside>
  );
}
