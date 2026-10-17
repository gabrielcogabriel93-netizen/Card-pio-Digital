/**
 * Redimensiona e comprime uma imagem no navegador antes do upload — reduz
 * bastante o tamanho de fotos tiradas direto do celular (que costumam vir
 * com vários MB) sem exigir nenhuma lib externa.
 *
 * Sai em WebP: menor que JPEG e, ao contrário dele, mantém transparência
 * (logo em PNG com fundo transparente não ganha mais fundo preto).
 * Navegador sem suporte a WebP no canvas cai para PNG quando a imagem
 * original tem transparência, ou JPEG quando não tem.
 */
export function compressImage(file: File, maxWidth = 1280, quality = 0.82, format: 'webp' | 'png' = 'webp'): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const img = new Image()

      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Não foi possível processar a imagem neste navegador.'))
          return
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const mayHaveAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif'

        if (format === 'png') {
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir a imagem.'))), 'image/png')
          return
        }

        canvas.toBlob(
          (blob) => {
            if (blob && blob.type === 'image/webp') {
              resolve(blob)
              return
            }
            canvas.toBlob(
              (fallback) => {
                if (fallback) resolve(fallback)
                else reject(new Error('Falha ao comprimir a imagem.'))
              },
              mayHaveAlpha ? 'image/png' : 'image/jpeg',
              quality
            )
          },
          'image/webp',
          quality
        )
      }

      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'))
      img.src = reader.result as string
    }

    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}

/** Extensão do arquivo a partir do tipo do blob comprimido. */
export function extensionForBlob(blob: Blob): string {
  if (blob.type === 'image/webp') return 'webp'
  if (blob.type === 'image/png') return 'png'
  return 'jpg'
}
