/**
 * Backend endpoints, resolved once at module load.
 *
 * Vite inlines `import.meta.env` at build time, so these values are baked into
 * the bundle — they must be configured on the machine that runs `npm run build`.
 *
 * The localhost defaults live inside an `import.meta.env.DEV` branch on purpose:
 * `DEV` is statically replaced with `false` in a production build, so the whole
 * block (and the localhost strings with it) is removed from the shipped bundle.
 * A deployed app can therefore never silently point at a developer's machine.
 * If the variable is missing in production it falls back to the page's own
 * origin — correct when the API is reverse proxied under the same domain — and
 * logs which variable was not set.
 */
type EndpointVar = 'VITE_API_URL' | 'VITE_SOCKET_URL';

function resolve(name: EndpointVar, prodPath: '' | '/api'): string {
  const configured = import.meta.env[name];
  if (typeof configured === 'string' && configured.length > 0) return configured;

  if (import.meta.env.DEV) {
    return name === 'VITE_API_URL' ? 'http://localhost:5000/api' : 'http://localhost:5000';
  }

  const sameOrigin = `${window.location.origin}${prodPath}`;
  console.error(
    `[config] ${name} was not set at build time — falling back to ${sameOrigin}. ` +
      `Set ${name} in the deployment environment and rebuild.`,
  );
  return sameOrigin;
}

/** REST base URL — includes the /api prefix. */
export const API_URL = resolve('VITE_API_URL', '/api');

/** Socket.IO origin — no /api suffix; Socket.IO attaches at the server root. */
export const SOCKET_URL = resolve('VITE_SOCKET_URL', '');
