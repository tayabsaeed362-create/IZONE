'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  NotFoundException,
} from '@zxing/library'

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
  startScanning: (preferredCameraId?: string) => Promise<void>
  stopScanning: () => void
  toggleTorch: () => Promise<void>
  switchCamera: () => Promise<void>
  resetScanner: () => void
  onDetected: (callback: (barcode: string) => void) => void
  scanImage: (file: File) => Promise<string | null>
  captureCurrentFrame: () => Promise<string | null>
}

export function useBarcodeScanner(): UseBarcodeScanner {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)
  const detectedCallbackRef = useRef<((barcode: string) => void) | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastDetectedRef = useRef<{ code: string; time: number } | null>(null)
  const animFrameRef = useRef<number | null>(null)

  const isScanningRef = useRef(false)
  const isLoadingRef = useRef(false)

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
    setState((prev) => ({ ...prev, ...update }))
  }, [])

  // ── Initialize ZXing reader ─────────────────────────────────
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
        BarcodeFormat.CODABAR,
      ])
      hints.set(DecodeHintType.TRY_HARDER, true)
      readerRef.current = new BrowserMultiFormatReader(hints, 100)
    }
    return readerRef.current
  }, [])

  // ── Check torch support ─────────────────────────────────────
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

  // ── Notify detected code with debouncing ─────────────────────
  const handleDetectedCode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim()
      if (!code) return
      const now = Date.now()

      // Debounce: ignore same code within 1.2 seconds
      if (lastDetectedRef.current?.code === code && now - lastDetectedRef.current.time < 1200) {
        return
      }
      lastDetectedRef.current = { code, time: now }

      updateState({ lastScanned: code })
      detectedCallbackRef.current?.(code)
    },
    [updateState]
  )

  // ── Start scanning ──────────────────────────────────────────
  const startScanning = useCallback(
    async (preferredCameraId?: string) => {
      if (isLoadingRef.current) return

      // Verify browser support for camera stream
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        updateState({
          error: 'Camera is not supported on this browser or requires HTTPS.',
          isLoading: false,
          isScanning: false,
        })
        return
      }

      isLoadingRef.current = true
      updateState({ isLoading: true, error: null })

      try {
        // 1. Wait a moment if video element is still mounting
        let videoEl = videoRef.current
        let attempts = 0
        while (!videoEl && attempts < 15) {
          await new Promise((res) => setTimeout(res, 80))
          videoEl = videoRef.current
          attempts++
        }

        if (!videoEl) {
          isLoadingRef.current = false
          updateState({ error: 'Video element not ready. Try again.', isLoading: false })
          return
        }

        // Stop any existing stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current)
          animFrameRef.current = null
        }

        // 2. Request camera stream directly
        let stream: MediaStream
        const videoConstraints: MediaTrackConstraints = preferredCameraId
          ? { deviceId: { exact: preferredCameraId } }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920, min: 640 },
              height: { ideal: 1080, min: 480 },
            }

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          })
        } catch (firstErr) {
          console.warn('Initial camera constraint failed, falling back to basic video:', firstErr)
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          })
        }

        streamRef.current = stream

        // 3. Enumerate cameras for switching
        let cameras: MediaDeviceInfo[] = []
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices()
          cameras = allDevices.filter((d) => d.kind === 'videoinput')
        } catch {
          cameras = []
        }

        const hasTorch = await checkTorchSupport(stream)

        // Bind stream to video element
        videoEl.setAttribute('playsinline', 'true')
        videoEl.setAttribute('muted', 'true')
        videoEl.muted = true
        videoEl.srcObject = stream
        await videoEl.play().catch(() => {})

        // Try continuous auto-focus if hardware supports it
        try {
          const track = stream.getVideoTracks()[0]
          if (track) {
            const caps = (track.getCapabilities?.() as any) || {}
            if (
              caps.focusMode &&
              Array.isArray(caps.focusMode) &&
              caps.focusMode.includes('continuous')
            ) {
              await (track as any).applyConstraints({ advanced: [{ focusMode: 'continuous' }] })
            }
          }
        } catch {}

        isScanningRef.current = true
        isLoadingRef.current = false

        // 4. Setup Hybrid Detection Engine:
        // Priority A: Native BarcodeDetector API (fastest, supports rotated barcodes)
        // Priority B: ZXing BrowserMultiFormatReader decodeFromVideoElementContinuously
        let hasNativeBarcodeDetector = false
        if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
          try {
            const formats = [
              'ean_13',
              'ean_8',
              'upc_a',
              'upc_e',
              'code_128',
              'code_39',
              'code_93',
              'qr_code',
              'data_matrix',
              'itf',
              'codabar',
            ]
            const barcodeDetector = new (window as any).BarcodeDetector({ formats })

            const nativeScanTick = async () => {
              if (!isScanningRef.current || !videoRef.current) return
              try {
                if (videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
                  const detected = await barcodeDetector.detect(videoRef.current)
                  if (detected && detected.length > 0) {
                    const found = detected[0].rawValue?.trim()
                    if (found) {
                      handleDetectedCode(found)
                    }
                  }
                }
              } catch {
                // Ignore frame glitch
              }

              if (isScanningRef.current) {
                animFrameRef.current = requestAnimationFrame(nativeScanTick)
              }
            }

            animFrameRef.current = requestAnimationFrame(nativeScanTick)
            hasNativeBarcodeDetector = true
          } catch (e) {
            hasNativeBarcodeDetector = false
          }
        }

        // Fallback or companion with ZXing
        if (!hasNativeBarcodeDetector) {
          const reader = getReader()
          try {
            reader.decodeFromVideoElementContinuously(videoEl, (result, error) => {
              if (!isScanningRef.current) return
              if (result) {
                handleDetectedCode(result.getText())
              }
            })
          } catch (err) {
            console.warn('ZXing decode loop init:', err)
          }
        }

        const rearIndex = cameras.findIndex(
          (c) =>
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
        isScanningRef.current = false
        isLoadingRef.current = false

        let errorMsg = 'Camera access failed.'
        if (err instanceof DOMException) {
          if (err.name === 'NotAllowedError') {
            errorMsg =
              'Camera permission was denied. Please allow camera access in your browser settings.'
          } else if (err.name === 'NotFoundError') {
            errorMsg = 'No camera device found on this system.'
          } else if (err.name === 'NotReadableError') {
            errorMsg = 'Camera is currently in use by another application.'
          } else {
            errorMsg = `Camera error: ${err.message}`
          }
        } else if (err instanceof Error) {
          errorMsg = err.message
        }
        updateState({ error: errorMsg, isLoading: false, isScanning: false })
      }
    },
    [getReader, checkTorchSupport, handleDetectedCode, updateState]
  )

  // ── Stop scanning ───────────────────────────────────────────
  const stopScanning = useCallback(() => {
    isScanningRef.current = false
    isLoadingRef.current = false
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    try {
      readerRef.current?.reset()
    } catch {}
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    updateState({ isScanning: false, isLoading: false, torchOn: false })
  }, [updateState])

  // ── Toggle torch ────────────────────────────────────────────
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

  // ── Switch camera ───────────────────────────────────────────
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

  // ── Scan Still Image (Upload / File) ────────────────────────
  const scanImage = useCallback(
    async (file: File): Promise<string | null> => {
      return new Promise((resolve) => {
        const fileReader = new FileReader()
        fileReader.onload = async (e) => {
          const dataUrl = e.target?.result as string
          if (!dataUrl) {
            resolve(null)
            return
          }

          const img = new Image()
          img.onload = async () => {
            // 1. Native BarcodeDetector
            if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
              try {
                const detector = new (window as any).BarcodeDetector({
                  formats: [
                    'ean_13',
                    'ean_8',
                    'upc_a',
                    'upc_e',
                    'code_128',
                    'code_39',
                    'code_93',
                    'qr_code',
                    'data_matrix',
                    'itf',
                    'codabar',
                  ],
                })
                const barcodes = await detector.detect(img)
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  const val = barcodes[0].rawValue.trim()
                  handleDetectedCode(val)
                  resolve(val)
                  return
                }
              } catch {}
            }

            // 2. ZXing decodeFromImageElement
            try {
              const reader = getReader()
              const result = await reader.decodeFromImageElement(img)
              if (result) {
                const val = result.getText().trim()
                handleDetectedCode(val)
                resolve(val)
                return
              }
            } catch {}

            resolve(null)
          }
          img.onerror = () => resolve(null)
          img.src = dataUrl
        }
        fileReader.onerror = () => resolve(null)
        fileReader.readAsDataURL(file)
      })
    },
    [getReader, handleDetectedCode]
  )

  // ── Capture & Scan Current Video Frame (Snap & Scan) ────────
  const captureCurrentFrame = useCallback(async (): Promise<string | null> => {
    const videoEl = videoRef.current
    if (!videoEl || videoEl.videoWidth === 0) return null

    const canvas = document.createElement('canvas')
    canvas.width = videoEl.videoWidth
    canvas.height = videoEl.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)

    // 1. Try Native BarcodeDetector on snapshot
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new (window as any).BarcodeDetector({
          formats: [
            'ean_13',
            'ean_8',
            'upc_a',
            'upc_e',
            'code_128',
            'code_39',
            'code_93',
            'qr_code',
            'data_matrix',
            'itf',
            'codabar',
          ],
        })
        const barcodes = await detector.detect(canvas)
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const val = barcodes[0].rawValue.trim()
          handleDetectedCode(val)
          return val
        }
      } catch {}
    }

    // 2. Try ZXing on image
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const img = new Image()
      img.src = dataUrl
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
      })
      const reader = getReader()
      const result = await reader.decodeFromImageElement(img)
      if (result) {
        const val = result.getText().trim()
        handleDetectedCode(val)
        return val
      }
    } catch {}

    return null
  }, [getReader, handleDetectedCode])

  // ── Register detection listener ─────────────────────────────
  const onDetected = useCallback((callback: (barcode: string) => void) => {
    detectedCallbackRef.current = callback
  }, [])

  const resetScanner = useCallback(() => {
    stopScanning()
    updateState({ error: null, lastScanned: null })
  }, [stopScanning, updateState])

  // ── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      isScanningRef.current = false
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      try {
        readerRef.current?.reset()
      } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop())
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
    scanImage,
    captureCurrentFrame,
  }
}
