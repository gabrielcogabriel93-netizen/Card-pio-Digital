'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/image'
import { log, logError } from '@/lib/logger'
import { Upload, X, Loader2, ImageIcon } from 'lucide-react'

const MAX_FILE_SIZE = 8 * 1024 * 1024 // 8MB (antes da compressão)

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  establishmentId: string
  folder: 'products' | 'logo'
  label?: string
  aspectClassName?: string
}

export function ImageUpload({
  value,
  onChange,
  establishmentId,
  folder,
  label = 'Imagem',
  aspectClassName = 'h-40 w-full max-w-xs',
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)

    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem (JPG, PNG, WEBP...).')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Imagem muito grande. O limite é 8MB.')
      return
    }
    if (!establishmentId) {
      setError('Aguarde o carregamento da loja e tente novamente.')
      return
    }

    setUploading(true)
    log('upload', 'iniciando upload de imagem', { folder, originalSize: file.size })

    try {
      const supabase = createClient()
      const compressed = await compressImage(file)
      log('upload', 'imagem comprimida', { compressedSize: compressed.size })

      const path = `${establishmentId}/${folder}/${crypto.randomUUID()}.jpg`
      const { error: uploadError } = await supabase.storage.from('uploads').upload(path, compressed, {
        contentType: 'image/jpeg',
        upsert: true,
      })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('uploads').getPublicUrl(path)
      log('upload', 'upload concluído', { url: data.publicUrl })
      onChange(data.publicUrl)
    } catch (err: any) {
      logError('upload', 'erro ao enviar imagem', err)
      setError(err.message || 'Erro ao enviar imagem. Tente novamente.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {value ? (
        <div className="relative inline-block">
          <img
            src={value}
            alt="Preview"
            className={`${aspectClassName} rounded-lg object-cover border border-gray-200`}
          />
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow"
            title="Remover imagem"
          >
            <X size={14} />
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-1 right-1 bg-black/60 hover:bg-black/70 text-white text-xs px-2 py-1 rounded flex items-center gap-1"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            Trocar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`${aspectClassName} border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary-400 hover:text-primary-500 transition-colors disabled:opacity-60`}
        >
          {uploading ? (
            <>
              <Loader2 size={24} className="animate-spin" />
              <span className="text-sm">Enviando...</span>
            </>
          ) : (
            <>
              <ImageIcon size={24} />
              <span className="text-sm">Clique para enviar uma foto</span>
            </>
          )}
        </button>
      )}

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}
