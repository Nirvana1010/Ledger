export type Member = { id: string; name: string };

/** 所有金额都以「分」为单位的整数存储，避免浮点误差 */
export type Split =
  | { type: 'equal'; participants: string[] }
  | { type: 'ratio'; weights: Record<string, number> }
  | { type: 'exact'; amounts: Record<string, number> };

export type Expense = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // 分
  payerId: string;
  category: string;
  note: string;
  split: Split;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
};

export type BookColor = 'plum' | 'ochre' | 'indigo' | 'olive' | 'violet' | 'brick';

export type Book = {
  id: string;
  name: string;
  color: BookColor;
  /** monthly = 按月过日子；running = 从头累计（装修、买房这种） */
  mode: 'monthly' | 'running';
  categories: string[];
  /** 备注 → 分类的记忆，键是小写去空格后的备注 */
  noteMap?: Record<string, string>;
  /** 删除的账本只归档，数据留在仓库里 */
  archived?: boolean;
};

export type Config = {
  version: 1;
  currency: string;
  members: Member[];
  /** 旧结构：默认账本的分类。有 books 时以 books 里的为准 */
  categories: string[];
  /** 分类 → 图标名；没指定的分类走内置默认表 */
  categoryIcons?: Record<string, string>;
  books?: Book[];
};

export type MonthData = {
  version: 1;
  month: string; // YYYY-MM
  expenses: Expense[];
  settledAt?: string | null;
  settledBy?: string | null;
};

/** 一次实际转账；余额由支出和转账共同算出，不单独存 */
export type Payment = {
  id: string;
  date: string; // YYYY-MM-DD
  from: string;
  to: string;
  amount: number; // 分
  note: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
};

export type Settlements = {
  version: 1;
  /** 对账起点：这天之前的支出和转账都不计入当前余额 */
  startDate?: string | null;
  payments: Payment[];
};

export type Settings = {
  owner: string;
  repo: string;
  branch: string;
  token: string;
  meId: string;
};

export const DEFAULT_CATEGORIES = [
  '买菜', '餐饮', '房租/房贷', '水电网', '交通', '日用',
  '购物', '宠物', '医疗', '娱乐', '旅行', '其他',
];
