'use client'
import { useEffect } from 'react'
import { Camera, X } from 'lucide-react'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'

export function CaptureCode({ label, onCapture, onClose }: { label: string; onCapture: (code: string) => void; onClose: () => void }) {
  const { state, videoRef, startScanning, stopScanning, onDetected } = useBarcodeScanner()
  useEffect(() => {
    onDetected(code => { stopScanning(); onCapture(code.trim()) })
    return () => stopScanning()
  }, [onDetected, onCapture, stopScanning])
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [onClose])
  return <div className="fixed inset-0 z-[70] bg-slate-950/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Scan ${label}`}><div className="bg-white rounded-2xl w-full max-w-md p-5"><div className="flex justify-between items-center mb-4"><h2 className="font-semibold">Scan {label}</h2><button type="button" onClick={onClose} aria-label="Close scanner" className="p-2"><X size={20}/></button></div><video ref={videoRef} autoPlay playsInline muted className="w-full aspect-square bg-slate-900 rounded-xl object-cover"/><p className="text-xs text-slate-500 mt-3">Point the camera at the {label} barcode. The scanned value will fill the field automatically.</p>{state.error && <p role="alert" className="text-sm text-red-600 mt-3">{state.error}</p>}<button type="button" disabled={state.isLoading || state.isScanning} onClick={startScanning} className="btn-primary mt-4 w-full"><Camera size={16}/>{state.isLoading ? 'Starting camera...' : state.isScanning ? 'Scanning...' : 'Start camera'}</button></div></div>
}
