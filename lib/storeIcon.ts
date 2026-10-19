// Endereço do ícone do app DA LOJA (app/loja/[slug]/icone/[size]). A
// versão muda quando o logo ou a cor mudam, para o celular baixar de novo.
export function storeIconUrl(
  store: { slug: string; logo_url?: string | null; theme_color?: string | null },
  size: 48 | 96 | 180 | 192 | 512,
  maskable = false
): string {
  const seed = `${store.logo_url || ''}|${store.theme_color || ''}`
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const v = (h >>> 0).toString(36)
  return `/loja/${store.slug}/icone/${size}?v=${v}${maskable ? '&maskable=1' : ''}`
}
