'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner'
import { formatCurrency } from '@izone/shared'
import { findBarcodeOffline } from '@/lib/db'

export interface ScannedProductItem {
  matchType: 'product' | 'variant'
  productId: string
  variantId?: string | null
  productName: string
  variantName?: string | null
  displayName: string
  sku: string
  sellingPrice: number
  minSellingPrice?: number
  discountAmount?: number
  quantity: number
  images?: string[]
  hasImei?: boolean
  categoryName?: string | null
  barcode: string
}

interface BarcodeScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onProductScanned: (item: ScannedProductItem) => void
  autoAdd?: boolean
}

export function BarcodeScannerModal({
  isOpen,
  onClose,
  onProductScanned,
  autoAdd = true,
}: BarcodeScannerModalProps) {
  const {
    state,
    videoRef,
    startScanning,
    stopScanning,
    toggleTorch,
    switchCamera,
    onDetected,
    resetScanner,
  } = useBarcodeScanner()

  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera')
  const [manualCode, setManualCode] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lastFoundItem, setLastFoundItem] = useState<ScannedProductItem | null>(null)
  const [autoAddEnabled, setAutoAddEnabled] = useState(autoAdd)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // ── Web Audio confirmation beep ──────────────────────────────
  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx()
        }
      }
      const ctx = audioCtxRef.current
      if (ctx && ctx.state !== 'closed') {
        if (ctx.state === 'suspended') {
          ctx.resume()
        }
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(880, ctx.currentTime) // A5 pleasant chime
        gain.gain.setValueAtTime(0.18, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.14)
      }
    } catch {
      // Audio autoplay policy fallback
    }

    // Vibration feedback on supported mobile devices
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([40, 30, 80])
      }
    } catch {
      // Vibration not permitted
    }
  }, [])

  // ── Lookup barcode in database (Online or Offline IndexedDB) ─
  const lookupBarcode = useCallback(
    async (code: string) => {
      const clean = code.trim()
      if (!clean || isLookingUp) return
      setIsLookingUp(true)
      setLookupError(null)

      // 1. Try Online API if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const res = await fetch(`/api/products/barcode/${encodeURIComponent(clean)}`)
          const json = await res.json()

          if (res.ok && json.success && json.data) {
            const item: ScannedProductItem = json.data
            playBeep()
            setLastFoundItem(item)

            if (autoAddEnabled) {
              onProductScanned(item)
            }
            setIsLookingUp(false)
            return
          }
        } catch {
          // Network request failed — fallback to local IndexedDB resolution below
        }
      }

      // 2. Offline / Local IndexedDB Resolution
      try {
        const localMatch = await findBarcodeOffline(clean)
        if (localMatch) {
          const item: ScannedProductItem = {
            matchType: localMatch.variantId ? 'variant' : 'product',
            productId: localMatch.productId,
            variantId: localMatch.variantId || null,
            productName: localMatch.productName,
            variantName: localMatch.variantName || null,
            displayName: localMatch.displayName,
            sku: localMatch.sku,
            sellingPrice: localMatch.sellingPrice,
            minSellingPrice: localMatch.minSellingPrice || 0,
            quantity: localMatch.quantity,
            images: localMatch.images,
            hasImei: localMatch.hasImei,
            categoryName: localMatch.categoryName,
            barcode: localMatch.barcode,
          }
          playBeep()
          setLastFoundItem(item)

          if (autoAddEnabled) {
            onProductScanned(item)
          }
        } else {
          setLookupError(`Barcode or SKU "${clean}" was not found in catalog.`)
          setLastFoundItem(null)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error resolving barcode offline'
        setLookupError(msg)
        setLastFoundItem(null)
      } finally {
        setIsLookingUp(false)
      }
    },
    [autoAddEnabled, isLookingUp, onProductScanned, playBeep]
  )

  // ── Hook scanner detection ───────────────────────────────────
  useEffect(() => {
    onDetected((code: string) => {
      lookupBarcode(code)
    })
  }, [onDetected, lookupBarcode])

  // ── Start / Stop scanning based on modal state ───────────────
  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startScanning()
    } else {
      stopScanning()
    }

    return () => {
      stopScanning()
    }
  }, [isOpen, activeTab, startScanning, stopScanning])

  // Handle manual submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualCode.trim()) {
      lookupBarcode(manualCode.trim())
    }
  }

  // Handle manual add-to-cart button
  const handleManualAdd = () => {
    if (lastFoundItem) {
      onProductScanned(lastFoundItem)
      setLastFoundItem(null)
      setLookupError(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-600/20 text-primary-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Smart Barcode Scanner</h3>
              <p className="text-[11px] text-zinc-400">Scan camera or enter barcode / SKU</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopScanning()
              resetScanner()
              onClose()
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
            aria-label="Close scanner"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/40 px-5 pt-2">
          <button
            onClick={() => setActiveTab('camera')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition ${
              activeTab === 'camera'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            📷 Camera Viewfinder
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`pb-2.5 px-3 text-xs font-medium border-b-2 transition ${
              activeTab === 'manual'
                ? 'border-primary-500 text-primary-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            ⌨️ Manual Barcode / SKU
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3.5">
          {activeTab === 'camera' ? (
            <div className="space-y-3">
              {/* Viewfinder Container */}
              <div className="relative aspect-[4/3] w-full bg-black rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                  autoPlay
                />

                {/* Laser Overlay & Target Box */}
                {state.isScanning && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative w-3/4 h-3/5 border-2 border-primary-500/80 rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.3)]">
                      {/* Corner Accents */}
                      <span className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-primary-400" />
                      <span className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-primary-400" />
                      <span className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-primary-400" />
                      <span className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-primary-400" />

                      {/* Animated Red Laser Beam */}
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_8px_#ef4444] animate-bounce" />
                    </div>
                  </div>
                )}

                {/* Loading State */}
                {state.isLoading && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 text-zinc-300">
                    <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Initializing rear camera...</span>
                  </div>
                )}

                {/* Camera Error Message */}
                {state.error && (
                  <div className="absolute inset-0 bg-black/90 p-5 flex flex-col items-center justify-center text-center gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <p className="text-xs text-red-300 max-w-xs">{state.error}</p>
                    <button
                      onClick={() => setActiveTab('manual')}
                      className="mt-1 px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-200 hover:bg-zinc-700 transition"
                    >
                      Use Manual Input Instead
                    </button>
                  </div>
                )}
              </div>

              {/* Viewfinder Controls */}
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <div className="flex items-center gap-2">
                  {state.hasTorch && (
                    <button
                      onClick={toggleTorch}
                      className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
                        state.torchOn
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      <span>💡</span>
                      <span>{state.torchOn ? 'Torch On' : 'Torch Off'}</span>
                    </button>
                  )}

                  {state.hasMultipleCameras && (
                    <button
                      onClick={switchCamera}
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 transition flex items-center gap-1.5"
                    >
                      <span>🔄</span>
                      <span>Switch Camera</span>
                    </button>
                  )}
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-xs select-none">
                  <input
                    type="checkbox"
                    checked={autoAddEnabled}
                    onChange={(e) => setAutoAddEnabled(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-800 text-primary-600 focus:ring-0"
                  />
                  <span>Auto-add to cart</span>
                </label>
              </div>
            </div>
          ) : (
            /* Manual Input Mode */
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Enter Barcode or SKU
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="e.g. 8806095262239 or SAM-S24U"
                    autoFocus
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-primary-500"
                  />
                  <button
                    type="submit"
                    disabled={isLookingUp || !manualCode.trim()}
                    className="px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs font-semibold transition"
                  >
                    {isLookingUp ? 'Looking up...' : 'Search'}
                  </button>
                </div>
              </div>

              {/* Quick sample chips */}
              <div className="pt-2">
                <span className="text-[11px] text-zinc-500">Quick Test Barcodes:</span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {[
                    { label: 'S24 Ultra 512GB (Variant)', code: '8806095262239' },
                    { label: 'S24 Ultra Cover', code: '8806095288406' },
                    { label: 'iPhone 15 PM 512GB', code: '194253418566' },
                    { label: 'Earphones White', code: 'IZ-EAR-WHT-001' },
                    { label: 'Anker 65W GaN', code: '0194644137892' },
                  ].map((chip) => (
                    <button
                      key={chip.code}
                      type="button"
                      onClick={() => {
                        setManualCode(chip.code)
                        lookupBarcode(chip.code)
                      }}
                      className="px-2 py-1 rounded bg-zinc-800/80 hover:bg-zinc-700 text-[11px] text-zinc-300 transition"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}

          {/* Lookup Status Indicator */}
          {isLookingUp && (
            <div className="p-3 rounded-xl bg-primary-950/40 border border-primary-800/50 flex items-center gap-2.5 text-xs text-primary-300">
              <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              <span>Querying database for product details...</span>
            </div>
          )}

          {/* Lookup Error Message */}
          {lookupError && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-xs text-red-300 flex items-start gap-2">
              <span className="text-sm">⚠️</span>
              <div className="flex-1">
                <p className="font-medium">Barcode not recognized</p>
                <p className="text-[11px] text-red-400 mt-0.5">{lookupError}</p>
              </div>
            </div>
          )}

          {/* Scanned Product Match Card */}
          {lastFoundItem && (
            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 text-white space-y-2 animate-fadeIn">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold uppercase text-[10px]">
                      {lastFoundItem.matchType === 'variant' ? 'Variant Match' : 'Product Match'}
                    </span>
                    <span className="text-[11px] text-zinc-400">SKU: {lastFoundItem.sku}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-emerald-200 mt-1">
                    {lastFoundItem.displayName}
                  </h4>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-white">
                    {formatCurrency(lastFoundItem.sellingPrice)}
                  </span>
                  <div className="text-[11px] text-zinc-300">
                    Stock:{' '}
                    <span className={lastFoundItem.quantity <= 3 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-semibold'}>
                      {lastFoundItem.quantity} units
                    </span>
                  </div>
                </div>
              </div>

              {!autoAddEnabled && (
                <button
                  type="button"
                  onClick={handleManualAdd}
                  className="w-full mt-2 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                >
                  ➕ Add Item to Cart
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between text-xs text-zinc-400">
          <span>Supported: EAN-13, UPC-A, Code-128, QR</span>
          <button
            onClick={() => {
              stopScanning()
              resetScanner()
              onClose()
            }}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
