import { PrismaClient, BarcodeType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('📦 Updating variants and barcode associations...')

  // 1. Samsung S24 Ultra Variants
  const s24ultra = await prisma.product.findUnique({ where: { sku: 'SAM-S24U-256BLK' } })
  if (s24ultra) {
    const s24Variants = [
      {
        sku: 'SAM-S24U-256BLK-V',
        name: '256GB Titanium Black',
        barcode: '8806095262222',
        type: BarcodeType.EAN13,
      },
      {
        sku: 'SAM-S24U-512GRY-V',
        name: '512GB Titanium Gray',
        barcode: '8806095262239',
        type: BarcodeType.EAN13,
      },
      {
        sku: 'SAM-S24U-256VIO-V',
        name: '256GB Titanium Violet',
        barcode: '8806095262246',
        type: BarcodeType.EAN13,
      },
    ]

    for (const item of s24Variants) {
      const variant = await prisma.productVariant.findUnique({ where: { sku: item.sku } })
      if (variant) {
        await prisma.productBarcode.upsert({
          where: { barcode: item.barcode },
          update: { variantId: variant.id, productId: s24ultra.id },
          create: {
            productId: s24ultra.id,
            variantId: variant.id,
            barcode: item.barcode,
            type: item.type,
          },
        })
      }
    }
    console.log('✅ S24 Ultra variant barcodes linked')
  }

  // 2. iPhone 15 Pro Max Variants
  const iph15pm = await prisma.product.findUnique({ where: { sku: 'IPH-15PM-256BLK' } })
  if (iph15pm) {
    const iphVariants = [
      {
        sku: 'IPH-15PM-256BLK-V',
        name: '256GB Black Titanium',
        barcode: '194253418559',
        type: BarcodeType.CODE128,
      },
      {
        sku: 'IPH-15PM-512NAT-V',
        name: '512GB Natural Titanium',
        barcode: '194253418566',
        type: BarcodeType.CODE128,
      },
      {
        sku: 'IPH-15PM-1TB-DES-V',
        name: '1TB Desert Titanium',
        barcode: '194253418573',
        type: BarcodeType.CODE128,
      },
    ]

    for (const item of iphVariants) {
      const variant = await prisma.productVariant.findUnique({ where: { sku: item.sku } })
      if (variant) {
        await prisma.productBarcode.upsert({
          where: { barcode: item.barcode },
          update: { variantId: variant.id, productId: iph15pm.id },
          create: {
            productId: iph15pm.id,
            variantId: variant.id,
            barcode: item.barcode,
            type: item.type,
          },
        })
      }
    }
    console.log('✅ iPhone 15 Pro Max variant barcodes linked')
  }

  // 3. Earbuds Variants (Black and White)
  const earbuds = await prisma.product.findUnique({ where: { sku: 'EARPHONE-TYPE-C' } })
  if (earbuds) {
    const earbudVariants = [
      {
        name: 'USB-C Earphones - Midnight Black',
        sku: 'EAR-USBC-BLK-V',
        attributes: { color: 'Black' },
        purchasePrice: 600,
        sellingPrice: 999,
        quantity: 25,
        barcode: 'IZ-EAR-BLK-001',
      },
      {
        name: 'USB-C Earphones - Arctic White',
        sku: 'EAR-USBC-WHT-V',
        attributes: { color: 'White' },
        purchasePrice: 600,
        sellingPrice: 999,
        quantity: 25,
        barcode: 'IZ-EAR-WHT-001',
      },
    ]

    for (const v of earbudVariants) {
      const { barcode, ...vData } = v
      const variant = await prisma.productVariant.upsert({
        where: { sku: vData.sku },
        update: {},
        create: { productId: earbuds.id, ...vData },
      })

      await prisma.productBarcode.upsert({
        where: { barcode },
        update: { variantId: variant.id, productId: earbuds.id },
        create: {
          productId: earbuds.id,
          variantId: variant.id,
          barcode,
          type: BarcodeType.INTERNAL,
        },
      })
    }
    console.log('✅ Earbud Black & White variants & barcodes created')
  }

  // 4. Charger wattage variants
  const charger = await prisma.product.findUnique({ where: { sku: 'ANK-PWR-PD65W' } })
  if (charger) {
    const chargerVariants = [
      {
        name: 'Anker GaN 45W Ultra-Compact',
        sku: 'ANK-PWR-PD45W-V',
        attributes: { wattage: '45W', ports: '2' },
        purchasePrice: 2800,
        sellingPrice: 3999,
        quantity: 15,
        barcode: '0194644137885',
      },
      {
        name: 'Anker GaN 65W 3-Port',
        sku: 'ANK-PWR-PD65W-V',
        attributes: { wattage: '65W', ports: '3' },
        purchasePrice: 3500,
        sellingPrice: 4999,
        quantity: 25,
        barcode: '0194644137892',
      },
    ]

    for (const v of chargerVariants) {
      const { barcode, ...vData } = v
      const variant = await prisma.productVariant.upsert({
        where: { sku: vData.sku },
        update: {},
        create: { productId: charger.id, ...vData },
      })

      await prisma.productBarcode.upsert({
        where: { barcode },
        update: { variantId: variant.id, productId: charger.id },
        create: {
          productId: charger.id,
          variantId: variant.id,
          barcode,
          type: BarcodeType.EAN13,
        },
      })
    }
    console.log('✅ Charger wattage variants & barcodes created')
  }

  console.log('🎉 Variant barcode associations finished!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
