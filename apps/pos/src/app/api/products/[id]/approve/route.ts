import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// POST /api/products/[id]/approve — Store owner review & approval endpoint
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(apiError('Unauthorized', 'UNAUTHORIZED'), { status: 401 })
    }
    if (session.user.role !== 'OWNER') {
      return NextResponse.json(apiError('Forbidden: Only store owners can approve products', 'FORBIDDEN'), { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { purchasePrice, sellingPrice, minSellingPrice } = body

    const product = await prisma.product.findUnique({ where: { id } })
    if (!product) {
      return NextResponse.json(apiError('Product not found', 'NOT_FOUND'), { status: 404 })
    }

    const finalSellingPrice = sellingPrice !== undefined ? Number(sellingPrice) : product.sellingPrice
    const finalMinSellingPrice = minSellingPrice !== undefined ? Number(minSellingPrice) : product.minSellingPrice
    const finalPurchasePrice = purchasePrice !== undefined ? Number(purchasePrice) : product.purchasePrice

    if (finalMinSellingPrice > 0 && finalSellingPrice > 0 && finalMinSellingPrice > finalSellingPrice) {
      return NextResponse.json(
        apiError('Threshold selling price cannot be greater than regular selling price'),
        { status: 400 }
      )
    }

    const approvedProduct = await prisma.product.update({
      where: { id },
      data: {
        isApproved: true,
        status: 'ACTIVE',
        purchasePrice: finalPurchasePrice,
        sellingPrice: finalSellingPrice,
        minSellingPrice: finalMinSellingPrice,
        isPublished: true,
      },
      include: {
        category: { select: { id: true, name: true } },
        brand: { select: { id: true, name: true } },
        barcodes: { select: { id: true, barcode: true, type: true } },
      },
    })

    return NextResponse.json(
      apiSuccess({
        product: approvedProduct,
        message: `Product "${approvedProduct.name}" has been approved and activated for sale.`,
      })
    )
  } catch (err) {
    console.error('Error approving product:', err)
    return NextResponse.json(apiError('Internal server error during approval'), { status: 500 })
  }
}
