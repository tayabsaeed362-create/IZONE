import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized: Authentication required', 'AUTH_REQUIRED'), { status: 401 })
    }

    const { code } = await params
    const cleanCode = decodeURIComponent(code).trim()

    if (!cleanCode) {
      return NextResponse.json(apiError('Barcode query parameter is required', 'BAD_REQUEST'), { status: 400 })
    }

    // 1. Search in ProductBarcode
    const barcodeRecord = await prisma.productBarcode.findUnique({
      where: { barcode: cleanCode },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            discountAmount: true,
            quantity: true,
            images: true,
            hasImei: true,
            status: true,
            category: { select: { name: true } },
            variants: {
              where: { isActive: true },
              select: {
                id: true,
                name: true,
                sku: true,
                sellingPrice: true,
                quantity: true,
                attributes: true,
              },
            },
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            quantity: true,
            attributes: true,
            isActive: true,
          },
        },
      },
    })

    if (barcodeRecord && barcodeRecord.product.status === 'ACTIVE') {
      if (barcodeRecord.variant && barcodeRecord.variant.isActive) {
        return NextResponse.json(
          apiSuccess({
            matchType: 'variant',
            productId: barcodeRecord.productId,
            variantId: barcodeRecord.variant.id,
            productName: barcodeRecord.product.name,
            variantName: barcodeRecord.variant.name,
            displayName: `${barcodeRecord.product.name} — ${barcodeRecord.variant.name}`,
            sku: barcodeRecord.variant.sku,
            sellingPrice: barcodeRecord.variant.sellingPrice || barcodeRecord.product.sellingPrice,
            discountAmount: barcodeRecord.product.discountAmount ?? 0,
            quantity: barcodeRecord.variant.quantity,
            parentQuantity: barcodeRecord.product.quantity,
            images: barcodeRecord.product.images,
            hasImei: barcodeRecord.product.hasImei,
            categoryName: barcodeRecord.product.category?.name ?? null,
            barcode: barcodeRecord.barcode,
            attributes: barcodeRecord.variant.attributes,
          })
        )
      }

      // Standalone product barcode
      return NextResponse.json(
        apiSuccess({
          matchType: 'product',
          productId: barcodeRecord.productId,
          variantId: null,
          productName: barcodeRecord.product.name,
          variantName: null,
          displayName: barcodeRecord.product.name,
          sku: barcodeRecord.product.sku,
          sellingPrice: barcodeRecord.product.sellingPrice,
          discountAmount: barcodeRecord.product.discountAmount ?? 0,
          quantity: barcodeRecord.product.quantity,
          images: barcodeRecord.product.images,
          hasImei: barcodeRecord.product.hasImei,
          categoryName: barcodeRecord.product.category?.name ?? null,
          barcode: barcodeRecord.barcode,
          variants: barcodeRecord.product.variants,
        })
      )
    }

    // 2. Fallback: Search by exact SKU on Variant
    const variantBySku = await prisma.productVariant.findUnique({
      where: { sku: cleanCode },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            images: true,
            hasImei: true,
            discountAmount: true,
            category: { select: { name: true } },
          },
        },
      },
    })

    if (variantBySku && variantBySku.isActive) {
      return NextResponse.json(
        apiSuccess({
          matchType: 'variant',
          productId: variantBySku.productId,
          variantId: variantBySku.id,
          productName: variantBySku.product.name,
          variantName: variantBySku.name,
          displayName: `${variantBySku.product.name} — ${variantBySku.name}`,
          sku: variantBySku.sku,
          sellingPrice: variantBySku.sellingPrice,
          discountAmount: variantBySku.product.discountAmount ?? 0,
          quantity: variantBySku.quantity,
          images: variantBySku.product.images,
          hasImei: variantBySku.product.hasImei,
          categoryName: variantBySku.product.category?.name ?? null,
          barcode: cleanCode,
          attributes: variantBySku.attributes,
        })
      )
    }

    // 3. Fallback: Search by exact SKU on Product
    const productBySku = await prisma.product.findUnique({
      where: { sku: cleanCode },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        discountAmount: true,
        quantity: true,
        images: true,
        hasImei: true,
        status: true,
        category: { select: { name: true } },
        variants: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            quantity: true,
            attributes: true,
          },
        },
      },
    })

    if (productBySku && productBySku.status === 'ACTIVE') {
      return NextResponse.json(
        apiSuccess({
          matchType: 'product',
          productId: productBySku.id,
          variantId: null,
          productName: productBySku.name,
          variantName: null,
          displayName: productBySku.name,
          sku: productBySku.sku,
          sellingPrice: productBySku.sellingPrice,
          minSellingPrice: (productBySku as any).minSellingPrice || 0,
          discountAmount: productBySku.discountAmount ?? 0,
          quantity: productBySku.quantity,
          images: productBySku.images,
          hasImei: productBySku.hasImei,
          categoryName: productBySku.category?.name ?? null,
          barcode: cleanCode,
          variants: productBySku.variants,
        })
      )
    }

    // 4. Fallback: Search by exact IMEI 1 or IMEI 2 (Phones without barcode)
    // When the same phone has been bought/sold multiple times, prioritize the LATEST IN-STOCK cycle!
    const productsByImei = await prisma.product.findMany({
      where: {
        OR: [
          { imei1: cleanCode },
          { imei2: cleanCode },
        ],
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPrice: true,
        minSellingPrice: true,
        discountAmount: true,
        quantity: true,
        images: true,
        hasImei: true,
        imei1: true,
        imei2: true,
        imeiCycle: true,
        category: { select: { name: true } },
        variants: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            minSellingPrice: true,
            quantity: true,
            attributes: true,
          },
        },
      },
      orderBy: [
        { quantity: 'desc' }, // In-stock phone first!
        { createdAt: 'desc' }, // Latest intake cycle first!
      ],
    })

    if (productsByImei.length > 0) {
      const bestPhone = productsByImei[0]
      const cycleTitle = bestPhone.imeiCycle && bestPhone.imeiCycle > 1 ? `${bestPhone.name} [Cycle #${bestPhone.imeiCycle}]` : bestPhone.name
      return NextResponse.json(
        apiSuccess({
          matchType: 'product',
          productId: bestPhone.id,
          variantId: null,
          productName: bestPhone.name,
          variantName: null,
          displayName: cycleTitle,
          sku: bestPhone.sku,
          sellingPrice: bestPhone.sellingPrice,
          minSellingPrice: bestPhone.minSellingPrice || 0,
          discountAmount: bestPhone.discountAmount ?? 0,
          quantity: bestPhone.quantity,
          images: bestPhone.images,
          hasImei: true,
          imei1: bestPhone.imei1,
          imei2: bestPhone.imei2,
          imeiCycle: bestPhone.imeiCycle || 1,
          categoryName: bestPhone.category?.name ?? null,
          barcode: cleanCode,
          variants: bestPhone.variants,
        })
      )
    }

    // 5. Unknown barcode or IMEI
    return NextResponse.json(
      apiError(`Barcode, SKU, or IMEI "${cleanCode}" was not found in active inventory.`, 'NOT_FOUND'),
      { status: 404 }
    )
  } catch (err: any) {
    console.error('GET /api/products/barcode/[code] error:', err)
    return NextResponse.json(apiError(err.message ?? 'Internal server error'), { status: 500 })
  }
}
