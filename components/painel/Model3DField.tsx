'use client'

// Campo "Prato em 3D" do cadastro de produto: envia o .glb (e, se quiser, o
// .usdz do iPhone) para o storage da loja e grava na hora no produto.
import { useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Model3DViewer } from '@/components/store/Model3DViewer'
import { formatMB, MODEL_IDEAL_BYTES, modelFileProblem, type ModelKind } from '@/lib/model3d'
import { toast, confirmDialog } from '@/components/Feedback'
import { Box, Eye, Loader2, Trash2, Upload } from 'lucide-react'

interface Props {
  establishmentId: string
  productId: string | null
  productName: string
  imageUrl?: string | null
  value: string | null
  iosValue: string | null
  onChange: (next: { model_3d_url: string | null; model_3d_ios_url: string | null }) => void
}

const CONTENT_TYPE: Record<ModelKind, string> = { glb: 'model/gltf-binary', usdz: 'model/vnd.usdz+zip' }

function storagePath(url: string | null): string | null {
  if (!url) return null
  const i = url.indexOf('/storage/v1/object/public/uploads/')
  return i >= 0 ? decodeURIComponent(url.slice(i + '/storage/v1/object/public/uploads/'.length)) : null
}

export function Model3DField({ establishmentId, productId, productName, imageUrl, value, iosValue, onChange }: Props) {
  const glbRef = useRef<HTMLInputElement>(null)
  const usdzRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<ModelKind | 'remover' | null>(null)
  const [preview, setPreview] = useState(false)

  const save = async (patch: { model_3d_url?: string | null; model_3d_ios_url?: string | null }) => {
    const { error } = await createClient().from('products').update(patch).eq('id', productId!)
    if (error) {
      if (/model_3d/.test(error.message)) throw new Error('O banco ainda não tem o recurso de 3D. Rode a migration 061 no Supabase.')
      throw error
    }
    onChange({ model_3d_url: patch.model_3d_url !== undefined ? patch.model_3d_url : value, model_3d_ios_url: patch.model_3d_ios_url !== undefined ? patch.model_3d_ios_url : iosValue })
  }

  const upload = async (kind: ModelKind, file: File | undefined) => {
    if (!file || !productId) return
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    const problem = modelFileProblem(file, head, kind)
    if (problem) return toast.error(problem)
    setBusy(kind)
    try {
      const supabase = createClient()
      const path = `${establishmentId}/models/${crypto.randomUUID()}.${kind}`
      const { error } = await supabase.storage.from('uploads').upload(path, file, { contentType: CONTENT_TYPE[kind], cacheControl: '31536000' })
      if (error) throw error
      const url = supabase.storage.from('uploads').getPublicUrl(path).data.publicUrl
      const old = storagePath(kind === 'glb' ? value : iosValue)
      await save(kind === 'glb' ? { model_3d_url: url } : { model_3d_ios_url: url })
      if (old) supabase.storage.from('uploads').remove([old]).catch(() => {})
      toast.success(kind === 'glb' ? `Prato em 3D no ar (${formatMB(file.size)}).` : 'Arquivo do iPhone salvo.')
      if (kind === 'glb' && file.size > MODEL_IDEAL_BYTES) toast(`O arquivo tem ${formatMB(file.size)}: funciona, mas demora no 4G. Se puder, exporte com textura 2K.`)
    } catch (e) {
      toast.error('Erro ao enviar o modelo: ' + (e as Error).message)
    } finally {
      setBusy(null)
      if (glbRef.current) glbRef.current.value = ''
      if (usdzRef.current) usdzRef.current.value = ''
    }
  }

  const remove = async () => {
    if (!(await confirmDialog('Tirar o 3D deste prato? A foto continua no cardápio.'))) return
    setBusy('remover')
    try {
      const paths = [storagePath(value), storagePath(iosValue)].filter(Boolean) as string[]
      await save({ model_3d_url: null, model_3d_ios_url: null })
      if (paths.length) createClient().storage.from('uploads').remove(paths).catch(() => {})
      setPreview(false)
      toast.success('3D removido.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5"><Box size={16} className="text-primary-600" /> Prato em 3D e realidade aumentada <span className="text-xs font-normal text-gray-500">(opcional)</span></p>
          <p className="text-xs text-gray-500 mt-0.5">O cliente gira o prato e vê na mesa dele pela câmera. <Link href="/painel/pratos-3d" className="text-primary-700 underline" target="_blank">Como fazer o 3D do prato</Link></p>
        </div>
        {value && <span className="text-[11px] font-semibold text-green-800 bg-green-100 rounded-full px-2 py-0.5 flex-shrink-0">No ar</span>}
      </div>

      {!productId ? (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2">Salve o produto primeiro; depois envie o arquivo 3D aqui.</p>
      ) : (
        <>
          {value && preview && (
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-gray-100">
              <Model3DViewer src={value} iosSrc={iosValue} poster={imageUrl} alt={`${productName} em 3D`} />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy} onClick={() => glbRef.current?.click()} className="btn-secondary text-sm py-1.5">
              {busy === 'glb' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {value ? 'Trocar arquivo 3D (.glb)' : 'Enviar arquivo 3D (.glb)'}
            </button>
            {value && (
              <>
                <button type="button" onClick={() => setPreview((v) => !v)} className="btn-secondary text-sm py-1.5"><Eye size={15} /> {preview ? 'Fechar prévia' : 'Ver prévia'}</button>
                <button type="button" disabled={!!busy} onClick={() => usdzRef.current?.click()} className="btn-secondary text-sm py-1.5">
                  {busy === 'usdz' ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {iosValue ? 'Trocar .usdz (iPhone)' : '.usdz do iPhone (opcional)'}
                </button>
                <button type="button" disabled={!!busy} onClick={remove} className="text-sm text-red-600 hover:underline inline-flex items-center gap-1"><Trash2 size={14} /> Remover 3D</button>
              </>
            )}
          </div>
          <p className="text-[11px] text-gray-500">Arquivo .glb de até 15 MB (ideal até 8 MB). Sem o .usdz, o iPhone usa uma versão gerada na hora a partir do .glb.</p>
        </>
      )}
      <input ref={glbRef} type="file" accept=".glb,model/gltf-binary" className="hidden" onChange={(e) => upload('glb', e.target.files?.[0])} />
      <input ref={usdzRef} type="file" accept=".usdz,model/vnd.usdz+zip" className="hidden" onChange={(e) => upload('usdz', e.target.files?.[0])} />
    </div>
  )
}
