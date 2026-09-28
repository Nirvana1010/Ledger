import { useEffect, useState } from 'react';
import type { Book, Config, Member, Settings } from '../lib/types';
import { BOOK_COLORS, HOUSE_CATEGORIES, getBooksRaw, newBookId } from '../lib/books';
import { DEFAULT_BOOK } from '../lib/github';
import { DEFAULT_CATEGORIES } from '../lib/types';
import { Store } from '../lib/github';
import { ICON_NAMES, Icon, iconFor, type IconName } from './icons';

type Props = {
  settings: Settings;
  config: Config | null;
  configMissing: boolean;
  saving: boolean;
  onSaveSettings: (s: Settings) => void;
  onSaveConfig: (c: Config) => Promise<boolean>;
};

export function SettingsView({ settings, config, configMissing, saving, onSaveSettings, onSaveConfig }: Props) {
  const [conn, setConn] = useState({ owner: settings.owner, repo: settings.repo, branch: settings.branch || 'main', token: settings.token });
  const [connMsg, setConnMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const connected = !!(settings.owner && settings.repo && settings.token);

  async function connect() {
    setTesting(true);
    setConnMsg(null);
    try {
      const info = await new Store(conn).checkRepo();
      if (!info.canWrite) {
        setConnMsg({ ok: false, text: '能读到仓库，但这个 token 没有写权限。' });
        return;
      }
      onSaveSettings({ ...settings, ...conn, owner: conn.owner.trim(), repo: conn.repo.trim(), branch: conn.branch.trim() || 'main', token: conn.token.trim() });
      setConnMsg({ ok: true, text: info.private ? '已连接。' : '已连接。注意：这个仓库是公开的，账目任何人都能看到，建议改成私有。' });
    } catch (e) {
      setConnMsg({ ok: false, text: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="settings">
      <section className="block">
        <h2>数据仓库</h2>
        <p className="hint">账目以 JSON 存在你的私有 GitHub 仓库里。token 只保存在这台设备的浏览器中。</p>
        <div className="row2">
          <label className="field"><span className="field-label">仓库所有者</span>
            <input value={conn.owner} onChange={(e) => setConn({ ...conn, owner: e.target.value })} placeholder="你的 GitHub 用户名" autoCapitalize="off" /></label>
          <label className="field"><span className="field-label">仓库名</span>
            <input value={conn.repo} onChange={(e) => setConn({ ...conn, repo: e.target.value })} placeholder="ledger-data" autoCapitalize="off" /></label>
        </div>
        <div className="row2">
          <label className="field"><span className="field-label">分支</span>
            <input value={conn.branch} onChange={(e) => setConn({ ...conn, branch: e.target.value })} autoCapitalize="off" /></label>
          <label className="field"><span className="field-label">Token</span>
            <input type="password" value={conn.token} onChange={(e) => setConn({ ...conn, token: e.target.value })} placeholder="github_pat_…" autoComplete="off" /></label>
        </div>
        {connMsg && <p className={connMsg.ok ? 'ok' : 'error'} role="status">{connMsg.text}</p>}
        <div className="actions">
          {connected && (
            <button className="ghost" onClick={() => { onSaveSettings({ ...settings, token: '' }); setConn({ ...conn, token: '' }); }}>在这台设备上退出</button>
          )}
          <button className="primary" onClick={connect} disabled={testing || !conn.owner || !conn.repo || !conn.token}>
            {testing ? '连接中…' : connected ? '重新连接' : '连接'}
          </button>
        </div>
      </section>

      {connected && configMissing && <Setup saving={saving} onCreate={onSaveConfig} />}

      {connected && config && (
        <>
          <section className="block">
            <h2>我是谁</h2>
            <p className="hint">记账时默认由你付款。每台设备各选一次。</p>
            <div className="chips">
              {config.members.map((m) => (
                <button key={m.id} className={`chip ${settings.meId === m.id ? 'on' : ''}`} aria-pressed={settings.meId === m.id}
                  onClick={() => onSaveSettings({ ...settings, meId: m.id })}>{m.name}</button>
              ))}
            </div>
          </section>
          <ConfigEditor config={config} saving={saving} onSave={onSaveConfig} />
        </>
      )}
    </div>
  );
}

function Setup({ saving, onCreate }: { saving: boolean; onCreate: (c: Config) => Promise<boolean> }) {
  const [names, setNames] = useState(['', '']);
  const [currency, setCurrency] = useState('$');
  const valid = names.filter((n) => n.trim()).length >= 2;
  return (
    <section className="block">
      <h2>新建账本</h2>
      <p className="hint">这个仓库里还没有账本。填上一起记账的人，之后还可以改。</p>
      {names.map((n, i) => (
        <label key={i} className="field"><span className="field-label">成员 {i + 1}</span>
          <input value={n} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} /></label>
      ))}
      <button className="link" onClick={() => setNames([...names, ''])}>再加一人</button>
      <label className="field narrow"><span className="field-label">货币符号</span>
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} /></label>
      <div className="actions">
        <button className="primary" disabled={!valid || saving} onClick={() => onCreate({
          version: 1, currency: currency.trim() || '$', categories: DEFAULT_CATEGORIES,
          members: names.map((n) => n.trim()).filter(Boolean).map((name) => ({ id: crypto.randomUUID().slice(0, 8), name })),
        })}>{saving ? '创建中…' : '创建账本'}</button>
      </div>
    </section>
  );
}

function ConfigEditor({ config, saving, onSave }: { config: Config; saving: boolean; onSave: (c: Config) => Promise<boolean> }) {
  const [members, setMembers] = useState<Member[]>(config.members);
  const [books, setBooks] = useState<Book[]>(getBooksRaw(config));
  const [icons, setIcons] = useState<Record<string, string>>(config.categoryIcons ?? {});
  const [picking, setPicking] = useState<string | null>(null);
  const [newCat, setNewCat] = useState<Record<string, string>>({});
  const [currency, setCurrency] = useState(config.currency);

  useEffect(() => {
    setMembers(config.members); setBooks(getBooksRaw(config));
    setIcons(config.categoryIcons ?? {}); setCurrency(config.currency);
  }, [config]);

  const dirty = JSON.stringify([members, books, currency, icons])
    !== JSON.stringify([config.members, getBooksRaw(config), config.currency, config.categoryIcons ?? {}]);

  const blocked =
    members.some((m) => !m.name.trim()) ? '成员名字不能留空。'
      : books.some((b) => !b.archived && !b.name.trim()) ? '账本名字不能留空。'
        : books.some((b) => !b.archived && !b.categories.length) ? '每个账本至少要有一个分类。'
          : null;

  const patch = (id: string, change: Partial<Book>) =>
    setBooks(books.map((b) => (b.id === id ? { ...b, ...change } : b)));

  const addCat = (b: Book) => {
    const c = (newCat[b.id] ?? '').trim();
    if (c && !b.categories.includes(c)) patch(b.id, { categories: [...b.categories, c] });
    setNewCat({ ...newCat, [b.id]: '' });
  };
  const moveCat = (b: Book, i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= b.categories.length) return;
    const next = [...b.categories];
    [next[i], next[j]] = [next[j], next[i]];
    patch(b.id, { categories: next });
  };

  return (
    <>
      <section className="block">
        <h2>成员</h2>
        {members.map((m, i) => (
          <label key={m.id} className="field"><span className="field-label">成员 {i + 1}</span>
            <input value={m.name} onChange={(e) => setMembers(members.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} /></label>
        ))}
        <button className="link" onClick={() => setMembers([...members, { id: crypto.randomUUID().slice(0, 8), name: '' }])}>添加成员</button>
        <p className="hint">所有账本共用。成员只能改名不能删除。</p>
        <label className="field narrow"><span className="field-label">货币符号</span>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} /></label>
      </section>

      <section className="block">
        <h2>账本</h2>
        {books.filter((b) => !b.archived).map((b) => (
          <div key={b.id} className="book-card">
            <div className="book-card-top">
              <span className={`book-dot color-${b.color}`} />
              <input value={b.name} aria-label="账本名称" onChange={(e) => patch(b.id, { name: e.target.value })} />
              {b.id === DEFAULT_BOOK ? (
                <span className="hint">默认</span>
              ) : (
                <button className="link danger" onClick={() => {
                  if (confirm(`删除账本「${b.name}」？账目不会真的删掉，只是不再显示，以后可以恢复。`)) patch(b.id, { archived: true });
                }}>删除</button>
              )}
            </div>

            <div className="book-row">
              <span className="field-label">配色</span>
              <span className="color-picks">
                {BOOK_COLORS.map((c) => (
                  <button key={c.id} className={`color-pick color-${c.id} ${b.color === c.id ? 'on' : ''}`}
                    aria-label={c.name} aria-pressed={b.color === c.id} onClick={() => patch(b.id, { color: c.id })} />
                ))}
              </span>
            </div>

            <div className="book-row">
              <span className="field-label">视图</span>
              <div className="segmented">
                <button className={b.mode === 'monthly' ? 'on' : ''} onClick={() => patch(b.id, { mode: 'monthly' })}>按月</button>
                <button className={b.mode === 'running' ? 'on' : ''} onClick={() => patch(b.id, { mode: 'running' })}>累计</button>
              </div>
            </div>

            <div className="book-row top">
              <span className="field-label">分类</span>
              <div className="book-cats">
                <ul className="cat-list">
                  {b.categories.map((c, i) => (
                    <li key={c}>
                      <button className="cat-icon" onClick={() => setPicking(picking === `${b.id}:${c}` ? null : `${b.id}:${c}`)}
                        aria-label={`更换 ${c} 的图标`} aria-expanded={picking === `${b.id}:${c}`}>
                        <Icon name={iconFor(c, icons as Record<string, IconName>)} />
                      </button>
                      <span>{c}</span>
                      <button className="icon" onClick={() => moveCat(b, i, -1)} aria-label={`${c} 上移`} disabled={i === 0}>↑</button>
                      <button className="icon" onClick={() => moveCat(b, i, 1)} aria-label={`${c} 下移`} disabled={i === b.categories.length - 1}>↓</button>
                      <button className="icon" onClick={() => patch(b.id, { categories: b.categories.filter((x) => x !== c) })} aria-label={`删除分类 ${c}`}>×</button>
                      {picking === `${b.id}:${c}` && (
                        <div className="icon-grid">
                          {ICON_NAMES.map((n) => (
                            <button key={n} className={`icon-opt ${iconFor(c, icons as Record<string, IconName>) === n ? 'on' : ''}`}
                              aria-label={n} onClick={() => { setIcons({ ...icons, [c]: n }); setPicking(null); }}>
                              <Icon name={n} />
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="inline-add">
                  <input value={newCat[b.id] ?? ''} placeholder="新分类"
                    onChange={(e) => setNewCat({ ...newCat, [b.id]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(b); } }} />
                  <button className="ghost" onClick={() => addCat(b)}>添加</button>
                </div>
              </div>
            </div>
          </div>
        ))}

        <div className="actions start">
          <button className="ghost" onClick={() => setBooks([...books, {
            id: newBookId(books), name: `账本 ${books.filter((b) => !b.archived).length + 1}`, color: BOOK_COLORS.find((c) => !books.some((b) => b.color === c.id))?.id ?? 'indigo',
            mode: 'running', categories: HOUSE_CATEGORIES,
          }])}>＋ 新建账本</button>
        </div>
        <p className="hint">新账本默认是累计视图，分类给了一套房子相关的，可以随便改。</p>
      </section>

      {dirty && blocked && <p className="error" role="alert">{blocked}</p>}

      <div className="actions">
        <button className="primary" disabled={!dirty || saving || !!blocked}
          onClick={() => onSave({
            ...config,
            members: members.map((m) => ({ ...m, name: m.name.trim() })),
            books: books.map((b) => ({ ...b, name: b.name.trim() })),
            categories: books.find((b) => b.id === DEFAULT_BOOK)?.categories ?? config.categories,
            categoryIcons: icons,
            currency: currency.trim() || '$',
          })}>
          {saving ? '保存中…' : '保存设置'}
        </button>
      </div>
    </>
  );
}
