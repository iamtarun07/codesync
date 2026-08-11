import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';
import { MonacoBinding } from 'y-monaco';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import { Y_TEXT_KEY } from '../../features/editor/useCollabSession';
import { Spinner } from '../common/Spinner';
import { CODESYNC_DARK, CODESYNC_LIGHT, registerMonacoThemes } from './monacoThemes';

type StandaloneEditor = Parameters<OnMount>[0];

interface CodeEditorProps {
  ydoc: Y.Doc;
  awareness: Awareness;
  language: string;
  theme: 'dark' | 'light';
  /** Binding waits for the initial server state so the buffer never flickers. */
  ready: boolean;
  /** Viewer role. Remote edits still apply — only local typing is blocked. */
  readOnly?: boolean;
  onCursorChange?: (position: { line: number; column: number }) => void;
}

export function CodeEditor({
  ydoc,
  awareness,
  language,
  theme,
  ready,
  readOnly = false,
  onCursorChange,
}: CodeEditorProps) {
  const editorRef = useRef<StandaloneEditor | null>(null);
  const [mounted, setMounted] = useState(false);

  const handleMount: OnMount = (editor, monaco) => {
    registerMonacoThemes(monaco);
    monaco.editor.setTheme(theme === 'dark' ? CODESYNC_DARK : CODESYNC_LIGHT);
    editorRef.current = editor;
    setMounted(true);
  };

  // The binding is created once both the editor and the CRDT session exist,
  // and torn down with them — never inside render.
  useEffect(() => {
    const editor = editorRef.current;
    if (!ready || !mounted || !editor) return;

    const model = editor.getModel();
    if (!model) return;

    const binding = new MonacoBinding(
      ydoc.getText(Y_TEXT_KEY),
      model,
      new Set([editor]),
      awareness,
    );

    return () => binding.destroy();
  }, [ready, mounted, ydoc, awareness]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!mounted || !editor || !onCursorChange) return;
    const subscription = editor.onDidChangeCursorPosition((event) => {
      onCursorChange({ line: event.position.lineNumber, column: event.position.column });
    });
    return () => subscription.dispose();
  }, [mounted, onCursorChange]);

  return (
    <Editor
      // `value`/`onChange` are deliberately unused: Yjs owns the buffer.
      defaultValue=""
      language={language}
      theme={theme === 'dark' ? CODESYNC_DARK : CODESYNC_LIGHT}
      onMount={handleMount}
      loading={
        <span className="text-ink-muted">
          <Spinner label="Loading editor" />
        </span>
      }
      options={{
        // Read-only is a UI courtesy; the server rejects a viewer's doc:update.
        readOnly,
        domReadOnly: readOnly,
        fontSize: 13,
        lineHeight: 22,
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontLigatures: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderLineHighlight: 'line',
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        padding: { top: 14, bottom: 14 },
        lineNumbersMinChars: 4,
        glyphMargin: false,
        folding: false,
        overviewRulerLanes: 0,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}
