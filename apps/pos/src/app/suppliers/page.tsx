'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, Plus, Search, Phone, Mail, MapPin, Package, ShoppingBag,
  ArrowLeft, Check, X, Edit2, AlertCircle, Building2,
} from 'lucide-react'

import { useSession } from 'next-auth/react'

type Supplier = {
  id: string
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  isActive: boolean
  productCount: number
  purchaseCount: number
  lastPurchaseAt: string | null
}

export default function SuppliersPage() {
  const { data: session, status } = useSession()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Form state
  const [formName, setFormName] = useState('')
  const [formContact, setFormContact] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formNotes, setFormNotes] = useState('')

  async function fetchSuppliers() {
    setLoading(true)
    try {
      const res = await fetch(`/api/suppliers?search=${encodeURIComponent(search)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) setSuppliers(data.data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSuppliers()
  }, [search])

  function openCreateModal() {
    setEditingSupplier(null)
    setFormName('')
    setFormContact('')
    setFormPhone('')
    setFormEmail('')
    setFormAddress('')
    setFormNotes('')
    setErrorMsg('')
    setShowModal(true)
  }

  function openEditModal(sup: Supplier) {
    setEditingSupplier(sup)
    setFormName(sup.name)
    setFormContact(sup.contactName ?? '')
    setFormPhone(sup.phone ?? '')
    setFormEmail(sup.email ?? '')
    setFormAddress(sup.address ?? '')
    setFormNotes(sup.notes ?? '')
    setErrorMsg('')
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) {
      setErrorMsg('Supplier name is required')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    try {
      const url = editingSupplier ? `/api/suppliers/${editingSupplier.id}` : '/api/suppliers'
      const method = editingSupplier ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          contactName: formContact.trim() || null,
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          notes: formNotes.trim() || null,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setShowModal(false)
        fetchSuppliers()
      } else {
        setErrorMsg(data.error?.message || 'Failed to save supplier')
      }
    } catch {
      setErrorMsg('Network error saving supplier')
    } finally {
      setSubmitting(false)
    }
  }

  if (status !== 'loading' && session?.user && session.user.role !== 'OWNER') {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-4 my-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle size={24} />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600">Suppliers management is restricted to Store Owners only.</p>
        <Link href="/pos" className="btn-primary inline-flex items-center gap-2">
          Go to Point of Sale
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 -ml-2 text-slate-500 hover:text-slate-800 rounded-lg">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Suppliers</h1>
              <p className="text-xs text-slate-500">Manage distributor contacts & purchase channels</p>
            </div>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Plus size={16} />
            <span>Add Supplier</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5">
        {/* Search Bar */}
        <div className="mb-6 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search suppliers by name, contact, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
          />
        </div>

        {/* Suppliers List */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 animate-pulse h-40" />
            ))}
          </div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800 mb-1">No Suppliers Found</h3>
            <p className="text-xs text-slate-500 mb-4">Add your wholesale vendors to record purchases and intake stock.</p>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl"
            >
              Add First Supplier
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map(s => (
              <div
                key={s.id}
                className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{s.name}</h3>
                        {s.contactName && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Users size={11} /> {s.contactName}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => openEditModal(s)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-50"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>

                  <div className="space-y-1.5 my-3 text-xs text-slate-600">
                    {s.phone && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-slate-400" />
                        <a href={`tel:${s.phone}`} className="hover:text-blue-600 font-mono">
                          {s.phone}
                        </a>
                      </div>
                    )}
                    {s.email && (
                      <div className="flex items-center gap-2">
                        <Mail size={13} className="text-slate-400" />
                        <a href={`mailto:${s.email}`} className="hover:text-blue-600 truncate">
                          {s.email}
                        </a>
                      </div>
                    )}
                    {s.address && (
                      <div className="flex items-start gap-2">
                        <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
                        <span className="text-slate-500 line-clamp-1">{s.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1 font-medium">
                    <Package size={13} className="text-blue-500" />
                    {s.productCount} Products
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <ShoppingBag size={13} className="text-emerald-500" />
                    {s.purchaseCount} Purchases
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add / Edit Supplier Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h2 className="font-bold text-slate-900 text-sm">
                {editingSupplier ? 'Edit Supplier' : 'New Supplier'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Supplier Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hafeez Electronics Wholesale"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Muhammad Hafeez"
                    value={formContact}
                    onChange={e => setFormContact(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. +92 321 9876543"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="e.g. sales@hafeezelectronics.pk"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Address / Market Location</label>
                <input
                  type="text"
                  placeholder="e.g. Shop 42, Hafeez Center, Lahore"
                  value={formAddress}
                  onChange={e => setFormAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Terms</label>
                <textarea
                  rows={2}
                  placeholder="e.g. 15 days credit terms, 100% genuine Samsung warranty"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
