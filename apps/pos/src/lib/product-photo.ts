// The existing products.images array stores durable image strings. Never persist blob: URLs.
export async function prepareProductPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|bmp)$/.test(file.type)) throw new Error('Choose a JPG, PNG, WebP or BMP image.')
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }) }
  catch { throw new Error('This image could not be opened. Try another JPG or PNG.') }
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Photo processing is unavailable in this browser.')
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    let result = canvas.toDataURL('image/jpeg', .82)
    if (result.length > 1400000) result = canvas.toDataURL('image/jpeg', .6)
    if (result.length > 1400000) throw new Error('This photo is too large to save. Try a smaller image.')
    return result
  } finally { bitmap.close() }
}
