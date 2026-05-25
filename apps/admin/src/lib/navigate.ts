/**
 * SPA navigate function for CRUD generators and page components.
 * Uses a pluggable router — set via setNavigate() from the app layout.
 */

let _navigate: ((path: string) => void) | null = null;

/** Register the app's navigation function (e.g. Next.js router.push) */
export function setNavigate(fn: (path: string) => void): void {
  _navigate = fn;
}

/** Navigate to a path using the registered router */
export function appNavigate(path: string): void {
  if (_navigate) {
    _navigate(path);
  } else {
    // Fallback: full page navigation
    window.location.href = path;
  }
}
