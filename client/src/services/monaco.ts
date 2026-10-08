import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Bundle Monaco locally instead of letting @monaco-editor/react fetch it from a
// CDN: no network dependency, no CSP surprises, deterministic version.
window.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

// Room code runs on Node, but the editor has no @types/node: without this,
// valid TypeScript using require/process/Buffer is underlined as an error.
// 2580/2591 are exactly "Cannot find name X. Do you need type definitions for node?".
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  diagnosticCodesToIgnore: [2580, 2591],
});

loader.config({ monaco });

export { monaco };
