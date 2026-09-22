import { describe, expect, it } from 'vitest';
import { computeBalances, computeShares, computeTransfers } from './settle';
import { parseAmount } from './money';
import type { Expense } from './types';

const members = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const ex = (p: Partial<Expense>): Expense => ({
  id: Math.random().toString(), date: '2026-09-01', amount: 0, payerId: 'a', category: '其他',
  note: '', split: { type: 'equal', participants: ['a', 'b'] }, createdBy: 'a', createdAt: '', ...p,
});

describe('shares', () => {
  it('平分有余数时总和不变', () => {
    const s = computeShares({ amount: 1000, split: { type: 'equal', participants: ['a', 'b', 'c'] } });
    expect(Object.values(s).reduce((x, y) => x + y)).toBe(1000);
  });
  it('按比例', () => {
    expect(computeShares({ amount: 1000, split: { type: 'ratio', weights: { a: 3, b: 1 } } })).toEqual({ a: 750, b: 250 });
  });
});

describe('settle', () => {
  it('两人：A 付 100 平分，B 付 40 只算 A', () => {
    const b = computeBalances([
      ex({ amount: 10000 }),
      ex({ amount: 4000, payerId: 'b', split: { type: 'equal', participants: ['a'] } }),
    ], members.slice(0, 2));
    expect(computeTransfers(b)).toEqual([{ from: 'b', to: 'a', amount: 1000 }]);
  });
  it('三人转账总额守恒', () => {
    const b = computeBalances([
      ex({ amount: 9000, split: { type: 'equal', participants: ['a', 'b', 'c'] } }),
      ex({ amount: 3000, payerId: 'b', split: { type: 'equal', participants: ['a', 'b', 'c'] } }),
    ], members);
    const t = computeTransfers(b);
    expect(t.reduce((x, y) => x + y.amount, 0)).toBe(5000);
  });
});

describe('parseAmount', () => {
  it('支持加减', () => {
    expect(parseAmount('23.5+12-3')).toBe(3250);
    expect(parseAmount('1,234.56')).toBe(123456);
    expect(parseAmount('abc')).toBeNull();
  });
});
