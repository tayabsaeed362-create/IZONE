const fs = require('node:fs')
const { chromium, expect } = require('@playwright/test')

;(async () => {
  const seed = fs.readFileSync('packages/database/src/seed.ts', 'utf8')
  const email = seed.match(/where:\s*\{ email: '([^']+)' \},\s*update: \{\},\s*create: \{\s*shopId: shop\.id,\s*name: 'Ali Haider'/)?.[1]
  const password = seed.match(/const ownerHash = await bcrypt\.hash\('([^']+)'/)?.[1]
  if (!email || !password) throw new Error('Seeded owner credentials unavailable')

  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  const productName = `Photo persistence check ${Date.now()}`
  let productId

  try {
    await page.goto('http://localhost:3000/login')
    await page.locator('input[type=email]').fill(email)
    await page.locator('input[type=password]').fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.waitForURL(url => url.pathname !== '/login', { timeout: 20000 })

    const created = await page.evaluate(async ({ productName }) => {
      const categoriesResponse = await fetch('/api/categories')
      const categoriesJson = await categoriesResponse.json()
      const category = categoriesJson.data.find(item => /^smart\s*phones?$/i.test(item.name.trim()))
      if (!category) throw new Error('Smart Phones category not found')
      const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=='
      const response = await fetch('/api/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: productName, description: 'Persistence verification', categoryId: category.id, purchasePrice: 1, sellingPrice: 2, initialStock: 0, minStockLevel: 5, isPublished: false, images: [image] }),
      })
      return { status: response.status, body: await response.json(), image }
    }, { productName })
    expect(created.status).toBe(201)
    productId = created.body.data.id
    expect(created.body.data.images).toEqual([created.image])

    await page.goto('http://localhost:3000/inventory')
    const persisted = await page.evaluate(async ({ productName }) => {
      const response = await fetch(`/api/products?q=${encodeURIComponent(productName)}&limit=100`)
      const json = await response.json()
      return json.data.products.find(item => item.name === productName)
    }, { productName })
    expect(persisted.description).toBe('Persistence verification')
    expect(persisted.images).toEqual([created.image])

    const archived = await page.evaluate(async id => {
      const response = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      return { status: response.status, body: await response.json() }
    }, productId)
    expect(archived.status).toBe(200)
    expect(archived.body.data.product.status).toBe('DISCONTINUED')
    console.log('PASS: saved unpublished zero-stock smartphone image and description reload from the database; verification item archived.')
  } finally {
    if (productId) {
      await page.evaluate(async id => {
        await fetch(`/api/products/${id}`, { method: 'DELETE' })
      }, productId).catch(() => {})
    }
    await browser.close()
  }
})().catch(error => { console.error(error); process.exit(1) })
