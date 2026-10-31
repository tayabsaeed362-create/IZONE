'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Phone,
  ShieldCheck,
  Truck,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Share2,
} from 'lucide-react'
import { generateWhatsAppLink, formatPKR, getWhatsAppNumber } from '@/lib/whatsapp'
import { ProductCard, StorefrontProduct } from './ProductCard'

interface ProductDetailClientProps {
  product: StorefrontProduct & {
    description?: string | null
    onlineDescription?: string | null
    barcodes?: Array<{ barcode: string }>
  }
  relatedProducts: StorefrontProduct[]
}

export function ProductDetailClient({ product, relatedProducts }: ProductDetailClientProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants && product.variants.length > 0 ? product.variants[0].id : null
  )

  const [activeImageIndex, setActiveImageIndex] = useState(0)

  const selectedVariant = product.variants?.find((v) => v.id === selectedVariantId) || null

  const currentPrice = selectedVariant?.sellingPrice || product.onlinePrice || product.sellingPrice
  const currentStock = selectedVariant ? selectedVariant.quantity : product.quantity
  const currentSku = selectedVariant?.sku || product.sku

  const waLink = generateWhatsAppLink({
    productName: product.name,
    variantName: selectedVariant?.name || null,
    price: currentPrice,
    sku: currentSku,
  })

  const waNumber = getWhatsAppNumber()

  const images = product.images && product.images.length > 0 ? product.images : []

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({
        title: product.name,
        text: `Check out ${product.name} at iZone by Haider!`,
        url: window.location.href,
      }).catch(() => {})
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href)
      alert('Product link copied to clipboard!')
    }
  }

  return (
    <div className="space-y-12">
      {/* ── Breadcrumb & Back Link ───────────────────────────────── */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 hover:text-white transition font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Catalog</span>
        </Link>

        <div className="flex items-center gap-2">
          <span>{product.category?.name || 'Accessories'}</span>
          <span>/</span>
          <span className="text-slate-200 font-medium truncate max-w-[200px]">{product.name}</span>
        </div>
      </div>

      {/* ── Product Hero Layout (Gallery + Details) ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
        {/* Left: Gallery Area */}
        <div className="space-y-4">
          <div className="relative aspect-square w-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shadow-xl">
            {images.length > 0 ? (
              <Image
                src={images[activeImageIndex] || images[0]}
                alt={product.name}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover transition-all duration-300"
                priority
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-600 gap-2 p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-sky-400 font-black text-2xl">
                  iZ
                </div>
                <span className="text-xs text-slate-500 font-semibold">Genuine iZone Inventory</span>
              </div>
            )}
          </div>

          {/* Thumbnails if multiple images exist */}
          {images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 transition shrink-0 ${
                    activeImageIndex === idx ? 'border-sky-500 shadow-md shadow-sky-500/20' : 'border-slate-800 opacity-60 hover:opacity-100'
                  }`}
                >
                  <Image src={img} alt={`${product.name} ${idx}`} fill className="object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Product Details & Purchase Actions */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                {product.brand?.name || product.category?.name || 'GENUINE ACCESSORY'}
              </span>
              <button
                onClick={handleShare}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
                title="Share Product"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
              {product.name}
            </h1>

            <p className="text-xs text-slate-400 font-mono mt-1">
              SKU: <span className="text-slate-300">{currentSku}</span>
            </p>
          </div>

          {/* Pricing Box */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-baseline justify-between">
            <div>
              <span className="text-xs text-slate-400 font-medium block">Special Store Price</span>
              <span className="text-3xl font-black text-white tracking-tight">
                {formatPKR(currentPrice)}
              </span>
            </div>

            {/* Stock indicator badge */}
            <div className="text-right">
              {currentStock > 5 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" /> In Stock ({currentStock} Available)
                </span>
              ) : currentStock > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Clock className="w-3.5 h-3.5" /> Limited Stock ({currentStock} Left)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  Confirm Availability
                </span>
              )}
            </div>
          </div>

          {/* Variant Selector (if variants exist) */}
          {product.variants && product.variants.length > 0 && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                Select Option / Variant:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {product.variants.map((v) => {
                  const isSelected = selectedVariantId === v.id
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        isSelected
                          ? 'bg-sky-500/15 border-sky-500 text-white shadow-md shadow-sky-500/10'
                          : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold truncate block">{v.name}</span>
                      <span className="text-[11px] text-slate-400 font-mono mt-1">
                        {formatPKR(v.sellingPrice)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* WhatsApp Direct Order Button (Primary CTA) */}
          <div className="space-y-3 pt-2">
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-600/20 transition active:scale-95 group"
            >
              <Phone className="w-5 h-5 group-hover:scale-110 transition" />
              <span>Order Now via WhatsApp</span>
            </a>

            <p className="text-center text-[11px] text-slate-400">
              ⚡ Instantly chats with Haider at <span className="text-slate-300 font-mono">+{waNumber}</span> with prefilled product details.
            </p>
          </div>

          {/* Delivery & Warranty Information Grid */}
          <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-400">
            <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200 block">Authentic Warranty</strong>
                <span>
                  {product.warrantyPeriodDays
                    ? `${product.warrantyPeriodDays} Days Official Store Warranty`
                    : '7-Day Check Warranty on Accessories'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 flex items-start gap-2.5">
              <Truck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-200 block">Nationwide Delivery</strong>
                <span>TCS / Leopard Cash on Delivery or Local Pickup</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Product Specifications & Description ─────────────────── */}
      <div className="pt-8 border-t border-slate-800 space-y-6">
        <h2 className="text-xl font-bold text-white tracking-tight">Product Overview & Specifications</h2>

        <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-4 text-sm text-slate-300 leading-relaxed">
          <p>{product.onlineDescription || product.description || 'Authentic smartphone accessory supplied directly from authorized distribution channels.'}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 pt-4 border-t border-slate-800/80 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 font-medium">Product Name</span>
              <span className="text-slate-200 font-semibold">{product.name}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 font-medium">SKU / Model</span>
              <span className="text-slate-200 font-mono">{currentSku}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 font-medium">Department</span>
              <span className="text-slate-200">{product.category?.name || 'Accessories'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 font-medium">Brand</span>
              <span className="text-slate-200">{product.brand?.name || 'Genuine OEM'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 font-medium">Condition</span>
              <span className="text-emerald-400 font-semibold">100% Brand New Box Pack</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-800/40">
              <span className="text-slate-400 font-medium">Warranty</span>
              <span className="text-slate-200">{product.warrantyPeriodDays ? `${product.warrantyPeriodDays} Days` : '7-Day Check'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Related Items Section ─────────────────────────────────── */}
      {relatedProducts.length > 0 && (
        <div className="pt-10 border-t border-slate-800 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white tracking-tight">Customers Also Viewed</h2>
            <Link href="/products" className="text-xs text-sky-400 hover:text-sky-300 font-semibold">
              View All
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
