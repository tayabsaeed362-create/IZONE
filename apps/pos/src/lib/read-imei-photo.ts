import type { Worker } from 'tesseract.js'
import { extractImeis } from './imei-photo'

export async function readImeiPhoto(file: File, signal: AbortSignal, progress: (value: number) => void) {
  if (!/^image\/(jpeg|png|webp|bmp)$/.test(file.type)) throw new Error('Choose a JPG, PNG, WebP or BMP photo. Convert HEIC photos to JPG first.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.')
  signal.throwIfAborted()
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch { throw new Error('This photo could not be opened. Try a JPG or PNG screenshot.') }
  const canvas = document.createElement('canvas')
  const scale = Math.min(2, 2400 / Math.max(bitmap.width, bitmap.height))
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) { bitmap.close(); throw new Error('Photo processing is unavailable in this browser.') }
  context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
  signal.throwIfAborted()
  // Normalize contrast and invert dark phone screens to dark text on white.
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const histogram = new Uint32Array(256)
  let total = 0
  for (let i = 0; i < pixels.data.length; i += 4) {
    const grey = Math.round(pixels.data[i] * .299 + pixels.data[i + 1] * .587 + pixels.data[i + 2] * .114)
    histogram[grey]++; total += grey
    pixels.data[i] = grey
  }
  const count = pixels.data.length / 4
  const inverted = total / count < 125
  let low = 0, high = 255, cumulative = 0
  for (let i = 0; i < 256; i++) { cumulative += histogram[i]; if (cumulative >= count * .02) { low = i; break } }
  cumulative = 0
  for (let i = 255; i >= 0; i--) { cumulative += histogram[i]; if (cumulative >= count * .02) { high = i; break } }
  if (high - low < 20) { low = 0; high = 255 }
  for (let i = 0; i < pixels.data.length; i += 4) {
    let value = Math.max(0, Math.min(255, (pixels.data[i] - low) * 255 / Math.max(1, high - low)))
    if (inverted) value = 255 - value
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value
  }
  context.putImageData(pixels, 0, 0)
  const { createWorker, PSM } = await import('tesseract.js')
  signal.throwIfAborted()
  let worker: Worker | undefined
  let stopped = false
  let rejectCancelled: (reason: Error) => void = () => {}
  const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject })
  const stop = () => {
    stopped = true
    if (worker) void worker.terminate()
    rejectCancelled(new DOMException('Photo reading cancelled', 'AbortError'))
  }
  signal.addEventListener('abort', stop, { once: true })
  const timeout = setTimeout(() => {
    stopped = true
    if (worker) void worker.terminate()
    rejectCancelled(new Error('Photo reading took too long. Try a closer, clearer photo.'))
  }, 90000)
  const work = async () => {
    worker = await createWorker('eng', 1, {
      workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr', workerBlobURL: false,
      logger: message => { if (!stopped) progress(message.status === 'recognizing text' ? 30 + Math.round(message.progress * 70) : 10) },
    })
    if (stopped || signal.aborted) { await worker.terminate(); throw new DOMException('Cancelled', 'AbortError') }
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300' })
    const { data } = await worker.recognize(canvas)
    signal.throwIfAborted()
    return extractImeis(data.text)
  }
  try { return await Promise.race([work(), cancelled]) }
  finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', stop)
    stopped = true
    if (worker) await worker.terminate()
    canvas.width = canvas.height = 0
  }
}
