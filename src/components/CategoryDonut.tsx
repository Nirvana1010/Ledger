import type { Config } from '../lib/types';
import { fmt } from '../lib/money';
import { Icon, iconFor, type IconName } from './icons';

type Slice = { category: string; total: number };

/** 最多画 6 块，剩下的合并成「其他」，不然饼图会碎成没法看 */
const MAX_SLICES = 6;

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function CategoryDonut({ cats, config, size = 190 }: { cats: Slice[]; config: Config; size?: number }) {
  const total = cats.reduce((a, s) => a + s.total, 0);
  if (!total) return null;

  // 只多出一类时不值得合并，直接画出来
  const cut = cats.length === MAX_SLICES + 1 ? MAX_SLICES + 1 : MAX_SLICES;
  const head = cats.slice(0, cut);
  const tail = cats.slice(cut);
  const slices: (Slice & { merged?: boolean })[] = tail.length
    ? [...head, { category: `其他 ${tail.length} 类`, total: tail.reduce((a, s) => a + s.total, 0), merged: true }]
    : head;

  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const gap = slices.length > 1 ? 0.035 : 0;
  let angle = -Math.PI / 2;

  const drawn = slices.map((s, i) => {
    const sweep = (s.total / total) * Math.PI * 2;
    const from = angle + gap / 2;
    const to = angle + sweep - gap / 2;
    angle += sweep;
    return {
      ...s,
      color: `var(--c${(i % 7) + 1})`,
      pct: Math.round((s.total / total) * 100),
      d: to > from ? arc(cx, cy, r, from, to) : null,
      icon: s.merged ? ('receipt' as IconName) : iconFor(s.category, config.categoryIcons as Record<string, IconName>),
    };
  });

  const top = drawn[0];

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
          aria-label={`分类占比：${drawn.map((s) => `${s.category} ${s.pct}%`).join('，')}`}>
          {drawn.map((s, i) => s.d && (
            <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={22} strokeLinecap="butt" />
          ))}
        </svg>
        <div className="donut-center">
          <span className="donut-top">{top.category}</span>
          <strong className="num">{top.pct}%</strong>
        </div>
      </div>
      <ul className="legend">
        {drawn.map((s, i) => (
          <li key={i}>
            <span className="legend-dot" style={{ background: s.color }} />
            <span className="legend-icon"><Icon name={s.icon} size={16} /></span>
            <span className="legend-name">{s.category}</span>
            <span className="legend-val num">{fmt(s.total, config.currency)}</span>
            <span className="legend-pct num">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
