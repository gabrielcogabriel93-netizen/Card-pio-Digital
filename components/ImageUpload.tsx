'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage, extensionForBlob } from '@/lib/image'
import { IMAGE_FORMATS, type ImageFolder } from '@/lib/imageFormats'
import { log, logError } from '@/lib/logger'
import { SmartImage } from '@/components/SmartImage'
import { ImageCropper } from '@/components/ImageCropper'
import { Upload, X, Loader2, ImageIcon } from 'lucide-react'

const MAX_FILE_SIZE = 12 * 1024 * 1024 // 12MB (antes do recorte e da compressão)

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  establishmentId: string
  folder: ImageFolder
  label?: string
  aspectClassName?: string
}

// Moldura da prévia na mesma proporção do formato padrão.
const PREVIEW: Record<ImageFolder, string> = {
  products: 'w-full max-w-xs aspect-[4/3]',
  combos: 'w-full max-w-xs aspect-[4/3]',
  'pizza-flavors': 'w-full max-w-xs aspect-[4/3]',
  logo: 'h-20 w-20',
  banners: 'w-full max-w-md aspect-[8/3]',
}

export function ImageUpload({ value, onChange, establishmentId, folder, label = 'Imagem', aspectClassName }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<File | null>(null)
  const format = IMAGE_FORMATS[folder]
  const frame = aspectClassName || PREVIEW[folder]

  const pick = (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem (JPG, PNG, WEBP...).')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Imagem muito grande. O limite é 12MB.')
      return
    }
    if (!establishmentId) {
      setError('Aguarde o carregamento da loja e tente novamente.')
      return
    }
    setPending(file)
  }

  const upload = async (cropped: File) => {
    setPending(null)
    setUploading(true)
    log('upload', 'iniciando upload de imagem', { folder, size: cropped.size })
    try {
      const supabase = createClient()
      // Já vem no tamanho padrão do recorte; aqui só comprime (WebP).
      const compressed = folder === 'logo'
        ? await compressImage(cropped, format.width, 0.9, 'png')
        : await compressImage(cropped, format.width, 0.85)
      const path = `${establishmentId}/${folder}/${crypto.randomUUID()}.${extensionForBlob(compressed)}`
      const { error: uploadError } = await supabase.storage.from('uploads').upload(path, compressed, {
        contentType: compressed.type || 'image/jpeg',
        upsert: true,
      })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('uploads').getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (err: any) {
      logError('upload', 'erro ao enviar imagem', err)
      setError(err.message || 'Erro ao enviar imagem. Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      {value ? (
        <div className="relative inline-block w-full max-w-md">
          <div className={`relative ${frame} rounded-lg overflow-hidden border border-gray-200`}>
            <SmartImage src={value} alt="Prévia" fill sizes="448px" className="object-cover" />
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="btn-secondary text-xs py-1.5">
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              Trocar imagem
            </button>
            <button type="button" onClick={() => onChange('')} className="btn-secondary text-xs py-1.5 text-red-600">
              <X size={12} /> Remover
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`${frame} border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-primary-400 hover:text-primary-500 transition-colors disabled:opacity-60 p-2`}
        >
          {uploading ? (
            <>
              <Loader2 size={24} className="animate-spin" />
              <span className="text-sm">Enviando...</span>
            </>
          ) : (
            <>
              <ImageIcon size={22} />
              <span className="text-sm text-center">Enviar foto</span>
            </>
          )}
        </button>
      )}

      <p className="text-xs text-gray-500 mt-1.5">
        Tamanho ideal: <strong>{format.label}</strong> ({format.ratioLabel}). Ao enviar, você ajusta o recorte.
      </p>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

      {pending && <ImageCropper file={pending} format={format} onCancel={() => setPending(null)} onDone={upload} />}
    </div>
  )
}
