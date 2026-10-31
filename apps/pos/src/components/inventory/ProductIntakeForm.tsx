'use client'
import { useState, useEffect, useCallback } from 'react'
import { ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { CaptureCode } from './CaptureCode'
import { ImeiPhotoReader } from './ImeiPhotoReader'
import { ProductPhotos } from './ProductPhotos'
import { useSession } from 'next-auth/react'

type CodeField = 'barcode' | 'imei1' | 'imei2'
export function ProductIntakeForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const { data: session } = useSession()
  const isOwner = session?.user?.role === 'OWNER'
  const [categories, setCategories] = useState<Array<{id:string;name:string}>>([])
  const [busy,setBusy] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [error,setError] = useState('')
  const [scanField,setScanField] = useState<CodeField | null>(null)
  const [imeiHistory, setImeiHistory] = useState<{ found: boolean; count: number; nextCycle: number; latestInstance?: any } | null>(null)
  const [form,setForm] = useState({name:'',description:'',categoryId:'',barcode:'',imei1:'',imei2:'',purchasePrice:'',sellingPrice:'',minSellingPrice:'',initialStock:'1',minStockLevel:'5'})
  const isPhone = /^(smart\s*phones?|mobile\s*phones?)$/i.test(categories.find(c=>c.id===form.categoryId)?.name.trim() || '')
  useEffect(()=>{fetch('/api/categories').then(r=>r.json()).then(r=>{if(r.success)setCategories((r.data as Array<{id:string;name:string}>).filter(category => /^(smart\s*phones?|accessories)$/i.test(category.name.trim())));else setError('Unable to load categories.')}).catch(()=>setError('Unable to load categories. Check your connection.'))},[])

  // Check if IMEI was previously bought & sold
  useEffect(() => {
    if (!form.imei1 || form.imei1.length !== 15) {
      setImeiHistory(null)
      return
    }
    const timer = setTimeout(() => {
      fetch(`/api/products/imei-lookup?imei=${form.imei1}`)
        .then(r => r.json())
        .then(res => {
          if (res.success && res.data?.found) {
            setImeiHistory(res.data)
            if (!form.name && res.data.latestInstance?.name) {
              setForm(prev => ({ ...prev, name: res.data.latestInstance.name }))
            }
          } else {
            setImeiHistory(null)
          }
        })
        .catch(() => setImeiHistory(null))
    }, 350)
    return () => clearTimeout(timer)
  }, [form.imei1])

  const capture = useCallback((code:string)=>{
    if(!scanField)return
    if(scanField !== 'barcode' && !/^\d{15}$/.test(code)){toast.error('Scan a valid 15-digit IMEI barcode.');return}
    setForm(previous=>({...previous,[scanField]:code}));setScanField(null)
  },[scanField])
  const closeScanner = useCallback(()=>setScanField(null),[])
  const codeInput = (field:CodeField,label:string) => <div key={field}><label htmlFor={`intake-${field}`} className="block text-xs font-semibold text-slate-700 mb-2">{label}{field !== 'barcode' && <span className="font-normal text-slate-400"> (optional)</span>}</label><div className="flex gap-2"><input id={`intake-${field}`} type="text" inputMode={field==='barcode'?'text':'numeric'} autoComplete="off" pattern={field==='barcode'?undefined:'[0-9]{15}'} maxLength={field==='barcode'?undefined:15} title={field==='barcode'?undefined:'Enter a 15-digit IMEI'} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value.trim()})} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(field==='imei1')document.getElementById('intake-imei2')?.focus();else e.currentTarget.blur()}}} placeholder={`Scan or enter ${label}`} className="input-field min-w-0"/><button type="button" aria-label={`Scan ${label}`} className="btn-secondary px-3" onClick={()=>setScanField(field)}><ScanLine size={19}/></button></div></div>
  return <><form className="p-5 sm:p-6 space-y-5" onSubmit={async e=>{
    e.preventDefault();if (busy || photoBusy) return;setError('')
    if(isPhone && form.imei1 && form.imei1===form.imei2){setError('IMEI 1 and IMEI 2 must be different.');return}
    const sellPrice = Number(form.sellingPrice) || 0
    const thresholdPrice = Number(form.minSellingPrice) || 0
    if (thresholdPrice > 0 && sellPrice > 0 && thresholdPrice > sellPrice) {
      setError('Threshold selling price cannot be higher than regular selling price.');return
    }
    setBusy(true)
    try{
      const response=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images,name:form.name.trim(),description:isPhone?form.description.trim()||undefined:undefined,categoryId:form.categoryId||undefined,barcode:form.barcode||undefined,imei1:isPhone?form.imei1||undefined:undefined,imei2:isPhone?form.imei2||undefined:undefined,imeiCycle:imeiHistory?.nextCycle || 1,purchasePrice:Number(form.purchasePrice)||0,sellingPrice:sellPrice,minSellingPrice:thresholdPrice,initialStock:Number(form.initialStock)||0,minStockLevel:Number(form.minStockLevel)||5})})
      const result=await response.json()
      if(!response.ok||!result.success)throw new Error(typeof result.error==='string'?result.error:result.error?.message||'Unable to save product.')
      toast.success(
        !isOwner
          ? `Product "${form.name}" submitted for Owner approval!`
          : imeiHistory?.found
          ? `Phone re-acquired as Cycle #${imeiHistory.nextCycle}`
          : `Product "${form.name}" created`
      )
      onSaved()
    }catch(err){setError(err instanceof Error?err.message:'Unable to save product.')}finally{setBusy(false)}
  }}>
    {!isOwner && (
      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3.5 text-xs text-sky-950 flex items-start gap-2.5">
        <span className="text-base">📋</span>
        <div>
          <strong className="font-bold block">Staff Submission Mode</strong>
          <p className="text-[11px] text-sky-800 mt-0.5 leading-relaxed">
            Aap ka add kiya hua product Owner ke paas approval ke liye jayega. <strong>Cost, Selling Price, aur Threshold</strong> aap ke liye <strong>optional</strong> hain — aap chahein to khali chhor dein, Owner approval ke waqt set kar dega.
          </p>
        </div>
      </div>
    )}
    <div><label htmlFor="intake-name" className="block text-xs font-semibold mb-2">Product Title *</label><input id="intake-name" required maxLength={255} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Enter product title" className="input-field"/></div>
    {isPhone && <div><label htmlFor="intake-description" className="block text-xs font-semibold mb-2">Description <span className="font-normal text-slate-400">(optional)</span></label><textarea id="intake-description" maxLength={5000} rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Add phone details, condition, or storage information" className="input-field resize-y"/></div>}
    <ProductPhotos images={images} onChange={setImages} onBusyChange={setPhotoBusy} disabled={busy}/>
    {codeInput('barcode','Barcode')}
    <p className="text-xs text-slate-500">Phones without a barcode can be scanned directly by IMEI at POS checkout.</p>
    <div><label htmlFor="intake-category" className="block text-xs font-semibold mb-2">Category *</label><select id="intake-category" required value={form.categoryId} onChange={e=>setForm({...form,categoryId:e.target.value,imei1:'',imei2:''})} className="input-field"><option value="">Select Category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    {isPhone && (
      <fieldset className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-4">
        <legend className="text-xs font-semibold text-blue-800 px-1">Phone identification (IMEI)</legend>
        <ImeiPhotoReader key={form.categoryId} onApply={values => setForm(previous => ({...previous,...values}))}/>
        {codeInput('imei1','IMEI 1')}
        {codeInput('imei2','IMEI 2')}
        
        {imeiHistory?.found && (
          <div className="rounded-xl border border-sky-300 bg-sky-50 p-3.5 text-xs text-sky-900 space-y-1.5 animate-fadeIn">
            <div className="flex items-center justify-between font-bold">
              <span>🔄 Repeat Phone Re-acquisition (Cycle #{imeiHistory.nextCycle})</span>
              <span className="text-[10px] bg-sky-200 text-sky-800 px-2 py-0.5 rounded-full font-semibold">
                Old Record Preserved
              </span>
            </div>
            <p className="text-[11px] text-sky-800 leading-relaxed">
              This IMEI was previously registered in your shop. All past sales records and prices remain locked and untouched. This phone will be saved as <strong>Cycle #{imeiHistory.nextCycle}</strong> with a unique identifier.
            </p>
            {imeiHistory.latestInstance?.name && form.name !== imeiHistory.latestInstance.name && (
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, name: imeiHistory.latestInstance.name }))}
                className="text-[11px] text-blue-700 underline font-semibold hover:text-blue-900"
              >
                Use previous title: &ldquo;{imeiHistory.latestInstance.name}&rdquo;
              </button>
            )}
          </div>
        )}
      </fieldset>
    )}
    
    {/* Pricing Section with Purchase Cost, Selling Price, and Threshold Selling Price */}
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Pricing & Threshold Rules</span>
        <span className="text-[11px] text-slate-500">Sellers cannot sell below threshold price</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="intake-purchasePrice" className="block text-xs font-semibold mb-1 text-slate-700">
            Purchase Cost (Rs) {!isOwner && <span className="font-normal text-slate-400">(optional)</span>}
          </label>
          <input id="intake-purchasePrice" type="number" min="0" step="0.01" className="input-field bg-white" placeholder="0.00" value={form.purchasePrice} onChange={e=>setForm({...form,purchasePrice:e.target.value})}/>
        </div>
        <div>
          <label htmlFor="intake-sellingPrice" className="block text-xs font-semibold mb-1 text-blue-900">
            Selling Price (Rs) {isOwner ? '*' : <span className="font-normal text-slate-400">(optional)</span>}
          </label>
          <input id="intake-sellingPrice" required={isOwner} type="number" min="0" step="0.01" className="input-field bg-white font-bold text-blue-900" placeholder="0.00" value={form.sellingPrice} onChange={e=>setForm({...form,sellingPrice:e.target.value})}/>
        </div>
        <div>
          <label htmlFor="intake-minSellingPrice" className="block text-xs font-semibold mb-1 text-amber-700 flex items-center justify-between">
            <span>Threshold Price (Rs) <span className="font-normal text-slate-400">(optional)</span></span>
            <span className="text-[10px] font-normal text-amber-600">(Floor)</span>
          </label>
          <input id="intake-minSellingPrice" type="number" min="0" step="0.01" className="input-field bg-white border-amber-300 focus:border-amber-500" placeholder="Min limit for seller" value={form.minSellingPrice} onChange={e=>setForm({...form,minSellingPrice:e.target.value})}/>
          <p className="text-[10px] text-slate-500 mt-1">Seller cannot discount below this amount</p>
        </div>
      </div>
    </div>

    {/* Inventory Stock Section */}
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label htmlFor="intake-initialStock" className="block text-xs font-semibold mb-2">Initial Stock</label>
        <input id="intake-initialStock" required type="number" min="0" step="1" className="input-field" value={form.initialStock} onChange={e=>setForm({...form,initialStock:e.target.value})}/>
      </div>
      <div>
        <label htmlFor="intake-minStockLevel" className="block text-xs font-semibold mb-2">Low Stock Alert Level</label>
        <input id="intake-minStockLevel" required type="number" min="0" step="1" className="input-field" value={form.minStockLevel} onChange={e=>setForm({...form,minStockLevel:e.target.value})}/>
      </div>
    </div>
    {error && (
      <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
        <p className="font-medium">{error}</p>
      </div>
    )}
    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100"><button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button><button disabled={busy || photoBusy} type="submit" className="btn-primary">{busy?'Saving...':isOwner?'Save Product':'Submit for Owner Approval'}</button></div>
  </form>{scanField&&<CaptureCode label={scanField==='barcode'?'Barcode':scanField==='imei1'?'IMEI 1':'IMEI 2'} onCapture={capture} onClose={closeScanner}/>}</>
}
