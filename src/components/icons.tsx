/** 24×24 线性图标，只存路径，按 currentColor 描边 */
export type IconName =
  | 'cart' | 'utensils' | 'coffee' | 'home' | 'bolt' | 'droplet' | 'car' | 'bag'
  | 'bottle' | 'paw' | 'medical' | 'ticket' | 'plane' | 'gift' | 'book'
  | 'dumbbell' | 'phone' | 'tools' | 'receipt';

const PATHS: Record<IconName, string[]> = {
  cart: ['M2.5 4h2.2l2.4 10.3a2 2 0 0 0 2 1.5h7.3a2 2 0 0 0 1.9-1.4L21 7.5H5.8',
    'M9.2 17.6a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4', 'M17.4 17.6a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4'],
  utensils: ['M6.5 3v5.5a2 2 0 0 0 4 0V3', 'M8.5 10.5V21', 'M17.5 21V3c-1.7 1.2-2.5 3-2.5 5.5s.8 3.5 2.5 3.5'],
  coffee: ['M4 8h12v6.5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z', 'M16 9.5h1.8a2.8 2.8 0 0 1 0 5.5H16', 'M7 2.5v2', 'M11 2v2.5', 'M15 2.5v2'],
  home: ['M3.7 10.6 12 3.8l8.3 6.8V20a1 1 0 0 1-1 1H4.7a1 1 0 0 1-1-1z', 'M9.6 21v-6.1h4.8V21'],
  bolt: ['M13.4 2.5 4.8 13.8h6.2l-1.4 7.7 8.6-11.3h-6.2z'],
  droplet: ['M12 3.2c3.4 3.6 5.6 6.6 5.6 9.4A5.6 5.6 0 0 1 6.4 12.6c0-2.8 2.2-5.8 5.6-9.4z'],
  car: ['M3.5 16.5v-3.7a2 2 0 0 1 .2-.9l2.4-4.6a2 2 0 0 1 1.8-1.1h8.2a2 2 0 0 1 1.8 1.1l2.4 4.6a2 2 0 0 1 .2.9v3.7z',
    'M5 16.5V19', 'M19 16.5V19', 'M7.6 14.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8', 'M16.4 14.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8'],
  bag: ['M4.6 8h14.8l.9 11.9a1 1 0 0 1-1 1.1H4.7a1 1 0 0 1-1-1.1z', 'M8.8 8V6.2a3.2 3.2 0 0 1 6.4 0V8'],
  bottle: ['M10 2.8h4v2.6l1.9 3V20a1 1 0 0 1-1 1H9.1a1 1 0 0 1-1-1V8.4l1.9-3z', 'M8.1 12.5h7.8'],
  paw: ['M12 13.5c2.4 0 4.3 1.8 4.3 3.9 0 1.6-1.2 2.6-2.8 2.6h-3c-1.6 0-2.8-1-2.8-2.6 0-2.1 1.9-3.9 4.3-3.9',
    'M7 7.5a1.6 2 0 1 0 0 4 1.6 2 0 0 0 0-4', 'M17 7.5a1.6 2 0 1 0 0 4 1.6 2 0 0 0 0-4',
    'M10.2 3.5a1.5 2 0 1 0 0 4 1.5 2 0 0 0 0-4', 'M13.8 3.5a1.5 2 0 1 0 0 4 1.5 2 0 0 0 0-4'],
  medical: ['M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6', 'M12 8.2v7.6', 'M8.2 12h7.6'],
  ticket: ['M4 8.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1 0 3 2 2 0 0 0 0 4H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4 2 2 0 0 1 0-3 2 2 0 0 0 0-4z',
    'M14.5 6.5v2', 'M14.5 11v2', 'M14.5 15.5v2'],
  plane: ['M20.6 3.4 3.2 10.6l6.6 2.8 2.8 6.6z', 'M20.6 3.4 9.8 13.4'],
  gift: ['M4.2 11.5h15.6V20a1 1 0 0 1-1 1H5.2a1 1 0 0 1-1-1z', 'M3 7.5h18v4H3z', 'M12 7.5V21',
    'M12 7.5S10.6 3 8.4 3a2.2 2.2 0 0 0 0 4.5', 'M12 7.5S13.4 3 15.6 3a2.2 2.2 0 0 1 0 4.5'],
  book: ['M4.5 5a2.5 2.5 0 0 1 2.5-2.5h12.5V19H7A2.5 2.5 0 0 0 4.5 21.5z', 'M8 6.5h8'],
  dumbbell: ['M3 9.5v5', 'M6.5 6.5v11', 'M17.5 6.5v11', 'M21 9.5v5', 'M6.5 12h11'],
  phone: ['M7.2 2.6h9.6a1 1 0 0 1 1 1v16.8a1 1 0 0 1-1 1H7.2a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1z', 'M10.3 18.4h3.4'],
  tools: ['M14.6 3.4a4.4 4.4 0 0 1 5.6 5.6l-3-3-2.6 2.6z', 'M14.6 8.6 4.6 18.6a2.1 2.1 0 1 0 2.9 2.9l10-10'],
  receipt: ['M5.8 2.6h12.4v18.8l-3.1-2-3.1 2-3.1-2-3.1 2z', 'M9 7.5h6', 'M9 11.5h6', 'M9 15.5h4'],
};

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

/** 预设分类的默认图标；自定义分类用票据图标，可在设置里单独指定 */
const DEFAULTS: Record<string, IconName> = {
  '买菜': 'cart', '超市': 'cart', '餐饮': 'utensils', '外卖': 'utensils', '咖啡': 'coffee',
  '房租/房贷': 'home', '房租': 'home', '房贷': 'home', '家居': 'tools', '维修': 'tools',
  '水电网': 'bolt', '水费': 'droplet', '电费': 'bolt', '话费': 'phone',
  '交通': 'car', '加油': 'car', '日用': 'bottle', '购物': 'bag', '宠物': 'paw',
  '医疗': 'medical', '娱乐': 'ticket', '旅行': 'plane', '礼物': 'gift',
  '学习': 'book', '健身': 'dumbbell', '其他': 'receipt',
};

export function iconFor(category: string, custom?: Record<string, IconName>): IconName {
  return custom?.[category] ?? DEFAULTS[category] ?? 'receipt';
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {(PATHS[name] ?? PATHS.receipt).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
