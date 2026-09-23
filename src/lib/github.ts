import type { Settings } from './types';

const API = 'https://api.github.com';

export class ConflictError extends Error {}

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

async function errorMessage(r: Response): Promise<string> {
  let detail = '';
  try { detail = (await r.json()).message ?? ''; } catch { /* ignore */ }
  if (r.status === 401) return 'Token 无效或已过期，请到设置里更新。';
  if (r.status === 403) return `没有权限（${detail || '403'}）。检查 token 是否对数据仓库有 Contents 读写权限。`;
  if (r.status === 404) return '找不到仓库。检查 owner / 仓库名，或 token 是否能访问这个仓库。';
  return `GitHub 返回 ${r.status}：${detail}`;
}

/** 把私有仓库当数据库：每个 JSON 文件一次读写，靠文件 sha 做乐观锁 */
export class Store {
  constructor(private s: Pick<Settings, 'owner' | 'repo' | 'branch' | 'token'>) {}

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.s.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private url(path: string) {
    const p = path.split('/').map(encodeURIComponent).join('/');
    return `${API}/repos/${encodeURIComponent(this.s.owner)}/${encodeURIComponent(this.s.repo)}/contents/${p}`;
  }

  async checkRepo(): Promise<{ private: boolean; canWrite: boolean }> {
    const r = await fetch(`${API}/repos/${encodeURIComponent(this.s.owner)}/${encodeURIComponent(this.s.repo)}`, {
      headers: this.headers(), cache: 'no-store',
    });
    if (!r.ok) throw new Error(await errorMessage(r));
    const j = await r.json();
    return { private: !!j.private, canWrite: j.permissions ? !!j.permissions.push : true };
  }

  /** 列出 months/ 下已有的月份，倒序 */
  async listMonths(): Promise<string[]> {
    const r = await fetch(`${API}/repos/${encodeURIComponent(this.s.owner)}/${encodeURIComponent(this.s.repo)}/contents/months?ref=${encodeURIComponent(this.s.branch)}`, {
      headers: this.headers(), cache: 'no-store',
    });
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(await errorMessage(r));
    const j = (await r.json()) as { name: string; type: string }[];
    return j.filter((f) => f.type === 'file' && f.name.endsWith('.json'))
      .map((f) => f.name.replace(/\.json$/, ''))
      .filter((m) => /^\d{4}-\d{2}$/.test(m))
      .sort((a, b) => b.localeCompare(a));
  }

  async read<T>(path: string): Promise<{ data: T; sha: string } | null> {
    const r = await fetch(`${this.url(path)}?ref=${encodeURIComponent(this.s.branch)}`, {
      headers: this.headers(), cache: 'no-store',
    });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(await errorMessage(r));
    const j = await r.json();
    return { data: JSON.parse(b64decode(j.content)) as T, sha: j.sha };
  }

  async write(path: string, data: unknown, sha: string | undefined, message: string): Promise<void> {
    const r = await fetch(this.url(path), {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: b64encode(JSON.stringify(data, null, 2) + '\n'),
        branch: this.s.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (r.status === 409 || r.status === 422) throw new ConflictError('文件已被别人修改');
    if (!r.ok) throw new Error(await errorMessage(r));
  }

  /** 读最新 → 应用修改 → 写回；如果期间对方也改了，就重读重来 */
  async update<T>(path: string, init: () => T, fn: (d: T) => T, message: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const cur = await this.read<T>(path);
      const next = fn(structuredClone(cur ? cur.data : init()));
      try {
        await this.write(path, next, cur?.sha, message);
        return next;
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
      }
    }
    throw new Error('保存冲突，重试多次仍失败，请刷新后再试。');
  }
}

export const CONFIG_PATH = 'config.json';
export const monthPath = (month: string) => `months/${month}.json`;
