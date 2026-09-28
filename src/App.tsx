import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Book, Config, Expense, MonthData, Payment, Settings, Settlements } from './lib/types';
import { CONFIG_PATH, DEFAULT_BOOK, Store, monthPath, settlementsPath } from './lib/github';
import { bookConfig, findBook, getBooks, getBooksRaw, noteKey } from './lib/books';
import { monthMarks } from './lib/settle';
import { currentMonth, defaultDateFor, monthLabel, monthOf, shiftMonth, today } from './lib/dates';
import { fmt } from './lib/money';
import { ExpenseForm } from './components/ExpenseForm';
import { ExpenseList } from './components/ExpenseList';
import { Summary } from './components/Summary';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { BalancePage } from './components/BalancePage';
import { RunningSummary } from './components/RunningSummary';

type Tab = 'add' | 'list' | 'settle' | 'settings' | 'balance';
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
const BOOK_KEY = 'ledger.book.v1';
const VIEW_KEY = 'ledger.bookview.v1';

/** 每本记住上次看的月份 / 年份 */
function loadViews(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'); } catch { return {}; }
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
const emptySettlements = (): Settlements => ({ version: 1, startDate: null, payments: [] });
const emptyMonth = (month: string): MonthData => ({ version: 1, month, expenses: [], settledAt: null, settledBy: null });

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const connected = !!(settings.owner && settings.repo && settings.token);
  const store = useMemo(
    () => (connected ? new Store(settings) : null),
    [settings.owner, settings.repo, settings.branch, settings.token], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const [bookId, setBookId] = useState(() => localStorage.getItem(BOOK_KEY) || DEFAULT_BOOK);
  const [views, setViews] = useState<Record<string, string>>(loadViews);
  const [month, setMonth] = useState(currentMonth);
  const [range, setRange] = useState('all');
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
  const [settlements, setSettlements] = useState<Settlements>(emptySettlements);
  const [monthsData, setMonthsData] = useState<Record<string, MonthData>>({});
  const [balanceLoading, setBalanceLoading] = useState(false);
  const showSide = wide && roomy && sideOpen && tab !== 'settings';

  const toggleSide = (open: boolean) => {
    setSideOpen(open);
    try { localStorage.setItem(SIDEBAR_KEY, open ? 'open' : 'closed'); } catch { /* 忽略 */ }
  };

  const books: Book[] = config ? getBooks(config) : [];
  const book: Book | null = config ? findBook(config, bookId) : null;
  const running = book?.mode === 'running';
  const viewConfig = config && book ? bookConfig(config, book) : config;
  const meName = config?.members.find((m) => m.id === settings.meId)?.name ?? '有人';

  /** 切账本：记住上一本看到哪儿，恢复新一本上次的位置 */
  const switchBook = (id: string) => {
    if (id === bookId) return;
    const nextViews = { ...views, [bookId]: running ? range : month };
    setViews(nextViews);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(nextViews));
      localStorage.setItem(BOOK_KEY, id);
    } catch { /* 隐私模式 */ }
    const target = config ? findBook(config, id) : null;
    const saved = nextViews[id];
    if (target?.mode === 'running') setRange(saved && saved !== 'all' ? saved : 'all');
    else setMonth(saved && /^\d{4}-\d{2}$/.test(saved) ? saved : currentMonth());
    setBookId(id);
    setEditing(null);
    setMonthsData({});
    setTab(tab === 'settings' ? 'settings' : 'add');
  };

  /** 当前视图里的账目：按月账本是当月，累计账本是全部（可按年筛） */
  const viewExpenses: Expense[] = running
    ? Object.values(monthsData).flatMap((d) => d.expenses)
        .filter((e) => range === 'all' || e.date.slice(0, 4) === range)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    : (data?.expenses ?? []);

  const years = [...new Set(Object.keys(monthsData).map((m) => m.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  const yearTotals: Record<string, number> = { all: 0 };
  for (const d of Object.values(monthsData)) {
    const y = d.month.slice(0, 4);
    const sum = d.expenses.reduce((a, e) => a + e.amount, 0);
    yearTotals[y] = (yearTotals[y] ?? 0) + sum;
    yearTotals.all += sum;
  }
  const bookBalances: Record<string, number> = {};
  // 结清标记要全量数据才准；侧栏只拉了最近 12 个月，更早的先不标
  const noteSuggestions = (() => {
    const pool = [...Object.values(monthsData).flatMap((d) => d.expenses), ...(data?.expenses ?? [])]
      .filter((e) => e.note.trim())
      .sort((a, b) => b.date.localeCompare(a.date));
    const seen = new Set<string>();
    const out: { note: string; category: string }[] = [];
    for (const e of pool) {
      const k = noteKey(e.note);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ note: e.note.trim(), category: e.category });
      if (out.length === 80) break;
    }
    return out;
  })();

  const marks = config && settings.meId
    ? monthMarks(monthsData, settlements.payments, settings.meId, settlements.startDate)
    : {};

  const saveSettings = (s: Settings) => {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* 隐私模式等情况 */ }
  };

  useEffect(() => {
    document.documentElement.dataset.book = book?.color ?? 'plum';
  }, [book?.color]);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2400);
  };

  /** 某个月的数据变了就同步侧栏：列表、总额、结清状态 */
  const noteMonth = useCallback((m: string, d: MonthData | null) => {
    setMonths((list) => (list.includes(m) ? list : [...list, m].sort((a, b) => b.localeCompare(a))));
    if (!d) return;
    setMonthsData((map) => ({ ...map, [m]: d }));
    setMonthTotals((t) => ({ ...t, [m]: d.expenses.reduce((a, e) => a + e.amount, 0) }));
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
      const r = await store.read<MonthData>(monthPath(month, bookId));
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
  }, [store, month, bookId, noteMonth]);

  const loadSettlements = useCallback(async () => {
    if (!store) return;
    try {
      const r = await store.read<Settlements>(settlementsPath(bookId));
      setSettlements(r?.data ?? emptySettlements());
    } catch { /* 还没结算过就是空的 */ }
  }, [store, bookId]);

  /** 结算页要算跨月余额，把所有月份的文件都拉下来 */
  const loadAllMonths = useCallback(async () => {
    if (!store) return;
    setBalanceLoading(true);
    try {
      const list = await store.listMonths(bookId);
      setMonths(list);
      const entries = await Promise.all(list.map(async (m) => {
        try {
          const r = await store.read<MonthData>(monthPath(m, bookId));
          return r ? ([m, r.data] as const) : null;
        } catch { return null; }
      }));
      const map: Record<string, MonthData> = {};
      for (const e of entries) if (e) map[e[0]] = e[1];
      setMonthsData(map);
      setMonthTotals((t) => ({ ...t, ...Object.fromEntries(Object.entries(map).map(([m, d]) => [m, d.expenses.reduce((a, x) => a + x.amount, 0)])) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBalanceLoading(false);
    }
  }, [store, bookId]);

  const loadMonths = useCallback(async () => {
    if (!store) return;
    try {
      const list = await store.listMonths(bookId);
      setMonths(list);
      const recent = list.slice(0, 12);
      const results = await Promise.all(recent.map(async (m) => {
        try {
          const r = await store.read<MonthData>(monthPath(m, bookId));
          return [m, r?.data] as const;
        } catch { return [m, undefined] as const; }
      }));
      const totals: Record<string, number> = {};
      const map: Record<string, MonthData> = {};
      for (const [m, d] of results) {
        if (!d) continue;
        totals[m] = d.expenses.reduce((a, e) => a + e.amount, 0);
        map[m] = d;
      }
      setMonthTotals((t) => ({ ...t, ...totals }));
      setMonthsData((x) => ({ ...x, ...map }));
    } catch { /* 侧栏是附加信息，失败就不显示总额 */ }
  }, [store, bookId]);

  useEffect(() => { if (showSide) { loadMonths(); loadSettlements(); } }, [showSide, loadMonths, loadSettlements]);
  // 累计账本要一次拿到所有月份
  useEffect(() => { if (running) loadAllMonths(); }, [running, loadAllMonths]);

  useEffect(() => { setConfig(null); setConfigMissing(false); loadConfig(); loadSettlements(); }, [loadConfig, loadSettlements]);
  useEffect(() => { if (tab === 'balance') { loadAllMonths(); loadSettlements(); } }, [tab, loadAllMonths, loadSettlements]);
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
    const summary = `${e.category} ${fmt(e.amount, config.currency)}`;
    const ok = await run(async () => {
      if (from && from !== to) {
        const removed = await store.update<MonthData>(monthPath(from, bookId), () => emptyMonth(from),
          (d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }), `${meName}: 移动 ${summary} 到 ${to}`);
        noteMonth(from, removed);
        if (from === month) setData(removed);
      }
      const next = await store.update<MonthData>(monthPath(to, bookId), () => emptyMonth(to), (d) => {
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
      learnNote(e);
      flash(original ? '已保存修改' : to === month ? `已记下 ${summary}` : `已记到 ${monthLabel(to)}`);
      if (original) { setEditing(null); setTab('list'); }
    }
    return !!ok;
  }

  /** 记住这条备注对应哪个分类，下次输入同样的备注自动选中 */
  function learnNote(e: Expense) {
    if (!store || !config || !book) return;
    const key = noteKey(e.note);
    if (!key || book.noteMap?.[key] === e.category) return;
    const updated: Config = {
      ...config,
      books: getBooksRaw(config).map((b) =>
        b.id === book.id ? { ...b, noteMap: { ...(b.noteMap ?? {}), [key]: e.category } } : b),
    };
    setConfig(updated);
    // 后台写，失败也不打断记账
    store.update<Config>(CONFIG_PATH, () => updated, (d) => ({
      ...d,
      books: (d.books ?? getBooksRaw(config)).map((b) =>
        b.id === book.id ? { ...b, noteMap: { ...(b.noteMap ?? {}), [key]: e.category } } : b),
    }), `${meName}: 记住「${e.note.trim()}」→ ${e.category}`).catch(() => { /* 下次再说 */ });
  }

  /** 把一笔账挪到另一个账本：原账本删掉，目标账本写入 */
  async function moveExpense(e: Expense, toBook: string) {
    if (!store || !config || toBook === bookId) return;
    const m = monthOf(e.date);
    const target = findBook(config, toBook);
    const ok = await run(async () => {
      await store.update<MonthData>(monthPath(m, bookId), () => emptyMonth(m),
        (d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }), `${meName}: 移出 ${e.category}`);
      const toPath = `${monthPath(m, toBook)}`;
      await store.update<MonthData>(toPath, () => emptyMonth(m), (d) => {
        d.expenses.push(e);
        d.expenses.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
        return d;
      }, `${meName}: 移入 ${e.category}`);
      return true;
    });
    if (ok) {
      setEditing(null);
      flash(`已移到「${target.name}」`);
      if (running) loadAllMonths(); else loadMonth();
    }
  }

  async function deleteExpense(e: Expense) {
    if (!store || !config) return;
    if (!confirm(`删除「${e.note || e.category}」${fmt(e.amount, config.currency)}？`)) return;
    const m = monthOf(e.date);
    const next = await run(() => store.update<MonthData>(monthPath(m, bookId), () => emptyMonth(m),
      (d) => ({ ...d, expenses: d.expenses.filter((x) => x.id !== e.id) }),
      `${meName}: 删除 ${e.category} ${fmt(e.amount, config.currency)}`));
    if (next) { noteMonth(m, next); if (m === month) setData(next); flash('已删除'); }
  }

  async function savePayment(p: Payment): Promise<boolean> {
    if (!store || !config) return false;
    const next = await run(() => store.update<Settlements>(settlementsPath(bookId), emptySettlements, (d) => {
      const list = d.payments ?? [];
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = p; else list.push(p);
      list.sort((a, b) => a.date.localeCompare(b.date));
      return { ...d, payments: list };
    }, `${meName}: ${p.from === settings.meId ? '转出' : '收到'} ${fmt(p.amount, config.currency)}`));
    if (next) { setSettlements(next); flash(p.updatedAt ? '已保存修改' : '已记下转账'); }
    return !!next;
  }

  async function deletePayment(p: Payment) {
    if (!store || !config) return;
    if (!confirm(`删除这笔 ${fmt(p.amount, config.currency)} 的转账？余额会跟着变。`)) return;
    const next = await run(() => store.update<Settlements>(settlementsPath(bookId), emptySettlements,
      (d) => ({ ...d, payments: (d.payments ?? []).filter((x) => x.id !== p.id) }),
      `${meName}: 删除一笔转账`));
    if (next) { setSettlements(next); flash('已删除'); }
  }

  async function setStartDate(d: string | null) {
    if (!store) return;
    const next = await run(() => store.update<Settlements>(settlementsPath(bookId), emptySettlements,
      (s0) => ({ ...s0, startDate: d }), `${meName}: 设置对账起点 ${d ? d.slice(0, 7) : '不限'}`));
    if (next) { setSettlements(next); flash('已更新对账起点'); }
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

  const ready = connected && config && (running ? true : !!data);
  const needMe = config && !config.members.some((m) => m.id === settings.meId);

  return (
    <div className={`app ${showSide ? 'with-side' : ''}`}>
      {showSide && config && (
        <Sidebar books={books} book={book!} bookBalances={bookBalances}
          months={months} marks={marks}
          totals={data && !running ? { ...monthTotals, [month]: data.expenses.reduce((a, e) => a + e.amount, 0) } : monthTotals}
          month={month} years={years} yearTotals={yearTotals} range={range}
          config={config} meName={meName}
          balanceActive={tab === 'balance'}
          onSwitchBook={switchBook}
          onPick={(m) => { setMonth(m); setTab('add'); }}
          onPickRange={(r) => { setRange(r); setTab('add'); }}
          onCollapse={() => toggleSide(false)}
          onSettings={() => setTab('settings')}
          onBalance={() => setTab('balance')} />
      )}
      <div className="app-body">
      <header className="top">
        {!showSide && <h1>账本</h1>}
        {connected && config && (
          <div className="month-nav">
            {wide && roomy && !sideOpen && tab !== 'settings' && (
              <button className="icon" onClick={() => toggleSide(true)} aria-label="展开侧栏">»</button>
            )}
            {!showSide && books.length > 1 && (
              <select className="book-select top-book" value={bookId} onChange={(e) => switchBook(e.target.value)} aria-label="账本">
                {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {running ? (
              <span className={`month ${showSide ? 'big' : ''}`}>{book?.name} · {range === 'all' ? '全部' : `${range} 年`}</span>
            ) : (
              <>
                <button className="icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上个月">‹</button>
                <button className={`month ${showSide ? 'big' : ''}`} onClick={() => setMonth(currentMonth())} title="回到本月">{monthLabel(month)}</button>
                <button className="icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下个月">›</button>
              </>
            )}
            <button className="icon refresh" onClick={() => { running ? loadAllMonths() : loadMonth(); loadConfig(); loadSettlements(); if (showSide) loadMonths(); }} aria-label="刷新" disabled={loading}>↻</button>
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

        {tab === 'balance' && connected && config ? (
          <BalancePage config={viewConfig!} meId={settings.meId} monthsData={monthsData} settlements={settlements}
            loading={balanceLoading} saving={saving} onSavePayment={savePayment} onDeletePayment={deletePayment}
            onSetStartDate={setStartDate} onBack={() => setTab(wide ? 'add' : 'settle')} />
        ) : tab === 'settings' || !connected ? (
          <SettingsView settings={settings} config={config} configMissing={configMissing} saving={saving}
            onSaveSettings={saveSettings} onSaveConfig={saveConfig} />
        ) : !ready ? (
          <p className="empty">{loading || !error ? '正在读取账本…' : '读取失败。'}</p>
        ) : wide ? (
          <div className="desk">
            <ExpenseForm key={`${bookId}-${editing ? editing.id : month}`} layout="bar" config={viewConfig!} meId={settings.meId}
              defaultDate={editing ? editing.date : (running ? today() : defaultDateFor(month))} initial={editing}
              saving={saving} books={books} bookId={bookId} noteMap={book?.noteMap} noteSuggestions={noteSuggestions}
              onMoveBook={editing ? (id) => moveExpense(editing, id) : undefined}
              onSave={saveExpense} onCancel={editing ? () => setEditing(null) : undefined} />
            <div className="desk-cols">
              <section className="desk-main">
                <h2 className="block-title">{running ? (range === 'all' ? '全部明细' : `${range} 年明细`) : '本月明细'}</h2>
                <ExpenseList config={viewConfig!} expenses={viewExpenses} longDates={running}
                  label={running ? `${book!.name}-${range === 'all' ? '全部' : range}` : month}
                  variant="table" onEdit={setEditing} onDelete={deleteExpense} />
              </section>
              <section className="desk-aside">
                {running ? (
                  <RunningSummary config={viewConfig!} meId={settings.meId} expenses={viewExpenses}
                    monthsData={monthsData} settlements={settlements} compact
                    onOpenBalance={() => setTab('balance')} />
                ) : (
                  <Summary config={viewConfig!} data={data ?? emptyMonth(month)} saving={saving} onOpenBalance={() => setTab('balance')} compact />
                )}
              </section>
            </div>
          </div>
        ) : editing ? (
          <>
            <h2 className="page-title">修改这笔</h2>
            <ExpenseForm key={editing.id} config={viewConfig!} meId={settings.meId} defaultDate={editing.date}
              initial={editing} saving={saving} onSave={saveExpense} onCancel={() => setEditing(null)} />
          </>
        ) : tab === 'add' ? (
          <ExpenseForm key={`${bookId}-${month}`} config={viewConfig!} meId={settings.meId} defaultDate={defaultDateFor(month)}
            saving={saving} noteMap={book?.noteMap} noteSuggestions={noteSuggestions} onSave={saveExpense} />
        ) : tab === 'list' ? (
          <ExpenseList config={viewConfig!} expenses={viewExpenses} longDates={running}
            label={running ? `${book!.name}-${range === 'all' ? '全部' : range}` : month}
            onEdit={setEditing} onDelete={deleteExpense} />
        ) : running ? (
          <RunningSummary config={viewConfig!} meId={settings.meId} expenses={viewExpenses}
            monthsData={monthsData} settlements={settlements} onOpenBalance={() => setTab('balance')} />
        ) : (
          <Summary config={viewConfig!} data={data ?? emptyMonth(month)} saving={saving} onOpenBalance={() => setTab('balance')} />
        )}
      </main>

      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
