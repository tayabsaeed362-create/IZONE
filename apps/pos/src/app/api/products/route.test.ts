import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ session: vi.fn(), create: vi.fn(), category: vi.fn(), transaction: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@izone/database', () => ({ prisma: {
 product: { findUnique: vi.fn().mockResolvedValue(null) },
 category: { findUnique: mocks.category },
 shop: { findFirst: vi.fn().mockResolvedValue({ id: 'shop' }) },
 $transaction: mocks.transaction,
} }))
import { POST } from './route'
const base = { name: 'Phone', categoryId: 'phones', purchasePrice: 100, sellingPrice: 200, initialStock: 1 }
const request = (data: object) => new NextRequest('http://localhost/api/products', { method: 'POST', body: JSON.stringify(data) })
beforeEach(() => {
 vi.clearAllMocks()
 mocks.session.mockResolvedValue({ user: { id: 'owner', role: 'OWNER' } })
 mocks.category.mockResolvedValue({ name: 'Smartphones' })
 mocks.create.mockImplementation(async ({ data }) => ({ id: 'product', ...data }))
 mocks.transaction.mockImplementation(async work => work({ product: { create: mocks.create }, productBarcode: { create: vi.fn() }, inventoryMovement: { create: vi.fn() }, auditLog: { create: vi.fn() } }))
})
describe('Product intake', () => {
 it('generates an internal SKU and persists both optional IMEIs', async () => {
  const response = await POST(request({ ...base, barcode: '8901234567890', imei1: '490154203237518', imei2: '356938035643809' }))
  expect(response.status).toBe(201)
  const data = mocks.create.mock.calls[0][0].data
  expect(data.sku).toMatch(/^IZ-[0-9a-f-]{36}$/)
  expect(data.imei1).toBe('490154203237518')
  expect(data.imei2).toBe('356938035643809')
  expect(data.brandId).toBeUndefined()
 })
 it('passes durable product photos to storage and returns them', async () => {
  const images = ['data:image/jpeg;base64,/9j/2Q==']
  const response = await POST(request({ ...base, images }))
  expect(response.status).toBe(201)
  expect(mocks.create.mock.calls[0][0].data.images).toEqual(images)
  expect((await response.json()).data.images).toEqual(images)
 })
 it('accepts a smartphone without IMEIs', async () => {
  expect((await POST(request(base))).status).toBe(201)
 })
 it('rejects invalid or duplicate phone IMEIs before writing', async () => {
  expect((await POST(request({ ...base, imei1: '123' }))).status).toBe(400)
  expect((await POST(request({ ...base, imei1: '490154203237518', imei2: '490154203237518' }))).status).toBe(400)
  expect(mocks.transaction).not.toHaveBeenCalled()
 })
 it('rejects IMEIs on accessories', async () => {
  mocks.category.mockResolvedValue({ name: 'Accessories' })
  expect((await POST(request({ ...base, imei2: '356938035643809' }))).status).toBe(400)
  expect(mocks.transaction).not.toHaveBeenCalled()
 })
 it('preserves owner-only creation', async () => {
  mocks.session.mockResolvedValue(null)
  expect((await POST(request(base))).status).toBe(401)
  mocks.session.mockResolvedValue({ user: { id: 'cashier', role: 'CASHIER' } })
  expect((await POST(request(base))).status).toBe(403)
  expect(mocks.transaction).not.toHaveBeenCalled()
 })
})
