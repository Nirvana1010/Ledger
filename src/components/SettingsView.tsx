import { useEffect, useState } from 'react';
import type { Config, Member, Settings } from '../lib/types';
import { DEFAULT_CATEGORIES } from '../lib/types';
import { Store } from '../lib/github';

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
  const [cats, setCats] = useState<string[]>(config.categories);
  const [newCat, setNewCat] = useState('');
  const [currency, setCurrency] = useState(config.currency);
  useEffect(() => { setMembers(config.members); setCats(config.categories); setCurrency(config.currency); }, [config]);

  const dirty = JSON.stringify([members, cats, currency]) !== JSON.stringify([config.members, config.categories, config.currency]);
  const addCat = () => {
    const c = newCat.trim();
    if (c && !cats.includes(c)) setCats([...cats, c]);
    setNewCat('');
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= cats.length) return;
    const next = [...cats];
    [next[i], next[j]] = [next[j], next[i]];
    setCats(next);
  };

  return (
    <section className="block">
      <h2>成员和分类</h2>
      {members.map((m, i) => (
        <label key={m.id} className="field"><span className="field-label">成员 {i + 1}</span>
          <input value={m.name} onChange={(e) => setMembers(members.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))} /></label>
      ))}
      <button className="link" onClick={() => setMembers([...members, { id: crypto.randomUUID().slice(0, 8), name: '' }])}>添加成员</button>
      <p className="hint">为了不弄乱历史账目，成员只能改名不能删除。</p>

      <span className="field-label">分类（顺序就是记账页的顺序）</span>
      <ul className="cat-list">
        {cats.map((c, i) => (
          <li key={c}>
            <span>{c}</span>
            <button className="icon" onClick={() => move(i, -1)} aria-label={`${c} 上移`} disabled={i === 0}>↑</button>
            <button className="icon" onClick={() => move(i, 1)} aria-label={`${c} 下移`} disabled={i === cats.length - 1}>↓</button>
            <button className="icon" onClick={() => setCats(cats.filter((x) => x !== c))} aria-label={`删除分类 ${c}`}>×</button>
          </li>
        ))}
      </ul>
      <div className="inline-add">
        <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="新分类"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } }} />
        <button className="ghost" onClick={addCat}>添加</button>
      </div>
      <p className="hint">删除分类不会影响已经记过的账。</p>

      <label className="field narrow"><span className="field-label">货币符号</span>
        <input value={currency} onChange={(e) => setCurrency(e.target.value)} /></label>

      <div className="actions">
        <button className="primary" disabled={!dirty || saving || members.some((m) => !m.name.trim()) || !cats.length}
          onClick={() => onSave({ ...config, members: members.map((m) => ({ ...m, name: m.name.trim() })), categories: cats, currency: currency.trim() || '$' })}>
          {saving ? '保存中…' : '保存设置'}
        </button>
      </div>
    </section>
  );
}
