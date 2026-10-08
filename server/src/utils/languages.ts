/** Kept in sync with client/src/utils/languages.ts (Monaco language ids). */
export const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
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

const LANGUAGE_EXTENSION: Record<SupportedLanguage, string> = {
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  java: 'java',
  c: 'c',
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

/**
 * The file name a file should have once its language is switched: the
 * extension follows the language so name and language never disagree. A name
 * whose extension already maps to that language (`.jsx`, `.h`) is kept.
 */
export function nameForLanguage(name: string, language: string): string {
  if (languageForFileName(name) === language) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.${extensionForLanguage(language)}`;
}

const STARTERS: Partial<Record<SupportedLanguage, string>> = {
  javascript: "console.log('Hello, CodeSync!');\n",
  typescript: "const greeting: string = 'Hello, CodeSync!';\nconsole.log(greeting);\n",
  python: "print('Hello, CodeSync!')\n",
  java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, CodeSync!");\n  }\n}\n',
  c: '#include <stdio.h>\n\nint main(void) {\n  printf("Hello, CodeSync!\\n");\n  return 0;\n}\n',
  cpp: '#include <iostream>\n\nint main() {\n  std::cout << "Hello, CodeSync!" << std::endl;\n  return 0;\n}\n',
};

/** Hello-world body for a new room's first file, so Run works immediately. */
export function starterSource(language: string): string {
  return STARTERS[language as SupportedLanguage] ?? '';
}
