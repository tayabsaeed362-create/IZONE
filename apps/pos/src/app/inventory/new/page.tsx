'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { ProductIntakeForm } from '@/components/inventory/ProductIntakeForm'
export default function NewProductPage(){
 const router=useRouter()
 return <main className="dashboard"><div className="max-w-2xl mx-auto"><Link href="/inventory" className="inline-flex items-center gap-2 text-sm text-slate-500 mb-6"><ArrowLeft size={16}/>Back to Inventory</Link><section className="panel"><div className="panel-heading"><div><h1 className="text-xl font-semibold">Add New Product</h1><p>Enter a title, scan your barcode, and set your stock.</p></div><Plus size={22}/></div><ProductIntakeForm onSaved={()=>router.push('/inventory')} onCancel={()=>router.push('/inventory')}/></section></div></main>
}
