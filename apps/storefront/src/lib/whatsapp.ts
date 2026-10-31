export function getWhatsAppNumber(): string {
  // Configured via NEXT_PUBLIC_WHATSAPP_NUMBER or defaults to business contact
  return process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '923001234567'
}

export interface WhatsAppInquiryParams {
  productName: string
  price: number
  variantName?: string | null
  sku?: string
  url?: string
}

export function generateWhatsAppLink(params: WhatsAppInquiryParams): string {
  const number = getWhatsAppNumber().replace(/\D/g, '')
  const variantText = params.variantName ? ` (${params.variantName})` : ''
  const formattedPrice = Number(params.price).toLocaleString('en-PK')

  let message = `Hello iZone by Haider, I am interested in this product: ${params.productName}${variantText}. Price: Rs. ${formattedPrice}. Please confirm availability.`

  if (params.sku) {
    message += ` (SKU: ${params.sku})`
  }

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}

export function formatPKR(amount: number): string {
  return `₨${Math.round(amount).toLocaleString('en-PK')}`
}
