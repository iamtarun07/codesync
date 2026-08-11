/**
 * Workspace paths are stored as POSIX-style strings ("src/index.js"). Folders
 * are real entries, so an empty folder survives a reload.
 */
export const MAX_PATH_DEPTH = 6;
export const MAX_FILES_PER_ROOM = 60;

const SEGMENT_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

export class PathError extends Error {}

/** Validates one path segment (a file or folder name). */
export function assertSegment(name: string): string {
  const trimmed = name.trim();
  if (!SEGMENT_REGEX.test(trimmed)) {
    throw new PathError(
      'Names must start with a letter or number and use only letters, numbers, dot, dash or underscore',
    );
  }
  if (trimmed === '.' || trimmed === '..') throw new PathError('Invalid name');
  return trimmed;
}

/** Normalises and validates a full path. Returns segments + joined path. */
export function normalizePath(raw: string): { path: string; segments: string[]; name: string } {
  const segments = raw
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (segments.length === 0) throw new PathError('A path is required');
  if (segments.length > MAX_PATH_DEPTH) {
    throw new PathError(`Paths may be at most ${MAX_PATH_DEPTH} levels deep`);
  }

  const clean = segments.map(assertSegment);
  return { path: clean.join('/'), segments: clean, name: clean[clean.length - 1] };
}

export function parentPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

/** Replaces the last segment, keeping the parent folders. */
export function renamePath(path: string, nextName: string): string {
  const parent = parentPath(path);
  return parent ? `${parent}/${nextName}` : nextName;
}

export function isDescendantPath(path: string, folderPath: string): boolean {
  return path.startsWith(`${folderPath}/`);
}
