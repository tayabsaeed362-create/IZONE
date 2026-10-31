import React from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { ProductDetailClient } from '@/components/ProductDetailClient'
import { StorefrontProduct } from '@/components/ProductCard'

export const dynamic = 'force-dynamic'

interface ProductDetailPageProps {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
      isPublished: true,
      status: 'ACTIVE',
    },
    select: { name: true, description: true, sellingPrice: true },
  })

  if (!product) {
    return { title: 'Product Not Found | iZone by Haider' }
  }

  return {
    title: `${product.name} | iZone by Haider`,
    description: product.description || `Buy ${product.name} at authentic shop price in Pakistan. Verified warranty and fast shipping.`,
  }
}

export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug } = await params

  const product = await prisma.product.findFirst({
    where: {
      OR: [{ slug }, { id: slug }],
      isPublished: true,
      status: 'ACTIVE',
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      brand: { select: { id: true, name: true } },
      barcodes: { select: { barcode: true } },
      variants: {
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
          quantity: true,
        },
      },
    },
  })

  if (!product) {
    notFound()
  }

  // Fetch related products from same category
  const related = await prisma.product.findMany({
    where: {
      categoryId: product.categoryId,
      id: { not: product.id },
      isPublished: true,
      status: 'ACTIVE',
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      brand: { select: { id: true, name: true } },
      variants: {
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPrice: true,
          quantity: true,
        },
      },
    },
    take: 4,
  })

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19] text-slate-100 antialiased selection:bg-sky-500 selection:text-white">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <ProductDetailClient
          product={product as unknown as StorefrontProduct}
          relatedProducts={related as unknown as StorefrontProduct[]}
        />
      </main>

      <Footer />
    </div>
  )
}
