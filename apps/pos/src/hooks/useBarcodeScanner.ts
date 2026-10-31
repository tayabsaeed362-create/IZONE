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
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      readerRef.current = new BrowserMultiFormatReader(hints, 200)
    }
    return readerRef.current
  }, [])

  // ── Enumerate cameras ──────────────────────────────────────
  const getCameras = useCallback(async (): Promise<MediaDeviceInfo[]> => {
    const reader = getReader()
    try {
      const devices = await reader.listVideoInputDevices()
      return devices
    } catch {
      return []
    }
  }, [getReader])

  // ── Check torch support ────────────────────────────────────
  const checkTorchSupport = useCallback(async (stream: MediaStream): Promise<boolean> => {
    const track = stream.getVideoTracks()[0]
    if (!track) return false
    const capabilities = track.getCapabilities()
    // @ts-ignore - torch is not in all browsers' type definitions
    return Boolean(capabilities.torch)
  }, [])

  // ── Start scanning ─────────────────────────────────────────
  const startScanning = useCallback(async () => {
    if (state.isScanning || state.isLoading) return
    updateState({ isLoading: true, error: null })

    try {
      const cameras = await getCameras()
      if (cameras.length === 0) {
        updateState({ error: 'No camera found. Please allow camera access.', isLoading: false })
        return
      }

      // Prefer rear camera
      const rearIndex = cameras.findIndex(c =>
        c.label.toLowerCase().includes('back') ||
        c.label.toLowerCase().includes('rear') ||
        c.label.toLowerCase().includes('environment')
      )
      const cameraIndex = rearIndex >= 0 ? rearIndex : 0
      const cameraId = cameras[cameraIndex]?.deviceId

      const reader = getReader()
      const videoEl = videoRef.current
      if (!videoEl) {
        updateState({ error: 'Video element not ready', isLoading: false })
        return
      }

      // Request the camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: cameraId ? { exact: cameraId } : undefined,
          facingMode: cameraId ? undefined : { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })

      streamRef.current = stream
      const hasTorch = await checkTorchSupport(stream)

      await reader.decodeFromStream(stream, videoEl, (result, error) => {
        if (result) {
          const code = result.getText()
          const now = Date.now()
          
          // Debounce: ignore same code within 2 seconds
          if (lastDetectedRef.current?.code === code && now - lastDetectedRef.current.time < 2000) {
            return
          }
          lastDetectedRef.current = { code, time: now }
          
          updateState({ lastScanned: code })
          detectedCallbackRef.current?.(code)
        }
        if (error && !(error instanceof NotFoundException)) {
          console.warn('Scan error:', error)
        }
      })

      updateState({
        isScanning: true,
        isLoading: false,
        cameras,
        currentCameraIndex: cameraIndex,
        hasMultipleCameras: cameras.length > 1,
        hasTorch,
        error: null,
      })
    } catch (err) {
      let errorMsg = 'Camera access failed'
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') errorMsg = 'Camera permission denied. Please allow camera access in browser settings.'
        else if (err.name === 'NotFoundError') errorMsg = 'No camera device found.'
        else if (err.name === 'NotReadableError') errorMsg = 'Camera is in use by another app.'
        else errorMsg = `Camera error: ${err.message}`
      }
      updateState({ error: errorMsg, isLoading: false, isScanning: false })
    }
  }, [state.isScanning, state.isLoading, getCameras, getReader, checkTorchSupport, updateState])

  // ── Stop scanning ──────────────────────────────────────────
  const stopScanning = useCallback(() => {
    readerRef.current?.reset()
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
    if (!state.hasMultipleCameras) return
    const nextIndex = (state.currentCameraIndex + 1) % state.cameras.length
    stopScanning()
    updateState({ currentCameraIndex: nextIndex })
    // Restart with new camera
    setTimeout(() => startScanning(), 300)
  }, [state, stopScanning, startScanning, updateState])

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
      readerRef.current?.reset()
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
