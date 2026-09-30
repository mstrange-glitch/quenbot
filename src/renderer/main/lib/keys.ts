/**
 * True when an app-level shortcut (Space, arrows) should ignore this key event:
 * the user is typing in a field, or holding a modifier (e.g. a global hotkey such
 * as Ctrl+Shift+Left is in progress).
 */
export function shouldIgnoreShortcut(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return true;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('input, textarea, select') !== null;
}
