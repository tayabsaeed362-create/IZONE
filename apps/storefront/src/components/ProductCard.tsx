'use client'

import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Phone, ArrowRight, ShieldCheck, Tag } from 'lucide-react'
import { generateWhatsAppLink, formatPKR } from '@/lib/whatsapp'

export interface StorefrontProduct {
  id: string
  name: string
  slug: string
  sku: string
  sellingPrice: number
  onlinePrice?: number | null
  discountAmount?: number
  quantity: number
  hasImei: boolean
  images: string[]
  warrantyPeriodDays?: number | null
  category?: {
    id: string
    name: string
    slug: string
  } | null
  brand?: {
    id: string
    name: string
  } | null
  variants?: Array<{
    id: string
    name: string
    sku: string
    sellingPrice: number
    quantity: number
  }>
}

interface ProductCardProps {
  product: StorefrontProduct
}

export function ProductCard({ product }: ProductCardProps) {
  const displayPrice = product.onlinePrice && product.onlinePrice > 0 ? product.onlinePrice : product.sellingPrice
  const hasVariants = product.variants && product.variants.length > 0
  const totalStock = product.quantity
  const hasDiscount = product.discountAmount && product.discountAmount > 0
  const originalPrice = hasDiscount ? displayPrice + (product.discountAmount || 0) : null

  const mainImage = product.images && product.images.length > 0 ? product.images[0] : null

  // WhatsApp prefilled ordering link
  const waLink = generateWhatsAppLink({
    productName: product.name,
    price: displayPrice,
    sku: product.sku,
  })

  // Stock status text & style
  const getStockBadge = () => {
    if (totalStock > 5) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          In Stock ({totalStock})
        </span>
      )
    }
    if (totalStock > 0) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          Only {totalStock} Left
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
        Confirm Availability
      </span>
    )
  }

  return (
    <div className="group relative bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-sky-500/40 rounded-2xl p-4 transition-all duration-300 flex flex-col justify-between hover:shadow-xl hover:shadow-sky-950/30">
      <div>
        {/* Card Header: Category & Stock Badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider truncate">
            {product.category?.name || 'Accessories'}
          </span>
          {getStockBadge()}
        </div>

        {/* Product Image Area */}
        <Link href={`/products/${product.slug}`} className="block relative aspect-square w-full rounded-xl bg-slate-950/80 overflow-hidden mb-4 border border-slate-800/60 flex items-center justify-center group-hover:scale-[1.02] transition">
          {mainImage ? (
            <Image
              src={mainImage}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-600 gap-1.5 p-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-sky-400 font-black text-xl">
                iZ
              </div>
              <span className="text-[11px] font-medium text-slate-500">Genuine Device</span>
            </div>
          )}

          {/* Discount tag badge */}
          {hasDiscount && (
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-bold shadow-md flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" /> SAVE {formatPKR(product.discountAmount!)}
            </div>
          )}

          {/* Brand watermark */}
          {product.brand?.name && (
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md text-[10px] font-bold text-slate-300 border border-slate-800">
              {product.brand.name}
            </div>
          )}
        </Link>

        {/* Title */}
        <Link href={`/products/${product.slug}`} className="block mb-2">
          <h3 className="text-sm font-bold text-slate-100 group-hover:text-sky-400 transition line-clamp-2 leading-snug">
            {product.name}
          </h3>
        </Link>

        {/* Variant summary pill */}
        {hasVariants && (
          <div className="mb-3">
            <span className="inline-block text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
              {product.variants!.length} Options Available
            </span>
          </div>
        )}

        {/* Warranty hint */}
        {product.warrantyPeriodDays && product.warrantyPeriodDays > 0 ? (
          <p className="text-[11px] text-emerald-400/90 flex items-center gap-1 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>{product.warrantyPeriodDays} Days Official Warranty</span>
          </p>
        ) : null}
      </div>

      {/* Pricing & Call to Action Buttons */}
      <div className="pt-3 border-t border-slate-800/80 space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Selling Price</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black text-white tracking-tight">
                {formatPKR(displayPrice)}
              </span>
              {originalPrice && (
                <span className="text-xs text-slate-500 line-through">
                  {formatPKR(originalPrice)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 transition active:scale-95"
            title="Order directly on WhatsApp"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Order</span>
          </a>

          <Link
            href={`/products/${product.slug}`}
            className="w-full py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs flex items-center justify-center gap-1 border border-slate-700 transition"
          >
            <span>Details</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}
