import type * as monacoNs from 'monaco-editor';

/**
 * Syntax tokens straight from the design system:
 *   comment #5F6872 · keyword #22D3EE · 'string' #A3E635 · fnName() #F0B429
 *   selection #14383C
 */
export const CODESYNC_DARK = 'codesync-dark';
export const CODESYNC_LIGHT = 'codesync-light';

const darkTheme: monacoNs.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5F6872', fontStyle: 'italic' },
    { token: 'keyword', foreground: '22D3EE' },
    { token: 'keyword.control', foreground: '22D3EE' },
    { token: 'operator', foreground: '8D96A0' },
    { token: 'string', foreground: 'A3E635' },
    { token: 'string.escape', foreground: 'A3E635' },
    { token: 'number', foreground: 'A3E635' },
    { token: 'regexp', foreground: 'A3E635' },
    { token: 'type', foreground: 'F0B429' },
    { token: 'type.identifier', foreground: 'F0B429' },
    { token: 'entity.name.function', foreground: 'F0B429' },
    { token: 'function', foreground: 'F0B429' },
    { token: 'identifier', foreground: 'F3F5F7' },
    { token: 'variable', foreground: 'F3F5F7' },
    { token: 'tag', foreground: '22D3EE' },
    { token: 'attribute.name', foreground: 'F0B429' },
    { token: 'attribute.value', foreground: 'A3E635' },
    { token: 'delimiter', foreground: '8D96A0' },
    { token: 'invalid', foreground: 'EF4B4B' },
  ],
  colors: {
    'editor.background': '#0B0D0F',
    'editor.foreground': '#F3F5F7',
    'editorLineNumber.foreground': '#39424C',
    'editorLineNumber.activeForeground': '#8D96A0',
    'editor.lineHighlightBackground': '#111418',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#14383C',
    'editor.inactiveSelectionBackground': '#171B20',
    'editorCursor.foreground': '#22D3EE',
    'editorWhitespace.foreground': '#1C2127',
    'editorIndentGuide.background1': '#171B20',
    'editorIndentGuide.activeBackground1': '#252B32',
    'editorGutter.background': '#0B0D0F',
    'editorWidget.background': '#171B20',
    'editorWidget.border': '#252B32',
    'editorSuggestWidget.background': '#171B20',
    'editorSuggestWidget.border': '#252B32',
    'editorSuggestWidget.selectedBackground': '#1C2127',
    'scrollbarSlider.background': '#252B32',
    'scrollbarSlider.hoverBackground': '#39424C',
    'scrollbarSlider.activeBackground': '#39424C',
    'editorBracketMatch.background': '#0E2C31',
    'editorBracketMatch.border': '#164E56',
  },
};

const lightTheme: monacoNs.editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8A939D', fontStyle: 'italic' },
    { token: 'keyword', foreground: '0E8C9E' },
    { token: 'keyword.control', foreground: '0E8C9E' },
    { token: 'operator', foreground: '5A636D' },
    { token: 'string', foreground: '5C8A0A' },
    { token: 'number', foreground: '5C8A0A' },
    { token: 'regexp', foreground: '5C8A0A' },
    { token: 'type', foreground: 'A35B00' },
    { token: 'entity.name.function', foreground: 'A35B00' },
    { token: 'function', foreground: 'A35B00' },
    { token: 'identifier', foreground: '0B0D0F' },
    { token: 'tag', foreground: '0E8C9E' },
    { token: 'attribute.name', foreground: 'A35B00' },
    { token: 'attribute.value', foreground: '5C8A0A' },
    { token: 'delimiter', foreground: '5A636D' },
    { token: 'invalid', foreground: 'C42B2B' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#0B0D0F',
    'editorLineNumber.foreground': '#B4BCC4',
    'editorLineNumber.activeForeground': '#5A636D',
    'editor.lineHighlightBackground': '#F7F8FA',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#CFE9EE',
    'editorCursor.foreground': '#0E8C9E',
    'editorIndentGuide.background1': '#EEF1F4',
    'editorIndentGuide.activeBackground1': '#DDE2E8',
    'editorWidget.background': '#FFFFFF',
    'editorWidget.border': '#DDE2E8',
    'scrollbarSlider.background': '#DDE2E8',
    'scrollbarSlider.hoverBackground': '#C3CBD4',
  },
};

let registered = false;

export function registerMonacoThemes(monaco: typeof monacoNs): void {
  if (registered) return;
  monaco.editor.defineTheme(CODESYNC_DARK, darkTheme);
  monaco.editor.defineTheme(CODESYNC_LIGHT, lightTheme);
  registered = true;
}
