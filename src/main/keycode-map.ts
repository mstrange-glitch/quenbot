import { UiohookKey } from 'uiohook-napi';

const KEY_MAP: Record<string, number> = {
  ArrowLeft: UiohookKey.ArrowLeft,
  ArrowRight: UiohookKey.ArrowRight,
  ArrowUp: UiohookKey.ArrowUp,
  ArrowDown: UiohookKey.ArrowDown,
  Space: UiohookKey.Space,
  Enter: UiohookKey.Enter,
  Backspace: UiohookKey.Backspace,
  Tab: UiohookKey.Tab,
  Escape: UiohookKey.Escape,
  Delete: UiohookKey.Delete,
  Home: UiohookKey.Home,
  End: UiohookKey.End,
  PageUp: UiohookKey.PageUp,
  PageDown: UiohookKey.PageDown,
  Insert: UiohookKey.Insert,
  F1: UiohookKey.F1,
  F2: UiohookKey.F2,
  F3: UiohookKey.F3,
  F4: UiohookKey.F4,
  F5: UiohookKey.F5,
  F6: UiohookKey.F6,
  F7: UiohookKey.F7,
  F8: UiohookKey.F8,
  F9: UiohookKey.F9,
  F10: UiohookKey.F10,
  F11: UiohookKey.F11,
  F12: UiohookKey.F12,
};

export function getKeycode(keyName: string): number | undefined {
  return KEY_MAP[keyName];
}
