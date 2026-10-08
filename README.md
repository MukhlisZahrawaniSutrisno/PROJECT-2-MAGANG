# Whose Job Is It Anyway?

Website internal untuk menemukan penanggung jawab berdasarkan masalah operasional.
Next.js App Router, TypeScript, Tailwind CSS, dan Supabase/PostgreSQL.

## Jalankan lokal

Gunakan Node.js 24 atau lebih baru.

```sh
npm install
npm run dev
```

Buka http://127.0.0.1:3000. Jika belum ada konfigurasi Supabase, development
menggunakan **mode demo** dengan data fiktif. Pencarian, admin, availability,
log, favorit, dan contoh formulir dapat dicoba. Perubahan tersimpan di browser
tersebut, tidak dibagikan dengan perangkat/pengguna lain. Kontak dan SOP contoh
mengarah ke halaman demonstrasi, bukan karyawan atau dokumen kantor.

Menu akun memungkinkan pratinjau employee/admin dan reset data demo. Pergantian
role tersebut khusus demo; bukan mekanisme authentication untuk data nyata.

## Fitur

- Pencarian keyword/sinonim, frasa, dan typo; kategori IT, fasilitas, keuangan, People Ops.
- PIC utama, backup, availability, target respons/penyelesaian, SOP/form/tiket.
- Prioritas backup saat utama tidak tersedia; keduanya tidak tersedia tetap matched.
- Dashboard: kelola masalah/keyword/PIC/SLA/tautan, pegawai, jadwal cuti, unmatched queries.
- Analitik tujuh hari dari log aktual; histori hasil menggunakan snapshot.
- Unmatched query dikelompokkan; resolved dibuka kembali jika kembali tidak cocok.
- Tampilan mobile, navigasi keyboard, dialog native, favorit lokal, dan shortcut Ctrl/Cmd+K.

## Hubungkan Supabase

1. Buat proyek Supabase di akun perusahaan dan pilih lokasi sesuai kebijakan data.
2. Jalankan `supabase/migrations/001_initial.sql` sekali melalui SQL Editor atau
   pipeline SQL migrations. Ini membuat sembilan tabel, RLS, trigger dan RPC.
3. Opsional, jalankan `supabase/seed.sql` untuk katalog fiktif; ganti seluruh PIC,
   kontak, keywords, SLA, dan tautan sebelum penggunaan kantor. Seed tidak membuat
   akun atau log karyawan. Seed dapat dijalankan ulang tanpa menduplikasi katalog.
4. Salin `.env.example` menjadi `.env.local`, kemudian isi:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
DEMO_MODE=false
```

Legacy anon key juga didukung melalui `NEXT_PUBLIC_SUPABASE_ANON_KEY` sebagai
alternatif. Jangan masukkan secret/service-role key ke environment publik.
Konfigurasi URL/key yang hanya terisi sebagian menghasilkan error, bukan demo.

5. Supabase Auth: nonaktifkan public signup dan anonymous sign-in. Undang akun
   karyawan melalui Dashboard Auth. Konfigurasikan email provider/SMTP produksi.
6. Email masuk memakai kode OTP. Pada template **Magic Link**, tampilkan kode
   menggunakan `{{ .Token }}`. Aplikasi memanggil `signInWithOtp` dengan
   `shouldCreateUser: false`, lalu `verifyOtp` bertipe email.
7. Akun baru sengaja dibuat sebagai employee **nonaktif**. Setelah memverifikasi
   undangan, aktifkan melalui SQL Editor menggunakan UUID dari Auth:

```sql
update public.users
set is_active = true, role = 'admin', display_name = 'Nama Admin'
where id = 'UUID-AKUN-ADMIN';

update public.users
set is_active = true, role = 'employee', display_name = 'Nama Karyawan'
where id = 'UUID-AKUN-KARYAWAN';
```

Role/aktivasi akun dikelola melalui jalur database tepercaya, bukan form profil.
Metadata yang bisa diubah pengguna tidak memberikan role admin. Admin mengelola
PIC melalui website; relasi akun dan PIC opsional, dapat ditautkan melalui SQL:

```sql
update public.employees set user_id = 'UUID-AKUN'
where id = 'UUID-PEGAWAI';
```

8. Restart server setelah mengubah environment. Pengguna harus masuk dengan email
   yang sudah diundang dan diaktifkan. Pengujian OTP/email jarak jauh membutuhkan
   proyek dan email provider nyata; mode demo tidak mengirim email.

## Data dan keamanan

- RLS di semua tabel; authenticated tidak mendapat hak tulis tabel langsung.
- RPC `app_bootstrap`, `search_problems`, `admin_mutate` memeriksa akun aktif,
  admin bila perlu, dan memvalidasi input. JSON helpers tidak boleh dipanggil publik.
- Availability dihitung pada database untuk live mode. Employee menerima status
  boolean, bukan tanggal/alasan cuti. Direktori tidak menampilkan histori cuti.
- PIC tanpa akun login didukung. PIC/masalah diarsipkan untuk menjaga referensi.
- Penghapusan akun mengosongkan identitas pemilik log; snapshot pencarian tetap ada.
- Pencarian, hasil dan unmatched disimpan atomik. Retry memiliki ID operasi dan
  pemilik terikat; tidak dapat digunakan pengguna lain untuk membaca histori.
- API mutations memeriksa Origin, ukuran request, payload, sesi Supabase dan role.
- URL HTTP(S) tervalidasi; antarmuka form admin memilih HTTPS. Link luar memakai
  `noopener noreferrer`. Seluruh data contoh fiktif.
- Target SLA adalah menit kalender sejak laporan diterima. Aplikasi belum
  mengukur SLA aktual atau membuat tiket pada sistem eksternal.
- UI pencarian membatasi input 200 karakter; API/database menolak lebih dari 500
  karakter. Maksimal 50 keywords dan 20 tautan per masalah; hasil live maksimal 20.
- Demo memakai pencocokan lokal; live memakai PostgreSQL `pg_trgm`, sehingga
  urutan hasil typo bisa berbeda. Kalibrasikan threshold untuk kosakata kantor.

Tetapkan kebijakan retensi perusahaan. Untuk contoh retensi 90 hari, jalankan
SQL berikut melalui maintenance terjadwal menggunakan identitas database tepercaya:

```sql
delete from public.search_logs
where searched_at < now() - interval '90 days';
```

Hasil log ikut terhapus melalui CASCADE. Item unmatched tetap ada untuk tindak
lanjut; frekuensi dihitung dari log yang masih disimpan. Scheduling maintenance
belum diaktifkan. Jangan memakai role browser untuk maintenance ini.

## Build dan deployment

```sh
npm run typecheck
npm test
npm run build
npm start
```

Deploy repository ke Vercel dan isi environment Supabase untuk environment yang
sesuai. Pisahkan proyek/database staging dan production. Production tanpa
konfigurasi database gagal tertutup. `DEMO_MODE=true` hanya untuk deploy sampel
fiktif yang sengaja dibuat sebagai demo. Deployment remote belum dilakukan.

## Pengujian

```sh
npm test
npm run typecheck
npm run build
# Jalankan dev server pada terminal terpisah sebelum browser tests:
npm run test:e2e
```

Unit tests memakai Node test runner dan native TypeScript stripping. Database
tests menjalankan migration SQL sebenarnya pada PostgreSQL WASM melalui PGlite
beserta extension pg_trgm; auth schema dan JWT context Supabase disimulasikan.
Ini memvalidasi constraint/RLS/RPC, tetapi bukan pengujian layanan Auth/SMTP remote.

Playwright menguji desktop dan mobile. Jika Chromium belum tersedia:

```sh
npx playwright install chromium
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` dapat diarahkan ke Chrome lokal. Konfigurasi
memakai browser cache workspace ini jika tersedia, lalu fallback browser Playwright.
`PLAYWRIGHT_BASE_URL` dapat dipakai untuk server pada alamat/port lain.

## Referensi

- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication)
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [PostgreSQL pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)

Spesifikasi pengerjaan: `docs/implementation-plan.md`.
