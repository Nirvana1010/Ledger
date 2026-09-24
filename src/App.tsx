import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Config, Expense, MonthData, Settings } from './lib/types';
import { CONFIG_PATH, Store, monthPath } from './lib/github';
import { currentMonth, defaultDateFor, monthLabel, monthOf, shiftMonth } from './lib/dates';
import { fmt } from './lib/money';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseList } from './components/ExpenseList';
import { Summary } from './components/Summary';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';

type Tab = 'add' | 'list' | 'settle' | 'settings';
const TABS: [Tab, string][] = [['add', '记一笔'], ['list', '明细'], ['settle', '结算'], ['settings', '设置']];

function useMedia(query: string): boolean {
  const [hit, setHit] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setHit(e.matches);
    setHit(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return hit;
}
const SIDEBAR_KEY = 'ledger.sidebar.v1';

const SETTINGS_KEY = 'ledger.settings.v1';
const emptySettings: Settings = { owner: '', repo: '', branch: 'main', token: '', meId: '' };

function loadSettings(): Settings {
  try {
    return { ...emptySettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return emptySettings;
  }
}
const emptyMonth = (month: string): MonthData => ({ version: 1, month, expenses: [], settledAt: null, settledBy: null });

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const connected = !!(settings.owner && settings.repo && settings.token);
  const store = useMemo(
    () => (connected ? new Store(settings) : null),
    [settings.owner, settings.repo, settings.branch, settings.token], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [month, setMonth] = useState(currentMonth);
  const [config, setConfig] = useState<Config | null>(null);
  const [configMissing, setConfigMissing] = useState(false);
  const [data, setData] = useState<MonthData | null>(null);
  const [tab, setTab] = useState<Tab>(connected ? 'add' : 'settings');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const wide = useMedia('(min-width: 1000px)');
  const roomy = useMedia('(min-width: 1180px)');
  const [sideOpen, setSideOpen] = useState(() => localStorage.getItem(SIDEBAR_KEY) !== 'closed');
  const [months, setMonths] = useState<string[]>([]);
  const [monthTotals, setMonthTotals] = useState<Record<string, number>>({});
  const [monthSettled, setMonthSettled] = useState<Record<string, boolean>>({});
  const showSide = wide && roomy && sideOpen && tab !== 'settings';

  const toggleSide = (open: boolean) => {
    setSideOpen(open);
    try { localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed'); } catch { /* 忽略 */ }
  };

  const meName = config?.members.find((m) => m.id === settings.meId)?.name ?? '有人';

  const saveSettings = (s: Settings) => {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 隐私模式等情况 */ }
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2400);
  };

  /** 某个月的数据变了就同步侧栏：列表、总额、结清状态 */
  const noteMonth = useCallback((m: string, d: MonthData | null) => {
    setMonths((list) => (list.includes(m) ? list : [...list, m].sort((a, b) => b.localeCompare(a))));
    if (!d) return;
    setMonthTotals((t) => ({ ...t, [m]: d.expenses.reduce((a, e) => a + e.amount, 0) }));
    setMonthSettled((x) => ({ ...x, [m]: !!d.settledAt }));
  }, []);

  const loadConfig = useCallback(async () => {
    if (!store) return;
    try {
      const r = await store.read<Config>(CONFIG_PATH);
      setConfig(r?.data ?? null);
      setConfigMissing(!r);
      if (!r) setTab('settings');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [store]);

  const loadMonth = useCallback(async (quiet = false) => {
    if (!store) return;
    if (!quiet) setLoading(true);
    try {
      const r = await store.read<MonthData>(monthPath(month));
      const d = r?.data ?? emptyMonth(month);
      setData(d);
      // 仓库里还没有这个月的文件就先不进侧栏列表，免得出现一堆 $0.00 的空月份
      if (r) noteMonth(month, d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [store, month, noteMonth]);

  const loadMonths = useCallback(async () => {
    if (!store) return;
    try {
      const list = await store.listMonths();
      setMonths(list);
      const recent = list.slice(0, 12);
      const results = await Promise.all(recent.map(async (m) => {
        try {
          const r = await store.read<MonthData>(monthPath(m));
          return [m, r?.data] as const;
        } catch { return [m, undefined] as const; }
      }));
      const totals: Record<string, number> = {};
      const settled: Record<string, boolean> = {};
      for (const [m, d] of results) {
        if (!d) continue;
        totals[m] = d.expenses.reduce((a, e) => a + e.amount, 0);
        settled[m] = !!d.settledAt;
      }
      setMonthTotals((t) => ({ ...t, ...totals }));
      setMonthSettled((x) => ({ ...x, ...settled }));
    } catch { /* 侧栏是附加信息，失败就不显示总额 */ }
  }, [store]);

  useEffect(() => { if (showSide) loadMonths(); }, [showSide, loadMonths]);

  useEffect(() => { setConfig(null); setConfigMissing(false); loadConfig(); }, [loadConfig]);
  useEffect(() => { setData(null); loadMonth(); }, [loadMonth]);

  // 切回页面时静默刷新，拿到对方刚记的账
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') { loadMonth(true); loadConfig(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadMonth, loadConfig]);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setSaving(true);
    try {
      const r = await fn();
      setError(null);
      return r;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setSaving(false);
    }
  }

  async function saveExpense(e: Expense, original?: Expense): Promise<boolean> {
    if (!store || !config) return false;
    const to = monthOf(e.date);
    const from = original ? monthOf(original.date) : null;
    if (!original && data?.settledAt && to === month && !confirm('这个月已经标记为结清，还要继续记账吗？')) return false;
    const summary = `${e.category} ${fmt(e.amount, config.currency)}`;
    const ok = await run(async () => {
      if (from && from !== to) {
        const removed = await store.update<MonthData>(monthPath(from), () => emptyMonth(from),
          (d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }), `${meName}: 移动 ${summary} 到 ${to}`);
        noteMonth(from, removed);
        if (from === month) setData(removed);
      }
      const next = await store.update<MonthData>(monthPath(to), () => emptyMonth(to), (d) => {
        const i = d.expenses.findIndex((x) => x.id === e.id);
        if (i >= 0) d.expenses[i] = e; else d.expenses.push(e);
        d.expenses.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
        return d;
      }, `${meName}: ${original ? '修改' : '新增'} ${summary}`);
      noteMonth(to, next);
      if (to === month) setData(next);
      return true;
    });
    if (ok) {
      flash(original ? '已保存修改' : to === month ? `已记下 ${summary}` : `已记到 ${monthLabel(to)}`);
      if (original) { setEditing(null); setTab('list'); }
    }
    return !!ok;
  }

  async function deleteExpense(e: Expense) {
    if (!store || !config) return;
    if (!confirm(`删除「${e.note || e.category}」${fmt(e.amount, config.currency)}？`)) return;
    const m = monthOf(e.date);
    const next = await run(() => store.update<MonthData>(monthPath(m), () => emptyMonth(m),
      (d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }),
      `${meName}: 删除 ${e.category} ${fmt(e.amount, config.currency)}`));
    if (next) { noteMonth(m, next); if (m === month) setData(next); flash('已删除'); }
  }

  async function toggleSettled() {
    if (!store) return;
    const next = await run(() => store.update<MonthData>(monthPath(month), () => emptyMonth(month), (d) => ({
      ...d,
      settledAt: d.settledAt ? null : new Date().toISOString(),
      settledBy: d.settledAt ? null : settings.meId || null,
    }), `${meName}: ${data?.settledAt ? '撤销结清' : '结清'} ${month}`));
    if (next) { setData(next); noteMonth(month, next); flash(next.settledAt ? '已标记为结清' : '已撤销结清'); }
  }

  async function saveConfig(c: Config): Promise<boolean> {
    if (!store) return false;
    const next = await run(() => store.update<Config>(CONFIG_PATH, () => c, () => c, `${meName}: 更新设置`));
    if (next) {
      setConfig(next);
      if (configMissing) { setConfigMissing(false); flash('账本已创建'); }
      else flash('设置已保存');
    }
    return !!next;
  }

  const ready = connected && config && data;
  const needMe = config && !config.members.some((m) => m.id === settings.meId);

  return (
    <div className={`app ${showSide ? 'with-side' : ''}`}>
      {showSide && config && (
        <Sidebar months={months}
          totals={data ? { ...monthTotals, [month]: data.expenses.reduce((a, e) => a + e.amount, 0) } : monthTotals} settled={data ? { ...monthSettled, [month]: !!data.settledAt } : monthSettled} month={month} config={config}
          meName={meName} onPick={setMonth} onCollapse={() => toggleSide(false)} onSettings={() => setTab('settings')} />
      )}
      <div className="app-body">
      <header className="top">
        {!showSide && <h1>账本</h1>}
        {connected && config && (
          <div className="month-nav">
            {wide && roomy && !sideOpen && tab !== 'settings' && (
              <button className="icon" onClick={() => toggleSide(true)} aria-label="展开侧栏">»</button>
            )}
            <button className="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">‹</button>
            <button className={`month ${showSide ? 'big' : ''}`} onClick={() => setMonth(currentMonth())} title="回到本月">{monthLabel(month)}</button>
            <button className="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">›</button>
            <button className="icon refresh" onClick={() => { loadMonth(); loadConfig(); if (showSide) loadMonths(); }} aria-label="刷新" disabled={loading}>↻</button>
            {wide && (
              <button className="ghost small" onClick={() => setTab(tab === 'settings' ? 'add' : 'settings')}>
                {tab === 'settings' ? '返回账本' : '设置'}
              </button>
            )}
          </div>
        )}
      </header>

      {!wide && (
      <nav className="tabs" aria-label="页面">
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined}
            disabled={k !== 'settings' && !ready}
            onClick={() => { setTab(k); setEditing(null); }}>
            {label}
            {k === 'settle' && data?.settledAt && <span className="dot" aria-label="已结清" />}
          </button>
        ))}
      </nav>
      )}

      <main>
        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <button className="link" onClick={() => setError(null)}>知道了</button>
          </div>
        )}
        {needMe && tab !== 'settings' && (
          <div className="banner">
            <span>先告诉账本你是谁，记账时会默认由你付款。</span>
            <button className="link" onClick={() => setTab('settings')}>去设置</button>
          </div>
        )}
        {data?.settledAt && (tab === 'add' || wide) && (
          <div className="banner quiet"><span>{monthLabel(month)} 已结清。</span></div>
        )}

        {tab === 'settings' || !connected ? (
          <SettingsView settings={settings} config={config} configMissing={configMissing} saving={saving}
            onSaveSettings={saveSettings} onSaveConfig={saveConfig} />
        ) : !ready ? (
          <p className="empty">{loading || !error ? '正在读取账本…' : '读取失败。'}</p>
        ) : wide ? (
          <div className="desk">
            <ExpenseForm key={editing ? editing.id : month} layout="bar" config={config} meId={settings.meId}
              defaultDate={editing ? editing.date : defaultDateFor(month)} initial={editing}
              saving={saving} onSave={saveExpense} onCancel={editing ? () => setEditing(null) : undefined} />
            <div className="desk-cols">
              <section className="desk-main">
                <h2 className="block-title">本月明细</h2>
                <ExpenseList config={config} data={data} variant="table" onEdit={setEditing} onDelete={deleteExpense} />
              </section>
              <section className="desk-aside">
                <Summary config={config} data={data} saving={saving} onToggleSettled={toggleSettled} compact />
              </section>
            </div>
          </div>
        ) : editing ? (
          <>
            <h2 className="page-title">修改这笔</h2>
            <ExpenseForm key={editing.id} config={config} meId={settings.meId} defaultDate={editing.date}
              initial={editing} saving={saving} onSave={saveExpense} onCancel={() => setEditing(null)} />
          </>
        ) : tab === 'add' ? (
          <ExpenseForm key={month} config={config} meId={settings.meId} defaultDate={defaultDateFor(month)}
            saving={saving} onSave={saveExpense} />
        ) : tab === 'list' ? (
          <ExpenseList config={config} data={data} onEdit={setEditing} onDelete={deleteExpense} />
        ) : (
          <Summary config={config} data={data} saving={saving} onToggleSettled={toggleSettled} />
        )}
      </main>

      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
