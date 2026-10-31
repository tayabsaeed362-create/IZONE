import { PrismaClient, Role, MovementType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_PROD_SEED) {
    throw new Error('FATAL: Development seed script cannot run in production with default credentials! Set custom credentials via environment variables.')
  }

  console.log('🌱 Seeding database...')

  // ── Shop ───────────────────────────────────────────────────
  const shop = await prisma.shop.upsert({
    where: { id: 'shop_main' },
    update: {},
    create: {
      id: 'shop_main',
      name: 'iZone by Haider',
      address: 'Shop #12, Mobile Market, Lahore, Pakistan',
      phone: '+92-300-1234567',
      email: 'info@izone.pk',
      website: 'https://izone.pk',
      currency: 'PKR',
      taxRate: 0,
    },
  })
  console.log('✅ Shop created:', shop.name)

  // ── Users ──────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash('owner123', 12)
  const cashierHash = await bcrypt.hash('cashier123', 12)

  const owner = await prisma.user.upsert({
    where: { email: 'owner@izone.pk' },
    update: {},
    create: {
      shopId: shop.id,
      name: 'Ali Haider',
      email: 'owner@izone.pk',
      passwordHash: ownerHash,
      role: Role.OWNER,
    },
  })

  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@izone.pk' },
    update: {},
    create: {
      shopId: shop.id,
      name: 'Usman Ahmed',
      email: 'cashier@izone.pk',
      passwordHash: cashierHash,
      role: Role.CASHIER,
    },
  })
  console.log('✅ Users created')

  // ── Device ─────────────────────────────────────────────────
  await prisma.device.upsert({
    where: { id: 'device_primary' },
    update: {},
    create: {
      id: 'device_primary',
      shopId: shop.id,
      deviceName: "Owner's Phone",
      deviceType: 'mobile',
      isPrimary: true,
    },
  })

  // ── Categories ─────────────────────────────────────────────
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'smartphones' },
      update: {},
      create: { name: 'Smartphones', slug: 'smartphones', sortOrder: 1, isActive: true },
    }),
    prisma.category.upsert({
      where: { slug: 'accessories' },
      update: {},
      create: { name: 'Accessories', slug: 'accessories', sortOrder: 2, isActive: true },
    }),
    prisma.category.upsert({
      where: { slug: 'chargers-cables' },
      update: {},
      create: { name: 'Chargers & Cables', slug: 'chargers-cables', sortOrder: 3, isActive: true },
    }),
    prisma.category.upsert({
      where: { slug: 'cases-covers' },
      update: {},
      create: { name: 'Cases & Covers', slug: 'cases-covers', sortOrder: 4, isActive: true },
    }),
    prisma.category.upsert({
      where: { slug: 'earphones' },
      update: {},
      create: { name: 'Earphones & Headsets', slug: 'earphones', sortOrder: 5, isActive: true },
    }),
    prisma.category.upsert({
      where: { slug: 'power-banks' },
      update: {},
      create: { name: 'Power Banks', slug: 'power-banks', sortOrder: 6, isActive: true },
    }),
    prisma.category.upsert({
      where: { slug: 'screen-guards' },
      update: {},
      create: { name: 'Screen Guards', slug: 'screen-guards', sortOrder: 7, isActive: true },
    }),
  ])
  console.log('✅ Categories created')

  const [smartphones, accessories, chargers, cases, earphones, powerBanks, screenGuards] = categories

  // ── Brands ─────────────────────────────────────────────────
  const brands = await Promise.all([
    prisma.brand.upsert({ where: { name: 'Samsung' }, update: {}, create: { name: 'Samsung' } }),
    prisma.brand.upsert({ where: { name: 'Apple' }, update: {}, create: { name: 'Apple' } }),
    prisma.brand.upsert({ where: { name: 'Xiaomi' }, update: {}, create: { name: 'Xiaomi' } }),
    prisma.brand.upsert({ where: { name: 'Oppo' }, update: {}, create: { name: 'Oppo' } }),
    prisma.brand.upsert({ where: { name: 'Vivo' }, update: {}, create: { name: 'Vivo' } }),
    prisma.brand.upsert({ where: { name: 'OnePlus' }, update: {}, create: { name: 'OnePlus' } }),
    prisma.brand.upsert({ where: { name: 'Realme' }, update: {}, create: { name: 'Realme' } }),
    prisma.brand.upsert({ where: { name: 'Anker' }, update: {}, create: { name: 'Anker' } }),
    prisma.brand.upsert({ where: { name: 'Baseus' }, update: {}, create: { name: 'Baseus' } }),
  ])
  console.log('✅ Brands created')

  const [samsung, apple, xiaomi, oppo, vivo, oneplus, realme, anker, baseus] = brands

  // ── Suppliers ──────────────────────────────────────────────
  const supplier1 = await prisma.supplier.upsert({
    where: { id: 'sup_hafeez' },
    update: {},
    create: {
      id: 'sup_hafeez',
      name: 'Hafeez Electronics Wholesale',
      contactName: 'Muhammad Hafeez',
      phone: '+92-321-9876543',
      address: 'Hafeez Center, Lahore',
      notes: 'Primary Samsung & Apple supplier',
    },
  })

  const supplier2 = await prisma.supplier.upsert({
    where: { id: 'sup_techzone' },
    update: {},
    create: {
      id: 'sup_techzone',
      name: 'TechZone Distributors',
      contactName: 'Kamran Ali',
      phone: '+92-333-1122334',
      address: 'Saddar, Rawalpindi',
      notes: 'Chinese brands & accessories',
    },
  })
  console.log('✅ Suppliers created')

  // ── Products ───────────────────────────────────────────────
  type CreatedProduct = {
    id: string
    quantity: number
  }

  const productsData = [
    {
      sku: 'SAM-S24U-256BLK',
      name: 'Samsung Galaxy S24 Ultra',
      slug: 'samsung-galaxy-s24-ultra',
      categoryId: smartphones!.id,
      brandId: samsung!.id,
      supplierId: supplier1.id,
      purchasePrice: 280000,
      sellingPrice: 319900,
      quantity: 8,
      minStockLevel: 3,
      warrantyPeriodDays: 365,
      hasImei: true,
      isPublished: true,
      isFeatured: true,
      description: 'Samsung Galaxy S24 Ultra with S Pen, 200MP camera, 12GB RAM',
      onlineDescription: 'The ultimate Samsung flagship with built-in S Pen, 200MP AI camera, and titanium frame.',
      onlinePrice: 319900,
      barcode: '8806095262215',
    },
    {
      sku: 'SAM-A55-128BLU',
      name: 'Samsung Galaxy A55 5G',
      slug: 'samsung-galaxy-a55-5g',
      categoryId: smartphones!.id,
      brandId: samsung!.id,
      supplierId: supplier1.id,
      purchasePrice: 68000,
      sellingPrice: 79900,
      quantity: 15,
      minStockLevel: 5,
      warrantyPeriodDays: 365,
      hasImei: true,
      isPublished: true,
      isFeatured: false,
      description: 'Samsung Galaxy A55 5G, 8GB RAM, 128GB Storage, 50MP Triple Camera',
      onlineDescription: 'Premium mid-range 5G smartphone with AMOLED display and pro-grade cameras.',
      onlinePrice: 79900,
      barcode: '8806095384320',
    },
    {
      sku: 'IPH-15PM-256BLK',
      name: 'Apple iPhone 15 Pro Max',
      slug: 'apple-iphone-15-pro-max',
      categoryId: smartphones!.id,
      brandId: apple!.id,
      supplierId: supplier1.id,
      purchasePrice: 340000,
      sellingPrice: 389900,
      quantity: 5,
      minStockLevel: 2,
      warrantyPeriodDays: 365,
      hasImei: true,
      isPublished: true,
      isFeatured: true,
      description: 'iPhone 15 Pro Max 256GB Black Titanium, A17 Pro chip, USB-C',
      onlineDescription: 'Apple iPhone 15 Pro Max with titanium design, 48MP camera system, and A17 Pro chip.',
      onlinePrice: 389900,
      barcode: '194253418542',
    },
    {
      sku: 'XMI-14U-512BLK',
      name: 'Xiaomi 14 Ultra',
      slug: 'xiaomi-14-ultra',
      categoryId: smartphones!.id,
      brandId: xiaomi!.id,
      supplierId: supplier2.id,
      purchasePrice: 160000,
      sellingPrice: 189900,
      quantity: 6,
      minStockLevel: 3,
      warrantyPeriodDays: 365,
      hasImei: true,
      isPublished: true,
      isFeatured: true,
      description: 'Xiaomi 14 Ultra with Leica cameras, Snapdragon 8 Gen 3, 5000mAh',
      onlineDescription: 'Photography flagship with Leica quad-camera system and 90W fast charging.',
      onlinePrice: 189900,
      barcode: '6941059660217',
    },
    {
      sku: 'OPP-RENO12P-256',
      name: 'Oppo Reno 12 Pro',
      slug: 'oppo-reno-12-pro',
      categoryId: smartphones!.id,
      brandId: oppo!.id,
      supplierId: supplier2.id,
      purchasePrice: 72000,
      sellingPrice: 84900,
      quantity: 10,
      minStockLevel: 4,
      warrantyPeriodDays: 365,
      hasImei: true,
      isPublished: true,
      isFeatured: false,
      description: 'Oppo Reno 12 Pro 256GB, 50MP AI Camera, 80W SUPERVOOC',
      onlineDescription: 'Slim design with powerful AI camera and all-day battery life.',
      onlinePrice: 84900,
      barcode: '6932169332101',
    },
    {
      sku: 'VIV-V30E-256',
      name: 'Vivo V30e',
      slug: 'vivo-v30e',
      categoryId: smartphones!.id,
      brandId: vivo!.id,
      supplierId: supplier2.id,
      purchasePrice: 52000,
      sellingPrice: 59900,
      quantity: 12,
      minStockLevel: 4,
      warrantyPeriodDays: 365,
      hasImei: true,
      isPublished: true,
      isFeatured: false,
      description: 'Vivo V30e 256GB, 64MP Camera, 5000mAh, 44W Flash Charge',
      onlineDescription: 'Ultra-slim portrait photography phone with blazing fast charging.',
      onlinePrice: 59900,
      barcode: '6935117872451',
    },
    {
      sku: 'ANK-PWR-PD65W',
      name: 'Anker 65W GaN Charger',
      slug: 'anker-65w-gan-charger',
      categoryId: chargers!.id,
      brandId: anker!.id,
      supplierId: supplier2.id,
      purchasePrice: 3500,
      sellingPrice: 4999,
      quantity: 40,
      minStockLevel: 10,
      warrantyPeriodDays: 180,
      hasImei: false,
      isPublished: true,
      isFeatured: false,
      description: 'Anker 65W GaN Charger, 3-port (USB-C x2, USB-A x1)',
      onlineDescription: 'Power up all your devices with this compact 65W GaN charger.',
      onlinePrice: 4999,
      barcode: '0194644137892',
    },
    {
      sku: 'BAS-CBL-USB-C-1M',
      name: 'Baseus USB-C to USB-C Cable 1m',
      slug: 'baseus-usb-c-cable-1m',
      categoryId: chargers!.id,
      brandId: baseus!.id,
      supplierId: supplier2.id,
      purchasePrice: 400,
      sellingPrice: 799,
      quantity: 100,
      minStockLevel: 20,
      hasImei: false,
      isPublished: true,
      isFeatured: false,
      description: 'Baseus 100W USB-C to USB-C braided cable, 1 meter',
      onlineDescription: '100W fast charging braided cable, compatible with all USB-C devices.',
      onlinePrice: 799,
      barcode: '6953156238459',
    },
    {
      sku: 'ANK-PWR-20000',
      name: 'Anker PowerCore 20000mAh',
      slug: 'anker-powercore-20000',
      categoryId: powerBanks!.id,
      brandId: anker!.id,
      supplierId: supplier2.id,
      purchasePrice: 5500,
      sellingPrice: 7499,
      quantity: 25,
      minStockLevel: 8,
      warrantyPeriodDays: 180,
      hasImei: false,
      isPublished: true,
      isFeatured: false,
      description: 'Anker PowerCore 20000mAh, 22.5W, 2x USB-C + USB-A',
      onlineDescription: 'High-capacity power bank that charges your phone 5+ times.',
      onlinePrice: 7499,
      barcode: '0194644137909',
    },
    {
      sku: 'SAM-S24-CASE-CLR',
      name: 'Samsung S24 Ultra Clear Cover',
      slug: 'samsung-s24-ultra-clear-cover',
      categoryId: cases!.id,
      brandId: samsung!.id,
      supplierId: supplier1.id,
      purchasePrice: 800,
      sellingPrice: 1499,
      quantity: 30,
      minStockLevel: 10,
      hasImei: false,
      isPublished: true,
      isFeatured: false,
      description: 'Official Samsung Galaxy S24 Ultra Clear Cover Case',
      onlineDescription: 'Official Samsung transparent case for Galaxy S24 Ultra with S Pen slot.',
      onlinePrice: 1499,
      barcode: '8806095288406',
    },
    {
      sku: 'TEMPER-UNI-67',
      name: 'Tempered Glass Screen Guard (6.7")',
      slug: 'tempered-glass-screen-guard-67',
      categoryId: screenGuards!.id,
      brandId: null,
      supplierId: supplier2.id,
      purchasePrice: 150,
      sellingPrice: 399,
      quantity: 200,
      minStockLevel: 50,
      hasImei: false,
      isPublished: true,
      isFeatured: false,
      description: 'Universal Tempered Glass Screen Protector for 6.7" phones',
      onlineDescription: 'Crystal clear tempered glass with 9H hardness for maximum screen protection.',
      onlinePrice: 399,
      barcode: 'IZ-TEMP-67-001',
    },
    {
      sku: 'EARPHONE-TYPE-C',
      name: 'USB-C Earphones',
      slug: 'usb-c-earphones',
      categoryId: earphones!.id,
      brandId: null,
      supplierId: supplier2.id,
      purchasePrice: 600,
      sellingPrice: 999,
      quantity: 50,
      minStockLevel: 15,
      hasImei: false,
      isPublished: true,
      isFeatured: false,
      description: 'USB Type-C in-ear earphones with mic, compatible with Android',
      onlineDescription: 'Crisp audio, built-in mic, and ergonomic design for all-day comfort.',
      onlinePrice: 999,
      barcode: 'IZ-EAR-USBC-001',
    },
  ]

  const createdProducts: CreatedProduct[] = []

  for (const p of productsData) {
    const { barcode, ...productData } = p
    const product = await prisma.product.upsert({
      where: { sku: productData.sku },
      update: {},
      create: productData,
    })

    // Create barcode
    if (barcode) {
      await prisma.productBarcode.upsert({
        where: { barcode },
        update: {},
        create: {
          productId: product.id,
          barcode,
          type: barcode.startsWith('IZ-') ? 'INTERNAL' : barcode.length === 13 ? 'EAN13' : 'CODE128',
        },
      })
    }

    // Record initial stock movement
    if (product.quantity > 0) {
      const existing = await prisma.inventoryMovement.findFirst({
        where: { productId: product.id, type: 'INITIAL' },
      })
      if (!existing) {
        await prisma.inventoryMovement.create({
          data: {
            productId: product.id,
            type: MovementType.INITIAL,
            quantity: product.quantity,
            balanceBefore: 0,
            balanceAfter: product.quantity,
            reason: 'Initial stock from seed',
            createdBy: owner.id,
          },
        })
      }
    }

    createdProducts.push({ id: product.id, quantity: product.quantity })
  }
  console.log(`✅ ${productsData.length} products created with barcodes and inventory movements`)

  // ── Samsung S24 Ultra Variants ─────────────────────────────
  const s24ultra = await prisma.product.findUnique({ where: { sku: 'SAM-S24U-256BLK' } })
  if (s24ultra) {
    const variantData = [
      { name: '256GB Titanium Black', sku: 'SAM-S24U-256BLK-V', attributes: { color: 'Titanium Black', storage: '256GB' }, purchasePrice: 280000, sellingPrice: 319900, quantity: 4, barcode: '8806095262222' },
      { name: '512GB Titanium Gray', sku: 'SAM-S24U-512GRY-V', attributes: { color: 'Titanium Gray', storage: '512GB' }, purchasePrice: 310000, sellingPrice: 349900, quantity: 2, barcode: '8806095262239' },
      { name: '256GB Titanium Violet', sku: 'SAM-S24U-256VIO-V', attributes: { color: 'Titanium Violet', storage: '256GB' }, purchasePrice: 280000, sellingPrice: 319900, quantity: 2, barcode: '8806095262246' },
    ]
    for (const v of variantData) {
      const { barcode, ...data } = v
      const variant = await prisma.productVariant.upsert({
        where: { sku: data.sku },
        update: {},
        create: { productId: s24ultra.id, ...data },
      })
      if (barcode) {
        await prisma.productBarcode.upsert({
          where: { barcode },
          update: { variantId: variant.id, productId: s24ultra.id },
          create: { productId: s24ultra.id, variantId: variant.id, barcode, type: 'EAN13' },
        })
      }
    }
    console.log('✅ Samsung S24 Ultra variants and barcodes created')
  }

  // ── iPhone 15 Pro Max Variants ─────────────────────────────
  const iph15pm = await prisma.product.findUnique({ where: { sku: 'IPH-15PM-256BLK' } })
  if (iph15pm) {
    const variantData = [
      { name: '256GB Black Titanium', sku: 'IPH-15PM-256BLK-V', attributes: { color: 'Black Titanium', storage: '256GB' }, purchasePrice: 340000, sellingPrice: 389900, quantity: 2, barcode: '194253418559' },
      { name: '512GB Natural Titanium', sku: 'IPH-15PM-512NAT-V', attributes: { color: 'Natural Titanium', storage: '512GB' }, purchasePrice: 385000, sellingPrice: 439900, quantity: 2, barcode: '194253418566' },
      { name: '1TB Desert Titanium', sku: 'IPH-15PM-1TB-DES-V', attributes: { color: 'Desert Titanium', storage: '1TB' }, purchasePrice: 440000, sellingPrice: 499900, quantity: 1, barcode: '194253418573' },
    ]
    for (const v of variantData) {
      const { barcode, ...data } = v
      const variant = await prisma.productVariant.upsert({
        where: { sku: data.sku },
        update: {},
        create: { productId: iph15pm.id, ...data },
      })
      if (barcode) {
        await prisma.productBarcode.upsert({
          where: { barcode },
          update: { variantId: variant.id, productId: iph15pm.id },
          create: { productId: iph15pm.id, variantId: variant.id, barcode, type: 'CODE128' },
        })
      }
    }
    console.log('✅ iPhone 15 Pro Max variants and barcodes created')
  }

  // ── Sample Customers ───────────────────────────────────────
  await prisma.customer.upsert({
    where: { phone: '+92-300-5551234' },
    update: {},
    create: { name: 'Bilal Khan', phone: '+92-300-5551234', email: 'bilal@example.com' },
  })
  await prisma.customer.upsert({
    where: { phone: '+92-333-9998765' },
    update: {},
    create: { name: 'Ayesha Raza', phone: '+92-333-9998765', email: 'ayesha@example.com' },
  })
  console.log('✅ Sample customers created')

  // ── Catalog Settings ───────────────────────────────────────
  await prisma.catalogSettings.upsert({
    where: { shopId: shop.id },
    update: {},
    create: {
      shopId: shop.id,
      shopName: 'iZone by Haider',
      tagline: 'Your Trusted Mobile Phone Store in Lahore',
      bannerText: 'Eid Sale! Up to 10% off on Samsung and Apple',
      whatsappNumber: '923001234567',
      showPrices: true,
      allowOrders: true,
      metaTitle: 'iZone by Haider | Mobile Phones & Accessories in Lahore',
      metaDescription:
        'Buy latest Samsung, Apple, Xiaomi, Oppo smartphones and accessories at best prices. iZone by Haider — Lahore\'s trusted mobile shop.',
    },
  })
  console.log('✅ Catalog settings created')

  // ── Sample Expenses ────────────────────────────────────────
  await prisma.expense.createMany({
    skipDuplicates: true,
    data: [
      { shopId: shop.id, userId: owner.id, category: 'Rent', amount: 25000, description: 'Monthly shop rent - October', expenseAt: new Date('2026-10-01') },
      { shopId: shop.id, userId: owner.id, category: 'Utilities', amount: 3500, description: 'Electricity bill', expenseAt: new Date('2026-10-05') },
      { shopId: shop.id, userId: owner.id, category: 'Salary', amount: 20000, description: 'Cashier salary - October', expenseAt: new Date('2026-10-10') },
      { shopId: shop.id, userId: owner.id, category: 'Marketing', amount: 5000, description: 'Facebook ad spend', expenseAt: new Date('2026-10-12') },
    ],
  })
  console.log('✅ Sample expenses created')

  console.log('\n🎉 Seeding complete!')
  console.log('\n📋 Login Credentials:')
  console.log('  Owner:   owner@izone.pk   / owner123')
  console.log('  Cashier: cashier@izone.pk / cashier123')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
