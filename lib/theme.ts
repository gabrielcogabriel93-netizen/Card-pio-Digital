// Gera uma rampa de tons (50 a 900, no formato "R G B" que o Tailwind
// espera em `rgb(var(--x) / <alpha-value>)`) a partir de UMA cor hex
// escolhida pelo lojista em Configurações. É assim que `theme_color`
// passa a valer no cardápio público: os componentes continuam usando as
// classes `bg-primary-*`/`text-primary-*` de sempre, só que a paleta por
// trás delas vira CSS custom properties setadas por loja (ver
// PublicMenuClient e app/pedido/[id]/page.tsx).

const STOPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type ThemeShades = Record<(typeof STOPS)[number], string>

// Fallback: verde padrão do app (mesmo valor de tailwind.config.ts / globals.css).
const DEFAULT_COLOR = '#22c55e'

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!match) return null
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }

  return [h * 360, s * 100, l * 100]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100
  if (s === 0) {
    const v = Math.round(l * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const r = hue2rgb(p, q, h + 1 / 3)
  const g = hue2rgb(p, q, h)
  const b = hue2rgb(p, q, h - 1 / 3)
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/**
 * Recebe a cor de marca (500) e devolve os 10 tons que o Tailwind usa
 * (50..900), interpolando a claridade para cima (tons claros de fundo) e
 * para baixo (tons escuros de hover/texto) a partir da cor informada.
 * Aproximado, não é pixel-perfect com paletas geradas manualmente, mas é
 * consistente e sempre legível.
 */
export function generateColorShades(hex: string | null | undefined): ThemeShades {
  const rgb = hexToRgb(hex || '') || hexToRgb(DEFAULT_COLOR)!
  const [h, s] = rgbToHsl(...rgb)
  const baseL = rgbToHsl(...rgb)[2]

  // Índice do tom 500 dentro de STOPS (posição 5, 0-based: índice 5).
  const baseIndex = STOPS.indexOf(500)
  const lightL = 97 // tom 50 quase branco
  const darkL = 12 // tom 900 quase preto
  // Satura menos os tons muito claros para não ficarem "sujos".
  const shades = {} as ThemeShades

  STOPS.forEach((stop, i) => {
    let l: number
    let sat = s
    if (i <= baseIndex) {
      const t = baseIndex === 0 ? 1 : i / baseIndex
      l = lightL + (baseL - lightL) * t
      sat = s * (0.55 + 0.45 * t) // tons claros ficam menos saturados
    } else {
      const t = (i - baseIndex) / (STOPS.length - 1 - baseIndex)
      l = baseL + (darkL - baseL) * t
    }
    const [r, g, b] = hslToRgb(h, Math.min(100, Math.max(0, sat)), Math.min(100, Math.max(0, l)))
    shades[stop] = `${r} ${g} ${b}`
  })

  return shades
}

/** CSS custom properties prontas para aplicar via `style` num elemento raiz. */
export function themeShadesToCssVars(shades: ThemeShades): Record<string, string> {
  const vars: Record<string, string> = {}
  STOPS.forEach((stop) => {
    vars[`--color-primary-${stop}`] = shades[stop]
  })
  return vars
}
