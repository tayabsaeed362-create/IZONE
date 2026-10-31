'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType, NotFoundException } from '@zxing/library'

export type ScannerState = {
  isScanning: boolean
  isLoading: boolean
  hasTorch: boolean
  torchOn: boolean
  hasMultipleCameras: boolean
  currentCameraIndex: number
  cameras: MediaDeviceInfo[]
  error: string | null
  lastScanned: string | null
}

type UseBarcodeScanner = {
  state: ScannerState
  videoRef: React.RefObject<HTMLVideoElement | null>
  startScanning: () => Promise<void>
  stopScanning: () => void
  toggleTorch: () => Promise<void>
  switchCamera: () => Promise<void>
  resetScanner: () => void
  onDetected: (callback: (barcode: string) => void) => void
}

export function useBarcodeScanner(): UseBarcodeScanner {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const detectedCallbackRef = useRef<((barcode: string) => void) | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastDetectedRef = useRef<{ code: string; time: number } | null>(null)

  const [state, setState] = useState<ScannerState>({
    isScanning: false,
    isLoading: false,
    hasTorch: false,
    torchOn: false,
    hasMultipleCameras: false,
    currentCameraIndex: 0,
    cameras: [],
    error: null,
    lastScanned: null,
  })

  const updateState = useCallback((update: Partial<ScannerState>) => {
    setState(prev => ({ ...prev, ...update }))
  }, [])

  // ── Initialize reader ──────────────────────────────────────
  const getReader = useCallback(() => {
    if (!readerRef.current) {
      const hints = new Map()
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.ITF,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      readerRef.current = new BrowserMultiFormatReader(hints, 200)
    }
    return readerRef.current
  }, [])

  // ── Check torch support ────────────────────────────────────
  const checkTorchSupport = useCallback(async (stream: MediaStream): Promise<boolean> => {
    try {
      const track = stream.getVideoTracks()[0]
      if (!track) return false
      const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined
      return Boolean(capabilities?.torch)
    } catch {
      return false
    }
  }, [])

  // ── Start scanning ─────────────────────────────────────────
  const startScanning = useCallback(async (preferredCameraId?: string) => {
    if (state.isScanning || state.isLoading) return

    // Verify browser support for camera stream
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      updateState({
        error: 'Camera is not supported on this browser or requires HTTPS.',
        isLoading: false,
        isScanning: false,
      })
      return
    }

    updateState({ isLoading: true, error: null })

    try {
      // 1. Wait a moment if video element is still mounting
      let videoEl = videoRef.current
      let attempts = 0
      while (!videoEl && attempts < 10) {
        await new Promise(res => setTimeout(res, 80))
        videoEl = videoRef.current
        attempts++
      }

      if (!videoEl) {
        updateState({ error: 'Video element not ready. Try again.', isLoading: false })
        return
      }

      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      // 2. Request camera stream directly — this triggers the browser's permission prompt!
      let stream: MediaStream
      const videoConstraints: MediaTrackConstraints = preferredCameraId
        ? { deviceId: { exact: preferredCameraId } }
        : {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        })
      } catch (firstErr) {
        // Fallback to basic video without constraints if ideal facingMode failed
        console.warn('Initial camera constraint failed, attempting plain video:', firstErr)
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      }

      streamRef.current = stream

      // 3. Now that permission is granted, enumerate all cameras
      let cameras: MediaDeviceInfo[] = []
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices()
        cameras = allDevices.filter(d => d.kind === 'videoinput')
      } catch {
        cameras = []
      }

      const hasTorch = await checkTorchSupport(stream)
      const reader = getReader()

      // Bind stream to video element
      videoEl.srcObject = stream
      await videoEl.play().catch(() => {})

      // 4. Start decoding from stream
      reader.decodeFromStream(stream, videoEl, (result, error) => {
        if (result) {
          const code = result.getText().trim()
          if (!code) return
          const now = Date.now()

          // Debounce: ignore same code within 1.5 seconds
          if (lastDetectedRef.current?.code === code && now - lastDetectedRef.current.time < 1500) {
            return
          }
          lastDetectedRef.current = { code, time: now }

          updateState({ lastScanned: code })
          detectedCallbackRef.current?.(code)
        }
        if (error && !(error instanceof NotFoundException)) {
          // Normal background frame without barcode
        }
      })

      const rearIndex = cameras.findIndex(c =>
        c.label.toLowerCase().includes('back') ||
        c.label.toLowerCase().includes('rear') ||
        c.label.toLowerCase().includes('environment')
      )

      updateState({
        isScanning: true,
        isLoading: false,
        cameras,
        currentCameraIndex: rearIndex >= 0 ? rearIndex : 0,
        hasMultipleCameras: cameras.length > 1,
        hasTorch,
        error: null,
      })
    } catch (err: unknown) {
      let errorMsg = 'Camera access failed.'
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          errorMsg = 'Camera permission was denied. Please allow camera access in your browser site settings.'
        } else if (err.name === 'NotFoundError') {
          errorMsg = 'No camera device found on this system.'
        } else if (err.name === 'NotReadableError') {
          errorMsg = 'Camera is in use by another application.'
        } else {
          errorMsg = `Camera error: ${err.message}`
        }
      } else if (err instanceof Error) {
        errorMsg = err.message
      }
      updateState({ error: errorMsg, isLoading: false, isScanning: false })
    }
  }, [state.isScanning, state.isLoading, getReader, checkTorchSupport, updateState])

  // ── Stop scanning ──────────────────────────────────────────
  const stopScanning = useCallback(() => {
    try {
      readerRef.current?.reset()
    } catch {}
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    updateState({ isScanning: false, torchOn: false })
  }, [updateState])

  // ── Toggle torch ───────────────────────────────────────────
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current || !state.hasTorch) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return
    try {
      const newTorch = !state.torchOn
      // @ts-ignore
      await track.applyConstraints({ advanced: [{ torch: newTorch }] })
      updateState({ torchOn: newTorch })
    } catch {
      // Torch not supported on this device
    }
  }, [state.hasTorch, state.torchOn, updateState])

  // ── Switch camera ──────────────────────────────────────────
  const switchCamera = useCallback(async () => {
    if (state.cameras.length <= 1) return
    const nextIndex = (state.currentCameraIndex + 1) % state.cameras.length
    const nextCamera = state.cameras[nextIndex]

    stopScanning()
    updateState({ currentCameraIndex: nextIndex })
    setTimeout(() => {
      startScanning(nextCamera?.deviceId)
    }, 200)
  }, [state.cameras, state.currentCameraIndex, stopScanning, startScanning, updateState])

  // ── Register callback ──────────────────────────────────────
  const onDetected = useCallback((callback: (barcode: string) => void) => {
    detectedCallbackRef.current = callback
  }, [])

  const resetScanner = useCallback(() => {
    stopScanning()
    updateState({ error: null, lastScanned: null })
  }, [stopScanning, updateState])

  // ── Cleanup ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        readerRef.current?.reset()
      } catch {}
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [])

  return {
    state,
    videoRef,
    startScanning,
    stopScanning,
    toggleTorch,
    switchCamera,
    resetScanner,
    onDetected,
  }
}
