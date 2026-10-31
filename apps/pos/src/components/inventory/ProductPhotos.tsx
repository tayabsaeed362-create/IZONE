'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { CameraPhotoModal } from './CameraPhotoModal'
import { prepareProductPhoto } from '@/lib/product-photo'

export function ProductPhotos({ images, onChange, onBusyChange, disabled = false }: { images: string[]; onChange: (images: string[]) => void; onBusyChange: (busy: boolean) => void; disabled?: boolean }) {
  const [camera, setCamera] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const upload = useRef<HTMLInputElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const attach = async (file: File) => {
    if (images.length >= 4) throw new Error('You can attach up to four product photos.')
    setError(''); setProcessing(true); onBusyChange(true)
    try { const image = await prepareProductPhoto(file); if (alive.current) onChange([...images, image]) }
    finally { if (alive.current) { setProcessing(false); onBusyChange(false) } }
  }
  return <section aria-label="Product photos" className="space-y-3 rounded-xl border border-slate-200 p-4">
    <div><h2 className="text-sm font-semibold text-slate-800">Product Photos</h2><p className="text-xs text-slate-500 mt-1">Attach up to four photos. They are saved when you save the product.</p></div>
    <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" disabled={disabled || processing || images.length >= 4} onClick={() => setCamera(true)}><Camera size={16}/>Take Photo</button><button type="button" className="btn-secondary" disabled={disabled || processing || images.length >= 4} onClick={() => upload.current?.click()}><ImagePlus size={16}/>Upload Photo</button></div>
    <input type="file" ref={upload} aria-label="Upload product photo" className="hidden" accept="image/jpeg,image/png,image/webp,image/bmp" disabled={disabled || processing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void attach(file).catch(err => { if (alive.current) setError(err instanceof Error ? err.message : 'Unable to attach photo.') }) }}/>
    {processing && <p role="status" className="text-xs text-blue-700">Preparing photo...</p>}
    {images.length > 0 && <div className="grid grid-cols-2 gap-3">{images.map((image, index) => <div key={index} className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={`Attached product photo ${index + 1}`} className="w-full aspect-square object-contain"/>
      <button type="button" disabled={disabled || processing} aria-label={`Remove product photo ${index + 1}`} onClick={() => onChange(images.filter((_, i) => i !== index))} className="absolute top-1 right-1 bg-white/95 rounded-full p-2 text-slate-600"><X size={15}/></button>
    </div>)}</div>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {camera && <CameraPhotoModal onUse={attach} onClose={() => setCamera(false)}/>}
  </section>
}
