import type { Editor } from '@tiptap/core';
import {
  getLiteraryPunctuationDefaults,
  type LiteraryPunctuationConfig,
  type LiteraryShortcutTrigger,
} from './literary-punctuation.types';

const DOM_KEY_LOCATION_LEFT  = 1;
const DOM_KEY_LOCATION_RIGHT = 2;

export function matchesTrigger(
  event: KeyboardEvent,
  trigger: LiteraryShortcutTrigger
): boolean {
  if (event.code !== trigger.code)       return false;
  if (event.shiftKey !== trigger.shift)  return false;
  if (event.altKey   !== trigger.alt)    return false;
  if (event.metaKey  !== trigger.meta)   return false;

  // En macOS el modificador es Meta (Cmd); Ctrl no es necesario
  if (trigger.meta) return true;

  if (!event.ctrlKey) return false;

  switch (trigger.ctrl) {
    case 'left':  return event.location === DOM_KEY_LOCATION_LEFT;
    case 'right': return event.location === DOM_KEY_LOCATION_RIGHT;
    case 'any':   return true;
  }
}

/**
 * Escanea hacia atrás desde el cursor hasta quoteLookbackChars caracteres.
 * Si hay más «» abiertas que cerradas → insertar cierre; si no → apertura.
 */
export function smartQuoteDirection(editor: Editor): 'open' | 'close' {
  const { doc, selection } = editor.state;

  const config = editor.extensionManager.extensions
    .find(e => e.name === 'literaryPunctuation')
    ?.options?.config as LiteraryPunctuationConfig | undefined;

  const lookback = config?.quoteLookbackChars
    ?? getLiteraryPunctuationDefaults().quoteLookbackChars;

  const scanFrom   = Math.max(0, selection.from - lookback);
  const textWindow = doc.textBetween(scanFrom, selection.from, '\n', ' ');

  const openCount  = (textWindow.match(/«/g) ?? []).length;
  const closeCount = (textWindow.match(/»/g) ?? []).length;

  return openCount > closeCount ? 'close' : 'open';
}

export function insertSmartQuote(editor: Editor): void {
  const char = smartQuoteDirection(editor) === 'open' ? '«' : '»';
  editor.commands.insertContent(char);
}

export function insertEmDash(editor: Editor): void {
  editor.commands.insertContent('—');
}

// ---------------------------------------------------------------------------
// Helpers de presentación (usados por toolbar y Settings)
// ---------------------------------------------------------------------------

export function formatShortcutLabel(trigger: LiteraryShortcutTrigger): string {
  const parts: string[] = [];
  if (trigger.meta)                    parts.push('⌘');
  if (!trigger.meta && trigger.ctrl)   parts.push('Ctrl');
  if (trigger.shift)                   parts.push('Shift');
  if (trigger.alt)                     parts.push('Alt');
  parts.push(friendlyKeyName(trigger.code));
  return parts.join('+');
}

function friendlyKeyName(code: string): string {
  const map: Record<string, string> = {
    IntlBackslash: '<>',
    Minus: '-',
  };
  return map[code] ?? code;
}
