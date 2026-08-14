/** Kept in sync with server/src/utils/languages.ts and services/runner.ts. */
export const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', runnable: true },
  { id: 'typescript', label: 'TypeScript', runnable: true },
  { id: 'python', label: 'Python', runnable: true },
  { id: 'java', label: 'Java', runnable: true },
  { id: 'c', label: 'C', runnable: true },
  { id: 'cpp', label: 'C++', runnable: true },
  { id: 'html', label: 'HTML', runnable: false },
  { id: 'css', label: 'CSS', runnable: false },
  { id: 'json', label: 'JSON', runnable: false },
  { id: 'sql', label: 'SQL', runnable: false },
  { id: 'markdown', label: 'Markdown', runnable: false },
  { id: 'plaintext', label: 'Plain text', runnable: false },
] as const;

export type LanguageId = (typeof LANGUAGES)[number]['id'];

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export function isRunnable(id: string): boolean {
  return LANGUAGES.find((l) => l.id === id)?.runnable ?? false;
}

/** Short mono tag for the room table's language square. */
const TAGS: Record<string, string> = {
  javascript: 'JS',
  typescript: 'TS',
  python: 'PY',
  java: 'JV',
  c: 'C',
  cpp: 'C++',
  html: '<>',
  css: 'CSS',
  json: '{ }',
  sql: 'SQL',
  markdown: 'MD',
  plaintext: 'TXT',
};

export function languageTag(id: string): string {
  return TAGS[id] ?? id.slice(0, 3).toUpperCase();
}

const EXTENSION_LANGUAGE: Record<string, LanguageId> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  html: 'html',
  htm: 'html',
  css: 'css',
  json: 'json',
  sql: 'sql',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'plaintext',
};

/** Mirrors the server: the file name decides the language. */
export function languageForFileName(name: string): LanguageId {
  const ext = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
  return EXTENSION_LANGUAGE[ext] ?? 'plaintext';
}
