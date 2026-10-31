import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@izone/database'
import { apiSuccess, apiError } from '@izone/shared'

// GET /api/warranty?imei=XYZ or /api/warranty?invoice=INV-2024-00001
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const imei = searchParams.get('imei')?.trim()
    const invoice = searchParams.get('invoice')?.trim()

    if (!imei && !invoice) {
      return NextResponse.json(
        apiError('Provide an IMEI or Invoice Number to check warranty status', 'PARAM_REQUIRED'),
        { status: 400 }
      )
    }

    if (imei) {
      // 1. Search in sale items for this IMEI
      const saleItem = await prisma.saleItem.findFirst({
        where: {
          OR: [
            { imei: { equals: imei, mode: 'insensitive' } },
            { serialNumber: { equals: imei, mode: 'insensitive' } },
          ],
        },
        include: {
          sale: {
            select: {
              saleNumber: true,
              saleAt: true,
              status: true,
              customer: { select: { name: true, phone: true } },
            },
          },
          product: {
            select: {
              id: true,
              name: true,
              warrantyPeriodDays: true,
              brand: { select: { name: true } },
            },
          },
        },
      })

      if (!saleItem) {
        // Also check if it exists in inventory movements (received via purchase but not yet sold)
        const intakeMovement = await prisma.inventoryMovement.findFirst({
          where: {
            OR: [
              { imei: { equals: imei, mode: 'insensitive' } },
              { serialNumber: { equals: imei, mode: 'insensitive' } },
            ],
          },
          include: {
            product: { select: { name: true, warrantyPeriodDays: true } },
          },
        })

        if (intakeMovement) {
          return NextResponse.json(
            apiSuccess({
              status: 'IN_STOCK',
              message: 'Device is in shop inventory, not yet sold',
              productName: intakeMovement.product.name,
              receivedAt: intakeMovement.createdAt,
            })
          )
        }

        return NextResponse.json(
          apiError('No device record found for this IMEI/Serial number', 'NOT_FOUND'),
          { status: 404 }
        )
      }

      const warrantyDays = saleItem.product.warrantyPeriodDays ?? 0
      const saleDate = new Date(saleItem.sale.saleAt)
      const warrantyExpiry = new Date(saleDate.getTime() + warrantyDays * 24 * 60 * 60 * 1000)
      const isExpired = new Date() > warrantyExpiry

      return NextResponse.json(
        apiSuccess({
          status: saleItem.sale.status === 'REFUNDED' ? 'REFUNDED' : isExpired ? 'EXPIRED' : 'ACTIVE',
          imei,
          productName: saleItem.productName,
          sku: saleItem.sku,
          brand: saleItem.product.brand?.name ?? null,
          invoiceNumber: saleItem.sale.saleNumber,
          soldAt: saleItem.sale.saleAt,
          warrantyPeriodDays: warrantyDays,
          warrantyExpiry: warrantyExpiry.toISOString(),
          isExpired,
          customerName: saleItem.sale.customer?.name ?? 'Walk-in Customer',
          customerPhone: saleItem.sale.customer?.phone ?? null,
        })
      )
    }

    if (invoice) {
      const sale = await prisma.sale.findFirst({
        where: {
          OR: [
            { saleNumber: { equals: invoice, mode: 'insensitive' } },
            { id: invoice },
          ],
        },
        include: {
          customer: { select: { name: true, phone: true } },
          items: {
            include: {
              product: {
                select: {
                  warrantyPeriodDays: true,
                  brand: { select: { name: true } },
                },
              },
            },
          },
        },
      })

      if (!sale) {
        return NextResponse.json(apiError('Invoice not found', 'NOT_FOUND'), { status: 404 })
      }

      const itemsWithWarranty = sale.items.map(item => {
        const warrantyDays = item.product.warrantyPeriodDays ?? 0
        const saleDate = new Date(sale.saleAt)
        const expiry = new Date(saleDate.getTime() + warrantyDays * 24 * 60 * 60 * 1000)
        return {
          productName: item.productName,
          sku: item.sku,
          quantity: item.quantity,
          imei: item.imei,
          serialNumber: item.serialNumber,
          warrantyPeriodDays: warrantyDays,
          warrantyExpiry: expiry.toISOString(),
          isExpired: new Date() > expiry,
        }
      })

      return NextResponse.json(
        apiSuccess({
          invoiceNumber: sale.saleNumber,
          soldAt: sale.saleAt,
          saleStatus: sale.status,
          customerName: sale.customer?.name ?? 'Walk-in Customer',
          items: itemsWithWarranty,
        })
      )
    }
  } catch (err) {
    console.error('GET /api/warranty error:', err)
    return NextResponse.json(apiError('Failed to verify warranty'), { status: 500 })
  }
}
