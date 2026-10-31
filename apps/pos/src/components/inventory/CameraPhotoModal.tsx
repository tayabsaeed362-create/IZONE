'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Camera, Check, LoaderCircle, RotateCcw, X } from 'lucide-react'

export function CameraPhotoModal({ onUse, onClose }: { onUse: (file: File) => void | Promise<void>; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const request = useRef(0)
  const alive = useRef(false)
  const previewUrl = useRef('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [ready, setReady] = useState(false)
  const [starting, setStarting] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const stop = useCallback(() => {
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
  }, [])
  const start = useCallback(async () => {
    const current = ++request.current
    stop(); setReady(false); setStarting(true); setError('')
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Camera access requires HTTPS or localhost and a supported browser. You can still use Upload Photo.'); setStarting(false); return
    }
    try {
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: mobile ? 'environment' : 'user' }, width: { ideal: 1920 }, height: { ideal: 1080 } } })
      // A permission prompt can resolve after Cancel or a newer camera request.
      if (!alive.current || current !== request.current) { media.getTracks().forEach(track => track.stop()); return }
      stream.current = media
      const element = video.current
      if (!element) { stop(); return }
      element.srcObject = media
      media.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (alive.current && current === request.current) { setReady(false); setError('Camera disconnected. Reconnect it and try again.') }
      }, { once: true }))
      await element.play()
      if (alive.current && current === request.current) { setReady(element.videoWidth > 0); setStarting(false) }
    } catch (err) {
      if (!alive.current || current !== request.current) return
      stop(); setStarting(false)
      const name = err instanceof DOMException ? err.name : ''
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'Camera permission was denied. Allow camera access in your browser settings, then try again.' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'No camera is available. Connect a webcam or use Upload Photo.' : name === 'NotReadableError' ? 'The camera is busy or unavailable. Close other apps using it, then try again.' : 'Unable to start the camera. Check the device and browser permissions, then try again.')
    }
  }, [stop])
  useEffect(() => {
    alive.current = true; void start()
    return () => { alive.current = false; request.current++; stop(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current) }
  }, [start, stop])
  const capture = async () => {
    const element = video.current
    if (!element || !ready || !element.videoWidth || !element.videoHeight) return
    setWorking(true); setError('')
    try {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 1920 / Math.max(element.videoWidth, element.videoHeight))
      canvas.width = Math.round(element.videoWidth * scale); canvas.height = Math.round(element.videoHeight * scale)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Unable to capture this photo.')
      context.drawImage(element, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to capture this photo.')), 'image/jpeg', .9))
      if (!alive.current) return
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' })
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      previewUrl.current = URL.createObjectURL(file)
      setPhoto(file); setPreview(previewUrl.current); setReady(false); stop()
    } catch { if (alive.current) setError('Unable to capture this photo. Please try again.') }
    finally { if (alive.current) setWorking(false) }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[75] bg-slate-950/70 backdrop-blur-sm"/><Dialog.Content className="fixed z-[76] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%_-_2rem)] max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6 shadow-xl">
    <div className="flex items-center justify-between gap-3 mb-2"><Dialog.Title className="text-lg font-semibold text-slate-900">{photo ? 'Review photo' : 'Take Photo'}</Dialog.Title><button type="button" aria-label="Close camera" className="p-2 text-slate-500" onClick={onClose}><X size={20}/></button></div>
    <Dialog.Description className="text-sm text-slate-500 mb-4">{photo ? 'Use this photo or retake it before attaching.' : 'Position the product in the frame, then capture a photo.'}</Dialog.Description>
    <div className="relative rounded-xl overflow-hidden bg-slate-950 aspect-[4/3]">
      <video ref={video} autoPlay playsInline muted hidden={!!photo} aria-label="Live camera preview" className="w-full h-full object-contain" onLoadedData={() => { if (stream.current && video.current?.videoWidth) setReady(true) }}/>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo && <img src={preview} alt="Captured photo preview" className="w-full h-full object-contain"/>}
      {starting && !photo && <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white text-sm"><LoaderCircle className="animate-spin" size={24}/>Waiting for camera access...</div>}
    </div>
    {error && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-3 rounded-lg mt-3">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2 mt-4">
      <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
      {photo ? <><button type="button" disabled={working} className="btn-secondary" onClick={() => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = ''; setPhoto(null); setPreview(''); void start() }}><RotateCcw size={16}/>Retake</button><button type="button" disabled={working} className="btn-primary" onClick={async () => { setWorking(true); try { await onUse(photo); if (alive.current) onClose() } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : 'Unable to attach photo.') } finally { if (alive.current) setWorking(false) } }}><Check size={16}/>{working ? 'Attaching...' : 'Use Photo'}</button></> : <>{error && <button type="button" className="btn-secondary" onClick={() => void start()}>Try again</button>}<button type="button" className="btn-primary" disabled={!ready || starting || working} onClick={() => void capture()}><Camera size={16}/>Capture</button></>}
    </div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
