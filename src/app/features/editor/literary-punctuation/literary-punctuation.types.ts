export type CtrlRequirement =
  | 'left'    // sólo Left Ctrl  (DOM_KEY_LOCATION_LEFT  = 1)
  | 'right'   // sólo Right Ctrl (DOM_KEY_LOCATION_RIGHT = 2)
  | 'any';    // cualquier Ctrl

export interface LiteraryShortcutTrigger {
  /** KeyboardEvent.code — independiente del layout de teclado */
  code: string;
  ctrl: CtrlRequirement;
  /** Tecla Cmd en macOS (event.metaKey). Cuando es true, ctrl se ignora. */
  meta: boolean;
  shift: boolean;
  alt: boolean;
}

export interface LiteraryPunctuationConfig {
  enabled: boolean;
  quoteShortcut: LiteraryShortcutTrigger;
  dashShortcut: LiteraryShortcutTrigger;
  /**
   * Caracteres hacia atrás desde el cursor que se escanean para detectar
   * comillas sin cerrar. Cubre varios párrafos de diálogo sin coste
   * apreciable de rendimiento. Min: 100, Max: 5000. Default: 800.
   */
  quoteLookbackChars: number;
}

/**
 * Defaults conscientes de la plataforma.
 * - macOS: Cmd (Meta) + Shift, ya que Ctrl no es el modificador primario.
 * - Windows / Linux: Left Ctrl + Shift.
 * Si la tecla IntlBackslash no existe (teclado ANSI), el atajo simplemente
 * no disparará hasta que el usuario lo configure manualmente en Settings.
 */
export function getLiteraryPunctuationDefaults(): LiteraryPunctuationConfig {
  const isMac =
    navigator.platform.startsWith('Mac') ||
    navigator.userAgent.includes('Macintosh');

  const shortcut = (code: string): LiteraryShortcutTrigger => ({
    code,
    ctrl: isMac ? 'any' : 'left',
    meta: isMac,
    shift: true,
    alt: false,
  });

  return {
    enabled: true,
    quoteShortcut: shortcut('IntlBackslash'),
    dashShortcut:  shortcut('Minus'),
    quoteLookbackChars: 800,
  };
}
