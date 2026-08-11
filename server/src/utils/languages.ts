/** Kept in sync with client/src/utils/languages.ts (Monaco language ids). */
export const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'cpp',
  'html',
  'css',
  'json',
  'sql',
  'markdown',
  'plaintext',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const EXTENSION_LANGUAGE: Record<string, SupportedLanguage> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'cpp',
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

const LANGUAGE_EXTENSION: Record<SupportedLanguage, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  cpp: 'cpp',
  html: 'html',
  css: 'css',
  json: 'json',
  sql: 'sql',
  markdown: 'md',
  plaintext: 'txt',
};

/** File name drives the language, the way an editor does it. */
export function languageForFileName(name: string): SupportedLanguage {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return EXTENSION_LANGUAGE[ext] ?? 'plaintext';
}

export function extensionForLanguage(language: string): string {
  return LANGUAGE_EXTENSION[language as SupportedLanguage] ?? 'txt';
}
