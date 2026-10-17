// Símbolo da marca: uma comanda (o papel do bloco de pedido) com a borda
// serrilhada de quando é destacada, um "F" no traço da caneta e o ponto
// amarelo do "tilim" de pedido novo. Ver lib/brand.ts.
//
// `fill="currentColor"` no papel: na landing e no painel herda
// `text-primary-500` (azul da marca); no cardápio público herda a cor da
// loja via `--color-primary-500` (ver lib/theme.ts).
import { BRAND } from '@/lib/brand'

const TICKET_PATH =
  'M14 10H82A8 8 0 0 1 90 18V76L84.75 82L79.5 76L74.25 82L69 76L63.75 82L58.5 76L53.25 82L48 76L42.75 82L37.5 76L32.25 82L27 76L21.75 82L16.5 76L11.25 82L6 76V18A8 8 0 0 1 14 10Z'

export function Logo({ size = 32, className, dotColor = '#FFD43B' }: { size?: number; className?: string; dotColor?: string }) {
  return (
    <svg viewBox="0 0 96 96" width={size} height={size} className={className} aria-hidden="true">
      <path d={TICKET_PATH} fill="currentColor" />
      <path d="M34 64V28H62M34 45H54" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="70" cy="58" r="7" fill={dotColor} />
    </svg>
  )
}

// Assinatura completa (símbolo + palavra). A palavra vem de BRAND para
// trocar de nome sem mexer em componente.
export function BrandLockup({ size = 32, className, textClassName }: { size?: number; className?: string; textClassName?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className || ''}`}>
      <Logo size={size} className="text-caneta" />
      <span className={`font-display font-extrabold tracking-tight leading-none ${textClassName || 'text-xl text-ink'}`}>{BRAND.wordmark}</span>
    </span>
  )
}
