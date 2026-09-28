import type { Book, BookColor, Config } from './types';
import { DEFAULT_BOOK } from './github';

export const BOOK_COLORS: { id: BookColor; name: string }[] = [
  { id: 'plum', name: '梅子' },
  { id: 'ochre', name: '赭石' },
  { id: 'indigo', name: '靛蓝' },
  { id: 'olive', name: '橄榄' },
  { id: 'violet', name: '紫灰' },
  { id: 'brick', name: '砖红' },
];

export const HOUSE_CATEGORIES = ['房贷', '装修', '家具家电', '保险/税/HOA', '维修养护', '手续费'];

/** 老配置没有 books 字段，就把它当成一个默认账本 */
export function getBooks(config: Config): Book[] {
  if (config.books?.length) return config.books.filter((b) => !b.archived);
  return [{ id: DEFAULT_BOOK, name: '日常', color: 'plum', mode: 'monthly', categories: config.categories }];
}

export function allBooks(config: Config): Book[] {
  return config.books?.length
    ? config.books
    : [{ id: DEFAULT_BOOK, name: '日常', color: 'plum', mode: 'monthly', categories: config.categories }];
}

export function findBook(config: Config, id: string): Book {
  const books = getBooks(config);
  return books.find((b) => b.id === id) ?? books[0];
}

/** 账本视角下的 config：分类换成这本自己的 */
export function bookConfig(config: Config, book: Book): Config {
  return { ...config, categories: book.categories };
}

export function newBookId(existing: Book[]): string {
  let n = existing.length + 1;
  const used = new Set(existing.map((b) => b.id));
  let id = `book${n}`;
  while (used.has(id)) id = `book${++n}`;
  return id;
}
