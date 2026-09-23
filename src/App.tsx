import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Config, Expense, MonthData, Settings } from './lib/types';
import { CONFIG_PATH, Store, monthPath } from './lib/github';
import { currentMonth, defaultDateFor, monthLabel, monthOf, shiftMonth } from './lib/dates';
import { fmt } from './lib/money';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseList } from './components/ExpenseList';
import { Summary } from './components/Summary';
import { SettingsView } from './components/SettingsView';

type Tab = 'add' | 'list' | 'settle' | 'settings';
const TABS: [Tab, string][] = [['add', '记一笔'], ['list', '明细'], ['settle', '结算'], ['settings', '设置']];

/** 宽屏（电脑）走左右分栏，窄屏保留标签页 */
function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const on = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

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
  const wide = useWide();

  const meName = config?.members.find((m) => m.id === settings.meId)?.name ?? '有人';

  const saveSettings = (s: Settings) => {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 隐私模式等情况 */ }
  };

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2400);
  };

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
      setData(r?.data ?? emptyMonth(month));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [store, month]);

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
        if (from === month) setData(removed);
      }
      const next = await store.update<MonthData>(monthPath(to), () => emptyMonth(to), (d) => {
        const i = d.expenses.findIndex((x) => x.id === e.id);
        if (i >= 0) d.expenses[i] = e; else d.expenses.push(e);
        d.expenses.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
        return d;
      }, `${meName}: ${original ? '修改' : '新增'} ${summary}`);
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
    if (next) { setData(next); flash('已删除'); }
  }

  async function toggleSettled() {
    if (!store) return;
    const next = await run(() => store.update<MonthData>(monthPath(month), () => emptyMonth(month), (d) => ({
      ...d,
      settledAt: d.settledAt ? null : new Date().toISOString(),
      settledBy: d.settledAt ? null : settings.meId || null,
    }), `${meName}: ${data?.settledAt ? '撤销结清' : '结清'} ${month}`));
    if (next) { setData(next); flash(next.settledAt ? '已标记为结清' : '已撤销结清'); }
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
    <div className="app">
      <header className="top">
        <h1>账本</h1>
        {connected && config && (
          <div className="month-nav">
            <button className="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">‹</button>
            <button className="month" onClick={() => setMonth(currentMonth())} title="回到本月">{monthLabel(month)}</button>
            <button className="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">›</button>
            <button className="icon refresh" onClick={() => { loadMonth(); loadConfig(); }} aria-label="刷新" disabled={loading}>↻</button>
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
            <section className="desk-left">
              <h2 className="page-title">{editing ? '修改这笔' : '记一笔'}</h2>
              {editing ? (
                <ExpenseForm key={editing.id} config={config} meId={settings.meId} defaultDate={editing.date}
                  initial={editing} saving={saving} onSave={saveExpense} onCancel={() => setEditing(null)} />
              ) : (
                <ExpenseForm key={month} config={config} meId={settings.meId} defaultDate={defaultDateFor(month)}
                  saving={saving} onSave={saveExpense} />
              )}
            </section>
            <section className="desk-right">
              <Summary config={config} data={data} saving={saving} onToggleSettled={toggleSettled} />
              <div className="block">
                <h2>明细</h2>
                <ExpenseList config={config} data={data} onEdit={setEditing} onDelete={deleteExpense} />
              </div>
            </section>
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

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
