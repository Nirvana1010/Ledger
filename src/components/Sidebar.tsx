import type { Config } from '../lib/types';
import { fmt } from '../lib/money';
import { currentMonth, monthLabel } from '../lib/dates';

type Props = {
  months: string[];
  totals: Record<string, number>;
  month: string;
  config: Config;
  meName: string;
  onPick: (m: string) => void;
  onCollapse: () => void;
  onSettings: () => void;
  balanceActive: boolean;
  onBalance: () => void;
};

export function Sidebar({ months, totals, month, config, meName, onPick, onCollapse, onSettings, balanceActive, onBalance }: Props) {
  // 确保当前月和本月总在列表里，哪怕仓库里还没有对应文件
  const list = [...new Set([currentMonth(), month, ...months])].sort((a, b) => b.localeCompare(a));

  return (
    <aside className="side">
      <div className="side-top">
        <span className="side-title">账本</span>
        <button className="icon" onClick={onCollapse} aria-label="收起侧栏">«</button>
      </div>

      <nav className="side-months" aria-label="月份">
        <span className="side-label">月份</span>
        {list.map((m) => (
          <button key={m} className={`side-month ${m === month ? 'on' : ''}`} aria-current={m === month ? 'true' : undefined}
            onClick={() => onPick(m)}>
            <span>{monthLabel(m)}</span>
            <span className="num">{totals[m] !== undefined ? fmt(totals[m], config.currency) : ''}</span>
          </button>
        ))}
      </nav>

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
