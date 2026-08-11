import { useMemo } from 'react';
import type { RemoteUser } from '../../features/editor/useCollabSession';
import { selectionFill } from '../../utils/format';

function escapeLabel(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * y-monaco tags each remote selection with `yRemoteSelection-<clientID>` but
 * cannot know the colour or name — those live in awareness state.
 *
 * Selection uses the owner's hue at 22% lightness: a solid fill, not alpha.
 */
export function RemoteCursorStyles({ users }: { users: RemoteUser[] }) {
  const css = useMemo(
    () =>
      users
        .map(
          ({ clientId, color, contrast, name }) => `
.yRemoteSelection-${clientId} { background-color: ${selectionFill(color)}; }
.yRemoteSelectionHead-${clientId} { border-left-color: ${color}; }
.yRemoteSelectionHead-${clientId}::after {
  content: "${escapeLabel(name)}";
  background-color: ${color};
  color: ${contrast};
}`,
        )
        .join('\n'),
    [users],
  );

  return <style>{css}</style>;
}
