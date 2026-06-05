/**
 * Calcula la luminancia relativa de un color hex según WCAG 2.1.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const linearize = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Devuelve el color de texto más legible para un fondo dado.
 * Resultado: '#0f0f0f' (oscuro) o '#f5f5f5' (claro).
 */
export function contrastTextColor(bgHex: string): string {
  const lum = relativeLuminance(bgHex);
  // Umbral 0.179 según WCAG (contraste 4.5:1 con ambos extremos)
  return lum > 0.179 ? '#0f0f0f' : '#f5f5f5';
}
