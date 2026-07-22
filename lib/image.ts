/**
 * Redimensiona e comprime uma imagem no navegador antes do upload — reduz
 * bastante o tamanho de fotos tiradas direto do celular (que costumam vir
 * com vários MB) sem exigir nenhuma lib externa.
 */
export function compressImage(file: File, maxWidth = 1280, quality = 0.82): Promise<Blob> {
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
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else reject(new Error('Falha ao comprimir a imagem.'))
          },
          'image/jpeg',
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
