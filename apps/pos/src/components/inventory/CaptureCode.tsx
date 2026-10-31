'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Camera,
  X,
  RefreshCw,
  Zap,
  Keyboard,
  Check,
  AlertCircle,
  Upload,
  Sparkles,
  Maximize2,
} from 'lucide-react'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'

export function CaptureCode({
  label,
  onCapture,
  onClose,
}: {
  label: string
  onCapture: (code: string) => void
  onClose: () => void
}) {
  const {
    state,
    videoRef,
    startScanning,
    stopScanning,
    switchCamera,
    toggleTorch,
    onDetected,
    resetScanner,
    captureCurrentFrame,
    scanImage,
  } = useBarcodeScanner()

  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [inputError, setInputError] = useState('')
  const [isProcessingSnap, setIsProcessingSnap] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ── Pleasant Beep Sound ──────────────────────────────────────
  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioCtx) audioCtxRef.current = new AudioCtx()
      }
      const ctx = audioCtxRef.current
      if (ctx && ctx.state !== 'closed') {
        if (ctx.state === 'suspended') ctx.resume()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        gain.gain.setValueAtTime(0.2, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.12)
      }
    } catch {
      // Audio autoplay fallback
    }

    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([40, 20, 60])
      }
    } catch {
      // Vibration not supported
    }
  }, [])

  // ── Handle Scanned Code & Intelligent Cleaning ───────────────
  const handleCodeFound = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim()
      if (!code) return

      const isImei = label.toLowerCase().includes('imei')
      if (isImei) {
        // Extract numeric digits from string
        const digits = code.replace(/\D/g, '')
        if (digits.length >= 15) {
          const cleanImei = digits.slice(0, 15)
          playBeep()
          stopScanning()
          resetScanner()
          onCapture(cleanImei)
          return
        } else {
          setInputError(`Extracted ${digits.length} digits. A valid IMEI must have 15 digits.`)
          return
        }
      }

      // Standard Product Barcode
      playBeep()
      stopScanning()
      resetScanner()
      onCapture(code)
    },
    [label, onCapture, playBeep, resetScanner, stopScanning]
  )

  // ── Auto-start camera when modal mounts ───────────────────────
  useEffect(() => {
    if (activeTab === 'camera') {
      startScanning()
    } else {
      stopScanning()
    }
    return () => {
      stopScanning()
    }
  }, [activeTab, startScanning, stopScanning])

  // ── Listen for barcode detection from camera ─────────────────
  useEffect(() => {
    onDetected((code) => {
      handleCodeFound(code)
    })
  }, [onDetected, handleCodeFound])

  // ── Close on Escape key ──────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopScanning()
        resetScanner()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, stopScanning, resetScanner])

  // ── Snap Current Frame (Manual Snapshot Decode) ──────────────
  const handleSnapFrame = async () => {
    setIsProcessingSnap(true)
    setInputError('')
    try {
      const detected = await captureCurrentFrame()
      if (!detected) {
        setInputError('No barcode recognized in current frame. Hold still or bring closer.')
      }
    } catch {
      setInputError('Could not read frame. Please try again.')
    } finally {
      setIsProcessingSnap(false)
    }
  }

  // ── Upload Image File ────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsProcessingSnap(true)
    setInputError('')
    try {
      const detected = await scanImage(file)
      if (!detected) {
        setInputError('No barcode found in uploaded photo. Ensure barcode is clear and in focus.')
      }
    } catch {
      setInputError('Error decoding image file.')
    } finally {
      setIsProcessingSnap(false)
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleCodeFound(manualCode)
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={`Scan ${label}`}
    >
      <div className="bg-zinc-900 border border-zinc-800 text-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Camera size={18} />
            </div>
            <div>
              <h2 className="font-bold text-sm text-white">Scan {label}</h2>
              <p className="text-[11px] text-zinc-400">Position barcode inside camera viewfinder</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopScanning()
              resetScanner()
              onClose()
            }}
            aria-label="Close scanner"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Switch Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/30 px-5 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'camera'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Camera size={14} />
            Camera Viewfinder
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'manual'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Keyboard size={14} />
            Type / Scanner Gun
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-3.5">
          {inputError && (
            <div className="p-3 rounded-xl bg-red-950/60 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{inputError}</span>
            </div>
          )}

          {activeTab === 'camera' ? (
            <div className="space-y-3">
              {/* Viewfinder Canvas */}
              <div className="relative aspect-[4/3] w-full bg-black rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Laser & Reticle Aiming Frame */}
                {state.isScanning && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative w-4/5 h-3/5 border-2 border-blue-500/80 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                      {/* Corners */}
                      <span className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-blue-400" />
                      <span className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-blue-400" />
                      <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-blue-400" />
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-blue-400" />

                      {/* Moving Laser Beam */}
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-bounce" />
                    </div>
                  </div>
                )}

                {/* Loading Indicator */}
                {state.isLoading && (
                  <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-2.5 text-zinc-300">
                    <RefreshCw size={24} className="animate-spin text-blue-400" />
                    <span className="text-xs font-medium">Starting camera stream...</span>
                  </div>
                )}

                {/* Error Screen */}
                {state.error && (
                  <div className="absolute inset-0 bg-black/95 p-5 flex flex-col items-center justify-center text-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                      <AlertCircle size={20} />
                    </div>
                    <p className="text-xs text-red-300 max-w-xs">{state.error}</p>
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => startScanning()}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-200 hover:bg-zinc-700 transition"
                      >
                        Retry Camera
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('manual')}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-500 transition font-medium"
                      >
                        Enter Manually
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Viewfinder Controls & Snap Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  {state.hasMultipleCameras && (
                    <button
                      type="button"
                      onClick={switchCamera}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
                      title="Switch between front and back camera"
                    >
                      <RefreshCw size={13} />
                      <span>Switch Camera</span>
                    </button>
                  )}

                  {state.hasTorch && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 text-xs font-medium ${
                        state.torchOn
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                      }`}
                      title="Toggle flashlight"
                    >
                      <Zap size={13} />
                      <span>{state.torchOn ? 'Torch On' : 'Torch'}</span>
                    </button>
                  )}
                </div>

                {/* Snap & File Upload Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSnapFrame}
                    disabled={isProcessingSnap || !state.isScanning}
                    className="px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 transition flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
                    title="Capture still frame and decode"
                  >
                    {isProcessingSnap ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    <span>Snap & Scan</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 transition flex items-center gap-1.5 text-xs"
                    title="Upload photo of barcode"
                  >
                    <Upload size={13} />
                    <span>Upload Photo</span>
                  </button>
                </div>
              </div>

              <div className="bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
                <span>Hold barcode 10-20 cm away in steady light</span>
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Auto-Scanning
                </span>
              </div>
            </div>
          ) : (
            /* Manual / Hardware Scanner Gun Tab */
            <form onSubmit={handleManualSubmit} className="space-y-3.5 py-2">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Enter or Scan {label}:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    autoFocus
                    value={manualCode}
                    onChange={(e) => {
                      setManualCode(e.target.value)
                      setInputError('')
                    }}
                    placeholder={`Type or scan with barcode gun...`}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  Press Enter or click Confirm. USB / Bluetooth scanner guns work directly.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    stopScanning()
                    resetScanner()
                    onClose()
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition flex items-center gap-1.5"
                >
                  <Check size={14} />
                  Confirm {label}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
