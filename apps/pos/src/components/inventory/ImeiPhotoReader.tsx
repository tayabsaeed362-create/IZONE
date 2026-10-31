'use client'
import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, LoaderCircle, Check, X } from 'lucide-react'
import { CameraPhotoModal } from './CameraPhotoModal'
import { hasValidImeiChecksum, type ImeiPhotoResult } from '@/lib/imei-photo'

type Props = { onApply: (values: { imei1?: string; imei2?: string }) => void }
export function ImeiPhotoReader({ onApply }: Props) {
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  const [review, setReview] = useState<ImeiPhotoResult | null>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const job = useRef<AbortController | null>(null)
  const previewRef = useRef('')
  useEffect(() => () => { job.current?.abort(); if (previewRef.current) URL.revokeObjectURL(previewRef.current) }, [])
  const clear = () => {
    job.current?.abort(); job.current = null
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = ''; setPreview(''); setReview(null); setReading(false); setError('')
  }
  const read = async (file: File | undefined) => {
    if (!file) return
    clear()
    if (!/^image\/(jpeg|png|webp|bmp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
      setError('Choose a JPG, PNG, WebP or BMP photo under 20 MB.'); return
    }
    const controller = new AbortController(); job.current = controller
    previewRef.current = URL.createObjectURL(file); setPreview(previewRef.current)
    setReading(true); setProgress(0)
    try {
      const { readImeiPhoto } = await import('@/lib/read-imei-photo')
      const result = await readImeiPhoto(file, controller.signal, setProgress)
      if (controller.signal.aborted) return
      setReview(result)
      if (!result.imei1 && !result.imei2) setError('No complete IMEI found. Try a sharper photo with just the IMEI lines, or enter the numbers below.')
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to read this photo. Try another image.')
    } finally { if (!controller.signal.aborted) setReading(false) }
  }
  const valid = review && (review.imei1 || review.imei2) && (!review.imei1 || /^\d{15}$/.test(review.imei1)) && (!review.imei2 || /^\d{15}$/.test(review.imei2)) && (!review.imei1 || review.imei1 !== review.imei2)
  return <div className="space-y-3 border-b border-blue-100 pb-4">
    <div><h3 className="text-sm font-semibold text-slate-800">Read IMEI from a photo</h3><p className="text-xs text-slate-500 mt-1">Use a photo of the phone&apos;s IMEI screen. Review the numbers before filling the fields.</p></div>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-secondary text-xs" onClick={() => uploadRef.current?.click()}><ImagePlus size={16}/>Upload photo</button>
      <button type="button" className="btn-secondary text-xs" onClick={() => setCameraOpen(true)}><Camera size={16}/>Take photo</button>
    </div>
    <input ref={uploadRef} aria-label="Upload IMEI photo" className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/bmp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void read(file) }}/>
    {preview && <div className="rounded-xl border border-blue-100 bg-white p-3 space-y-3">
      {/* Local object URL only; never sent to an image optimization service. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Selected IMEI photo for review" className="w-full max-h-56 object-contain rounded-lg bg-slate-100"/>
      {reading && <div role="status" className="flex items-center gap-2 text-xs text-blue-700"><LoaderCircle size={16} className="animate-spin"/>Reading photo... {progress}%</div>}
      {review && <div className="space-y-3">
        <p className="text-xs font-medium text-slate-600">Check every digit against the photo. {review.unlabelled ? 'Labels were unclear; check which number belongs to IMEI 1 and IMEI 2.' : 'Only the numbers you confirm will be used.'}</p>
        {(['imei1', 'imei2'] as const).map((field, index) => <div key={field}><label htmlFor={`photo-${field}`} className="block text-xs font-semibold mb-1">Detected IMEI {index + 1}</label><input id={`photo-${field}`} type="text" inputMode="numeric" autoComplete="off" maxLength={15} className="input-field" value={review[field]} onKeyDown={event => { if(event.key === 'Enter') event.preventDefault() }} onChange={event => setReview({...review,[field]:event.target.value.replace(/\D/g,'')})}/>{review[field] && !hasValidImeiChecksum(review[field]) && <p className="text-xs text-amber-700 mt-1">Double-check this number: its IMEI check digit does not match.</p>}</div>)}
        {review.imei1 && review.imei1 === review.imei2 && <p className="text-xs text-red-600">IMEI 1 and IMEI 2 must be different.</p>}
        <button type="button" disabled={!valid} className="btn-primary w-full" onClick={() => { if (!review || !valid) return; onApply({ ...(review.imei1 ? {imei1:review.imei1} : {}), ...(review.imei2 ? {imei2:review.imei2} : {}) }); clear() }}><Check size={16}/>Use these IMEIs</button>
      </div>}
      <button type="button" className="text-xs text-slate-500 inline-flex items-center gap-1 p-2" onClick={clear}><X size={14}/>{reading ? 'Cancel reading' : 'Discard photo'}</button>
    </div>}
    {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}
    {cameraOpen && <CameraPhotoModal onUse={file => { void read(file) }} onClose={() => setCameraOpen(false)}/>}
    <p className="text-[11px] text-slate-500">Photo stays on this device. Clear, close-up photos work best.</p>
  </div>
}
