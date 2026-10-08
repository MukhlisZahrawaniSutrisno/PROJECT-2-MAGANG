'use client';
import { useState, type FormEvent } from 'react';
import { Command, ArrowLeft, BookOpen, MessageCircle, FileText, CheckCircle2 } from 'lucide-react';
import { createSeedData } from '@/lib/seed';
export function DemoResource({ kind, reference }: {kind:'chat'|'sop'|'form'|'ticket';reference:string}) {
  const seed=createSeedData(); const problem=seed.problems[Number(reference)-1]; const person=seed.employees.find(e=>e.email.startsWith(`${reference}@`));
  const [text,setText]=useState(''); const [name,setName]=useState(''); const [saved,setSaved]=useState(''); const [error,setError]=useState('');
  function submit(event:FormEvent) {
    event.preventDefault();setError('');
    try {
      const key='whose-job-demo-requests-v1'; const previous=JSON.parse(localStorage.getItem(key)||'[]');
      if(!Array.isArray(previous))throw new Error('Invalid storage');
      const id=crypto.randomUUID().slice(0,8).toUpperCase();
      localStorage.setItem(key,JSON.stringify([...previous,{id,kind,reference,name,text,createdAt:new Date().toISOString()}])); setSaved(id);
    } catch { setError('Contoh belum tersimpan. Periksa penyimpanan browser.'); }
  }
  const Icon=kind==='chat'?MessageCircle:kind==='sop'?BookOpen:FileText;
  return <main className="resource-page"><a href="/" className="resource-brand"><Command size={22}/>Whose Job Is It Anyway?</a><article className="resource-card"><span className="hero-pill">Contoh demo</span><div className="category-icon category-0"><Icon size={24}/></div><h1>{kind==='chat'?`Chat dengan ${person?.name || 'PIC'}`:kind==='sop'?'Panduan penanganan':kind==='ticket'?'Buat tiket bantuan':'Form pengajuan'}</h1><p className="resource-subtitle">{problem?.title || person?.department || 'Bantuan operasional kantor'}</p><div className="detail-info">Halaman ini menggunakan data contoh. Tidak ada pesan atau laporan yang dikirim ke karyawan.</div>{kind==='sop'?<><h2>Sebelum menghubungi PIC</h2><ol><li>Catat lokasi, waktu, dan dampak masalah.</li><li>Siapkan deskripsi singkat serta bukti pendukung yang relevan.</li><li>Hubungi PIC yang tersedia atau buka formulir terkait.</li><li>Target respons berlaku sejak laporan diterima oleh PIC.</li></ol><p>Dalam penggunaan kantor, admin mengganti tautan contoh ini dengan SOP perusahaan yang sudah disetujui.</p></>:saved?<div className="resource-success" role="status"><CheckCircle2 size={35}/><h2>Contoh tersimpan di browser.</h2><p>Referensi demo: {saved}</p><button className="btn btn-secondary" onClick={()=>{setSaved('');setText('');}}>Buat contoh lain</button></div>:<form onSubmit={submit}>{kind!=='chat'&&<><label htmlFor="request-name">Nama pelapor</label><input id="request-name" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></>}<label htmlFor="request-message">{kind==='chat'?'Pesan':'Deskripsi kebutuhan'}</label><textarea id="request-message" required maxLength={2000} rows={5} value={text} onChange={e=>setText(e.target.value)} placeholder="Jelaskan kebutuhan Anda…"/>{error&&<p className="form-error" role="alert">{error}</p>}<button className="btn btn-primary">Simpan contoh {kind==='chat'?'pesan':'pengajuan'}</button></form>}<a href="/" className="text-button resource-back"><ArrowLeft size={15}/>Kembali ke workspace</a></article></main>;
}
