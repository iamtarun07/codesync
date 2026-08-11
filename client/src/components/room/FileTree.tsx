import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { RoomFile } from '../../types';
import { languageTag } from '../../utils/languages';

interface FileTreeProps {
  files: RoomFile[];
  activeFileId: string | null;
  /** Marks the active file as having unsaved changes. */
  dirty: boolean;
  canEdit: boolean;
  onOpen: (fileId: string) => void;
  onCreate: (path: string, type: 'file' | 'folder') => void;
  onRename: (fileId: string, name: string) => void;
  onDelete: (fileId: string) => void;
}

interface TreeNode {
  file: RoomFile;
  depth: number;
  children: TreeNode[];
}

/** Flat path list -> nested nodes. Folders sort before files at each level. */
function buildTree(files: RoomFile[]): TreeNode[] {
  const byPath = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  sorted.forEach((file) => {
    const depth = file.path.split('/').length - 1;
    const node: TreeNode = { file, depth, children: [] };
    byPath.set(file.path, node);

    const parentPath = file.path.split('/').slice(0, -1).join('/');
    const parent = parentPath ? byPath.get(parentPath) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const order = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.file.type !== b.file.type) return a.file.type === 'folder' ? -1 : 1;
      return a.file.name.localeCompare(b.file.name);
    });
    nodes.forEach((node) => order(node.children));
  };
  order(roots);

  return roots;
}

function flatten(nodes: TreeNode[], collapsed: Set<string>): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    list.forEach((node) => {
      out.push(node);
      if (node.file.type === 'folder' && !collapsed.has(node.file.path)) walk(node.children);
    });
  };
  walk(nodes);
  return out;
}

type Draft =
  | { mode: 'create'; type: 'file' | 'folder'; parentPath: string }
  | { mode: 'rename'; fileId: string; value: string }
  | null;

export function FileTree({
  files,
  activeFileId,
  dirty,
  canEdit,
  onOpen,
  onCreate,
  onRename,
  onDelete,
}: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft>(null);
  const [menu, setMenu] = useState<{ file: RoomFile; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => flatten(buildTree(files), collapsed), [files, collapsed]);

  useEffect(() => {
    if (draft) inputRef.current?.focus();
  }, [draft]);

  useEffect(() => {
    if (!menu) return;
    const dismiss = () => setMenu(null);
    window.addEventListener('click', dismiss);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('resize', dismiss);
    };
  }, [menu]);

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const commitDraft = (value: string) => {
    const trimmed = value.trim();
    setDraft(null);
    if (!trimmed || !draft) return;

    if (draft.mode === 'create') {
      const path = draft.parentPath ? `${draft.parentPath}/${trimmed}` : trimmed;
      onCreate(path, draft.type);
    } else {
      onRename(draft.fileId, trimmed);
    }
  };

  const onDraftKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commitDraft(event.currentTarget.value);
    if (event.key === 'Escape') setDraft(null);
  };

  /** New entries land next to whatever is selected, like an IDE does it. */
  const draftParent = () => {
    const active = files.find((file) => file.fileId === activeFileId);
    if (!active) return '';
    return active.type === 'folder' ? active.path : active.path.split('/').slice(0, -1).join('/');
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-9 shrink-0 items-center gap-1 px-3">
        <h2 className="t-label flex-1">Workspace</h2>

        {canEdit ? (
          <>
            <button
              type="button"
              title="New file"
              onClick={() => setDraft({ mode: 'create', type: 'file', parentPath: draftParent() })}
              className="flex h-5 w-5 items-center justify-center rounded-[4px] text-ink-muted transition hover:bg-elevated hover:text-ink"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden fill="none">
                <path
                  d="M9 2H4v12h8V5L9 2zM9 2v3h3"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              title="New folder"
              onClick={() => setDraft({ mode: 'create', type: 'folder', parentPath: draftParent() })}
              className="flex h-5 w-5 items-center justify-center rounded-[4px] text-ink-muted transition hover:bg-elevated hover:text-ink"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden fill="none">
                <path
                  d="M2 4.5h4l1.2 1.5H14v7H2v-8.5z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {rows.map(({ file, depth }) => {
          const isActive = file.fileId === activeFileId;
          const isRenaming = draft?.mode === 'rename' && draft.fileId === file.fileId;

          return (
            <div key={file.fileId}>
              {isRenaming ? (
                <div style={{ paddingLeft: 10 + depth * 12 }} className="px-2 py-1">
                  <input
                    ref={inputRef}
                    defaultValue={draft.value}
                    onKeyDown={onDraftKey}
                    onBlur={(event) => commitDraft(event.currentTarget.value)}
                    className="h-6 w-full rounded-[4px] border border-cyan bg-elevated px-1.5 font-mono text-[12px] text-ink outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => (file.type === 'folder' ? toggle(file.path) : onOpen(file.fileId))}
                  onContextMenu={(event) => {
                    if (!canEdit) return;
                    event.preventDefault();
                    setMenu({ file, x: event.clientX, y: event.clientY });
                  }}
                  style={{ paddingLeft: 6 + depth * 12 }}
                  className={`flex w-full items-center gap-1.5 border-l-2 py-[3px] pr-2 text-left transition-colors ${
                    isActive
                      ? 'border-cyan bg-selected'
                      : 'border-transparent hover:bg-elevated'
                  }`}
                >
                  {file.type === 'folder' ? (
                    <span
                      aria-hidden
                      className={`w-3 shrink-0 text-center font-mono text-[9px] text-ink-muted transition-transform ${
                        collapsed.has(file.path) ? '' : 'rotate-90'
                      }`}
                    >
                      ▶
                    </span>
                  ) : (
                    <span
                      aria-hidden
                      className="w-3 shrink-0 text-center font-mono text-[8px] text-ink-disabled"
                    >
                      {languageTag(file.language).slice(0, 2)}
                    </span>
                  )}

                  <span
                    className={`truncate font-mono text-[12px] ${
                      isActive ? 'text-ink' : file.type === 'folder' ? 'text-ink-secondary' : 'text-ink-secondary'
                    }`}
                  >
                    {file.name}
                  </span>

                  {isActive && dirty ? (
                    <span aria-label="Unsaved changes" className="text-[14px] leading-none text-cyan">
                      •
                    </span>
                  ) : null}
                </button>
              )}
            </div>
          );
        })}

        {draft?.mode === 'create' ? (
          <div className="px-2 py-1">
            <input
              ref={inputRef}
              placeholder={draft.type === 'folder' ? 'folder name' : 'file.ts'}
              onKeyDown={onDraftKey}
              onBlur={(event) => commitDraft(event.currentTarget.value)}
              className="h-6 w-full rounded-[4px] border border-cyan bg-elevated px-1.5 font-mono text-[12px] text-ink outline-none placeholder:text-ink-disabled"
            />
            {draft.parentPath ? (
              <p className="t-meta mt-1 truncate px-1">in {draft.parentPath}/</p>
            ) : null}
          </div>
        ) : null}

        {files.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-ink-muted">No files yet.</p>
        ) : null}
      </div>

      {menu ? (
        <div
          role="menu"
          style={{ top: menu.y, left: menu.x }}
          className="fixed z-40 w-40 overflow-hidden rounded-[6px] border border-line bg-elevated py-1"
        >
          {[
            {
              label: 'New file',
              action: () =>
                setDraft({
                  mode: 'create',
                  type: 'file',
                  parentPath:
                    menu.file.type === 'folder'
                      ? menu.file.path
                      : menu.file.path.split('/').slice(0, -1).join('/'),
                }),
            },
            {
              label: 'New folder',
              action: () =>
                setDraft({
                  mode: 'create',
                  type: 'folder',
                  parentPath:
                    menu.file.type === 'folder'
                      ? menu.file.path
                      : menu.file.path.split('/').slice(0, -1).join('/'),
                }),
            },
            {
              label: 'Rename',
              action: () =>
                setDraft({ mode: 'rename', fileId: menu.file.fileId, value: menu.file.name }),
            },
            { label: 'Delete', action: () => onDelete(menu.file.fileId), danger: true },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(null);
                item.action();
              }}
              className={`block w-full px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-selected ${
                item.danger ? 'text-red' : 'text-ink-secondary hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
