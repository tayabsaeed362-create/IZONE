'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
export default function LoginPage() {
 const router = useRouter()
 const [email,setEmail]=useState('')
 const [password,setPassword]=useState('')
 const [error,setError]=useState('')
 const [busy,setBusy]=useState(false)
 return <main className="dashboard"><section className="panel mx-auto mt-10 max-w-md p-8"><div className="eyebrow">IZONE BY HAIDER</div><h1 className="text-2xl font-semibold mb-2">Welcome back</h1><p className="text-sm text-slate-500 mb-7">Sign in to your retail workspace.</p><form className="space-y-5" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try {const result=await signIn('credentials',{email,password,redirect:false});if(result?.error) setError('Unable to sign in. Check your email and password.');else {const target=new URLSearchParams(window.location.search).get('callbackUrl');const url=target ? new URL(target,window.location.origin) : null;router.push(url?.origin===window.location.origin ? url.pathname+url.search : '/');router.refresh()}}catch {setError('Sign-in is unavailable. Please try again.')}finally{setBusy(false)}}}><label className="block text-sm font-medium">Email<input type="email" autoComplete="username" required className="input-field mt-2" value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="block text-sm font-medium">Password<input type="password" autoComplete="current-password" required className="input-field mt-2" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}<button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Signing in...' : 'Sign in'}</button></form></section></main>
}
