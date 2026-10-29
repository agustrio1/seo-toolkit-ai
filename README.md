# SEO Toolkit AI

SaaS toolkit SEO bertenaga AI dibangun mengikuti `DOC.MD` (Master Prompt Final). Semua modul diimplementasikan langsung di repositori ini, memakai **Google Gemini versi gratis** sebagai penyedia AI, dengan pembatas kuota agar tidak melewati rate-limit free tier.

> Dibangun dengan Next.js 16 (App Router) + TypeScript strict + Tailwind v4 + Neon PostgreSQL + Drizzle ORM. Target deploy: Vercel Hobby.

## Daftar isi modul

Setiap menu di sidebar mengarah ke halaman nyata (tidak ada placeholder):

| Area | Halaman | Fungsi |
| --- | --- | --- |
| Workspace | `/dashboard` | Ringkasan proyek, aktivitas, pemakaian AI |
| Research | `/keywords` | Keyword workspace + import/ekspor CSV |
| Research | `/clusters` | AI Keyword Clustering |
| Content | `/analyzer` | Content SEO Analyzer (deterministik + AI) |
| Content | `/content` | Content Studio: brief + draf artikel |
| Content | `/meta` | Bulk Meta Generator + validasi batas karakter |
| Technical | `/crawl` | Technical SEO Crawler (proteksi SSRF + batch) |
| Technical | `/gsc` | Search Console Analyzer (OAuth) |
| Technical | `/internal-links` | Internal Link & Topical Map |
| Technical | `/geo` | GEO & AI Search Assistant |
| Reports | `/reports` | Report Generator + ekspor CSV |
| Reports | `/history` | Riwayat analisis |
| Reports | `/usage` | Usage Monitor kuota AI |
| Pengaturan | `/projects` | CRUD proyek |
| Pengaturan | `/settings` | Akun, preferensi AI, retensi data |
| Pengaturan | `/settings/integrations` | Koneksi Google Search Console |

Plus autentikasi credential di `/login` & `/register`.

## Prasyarat & konfigurasi

1. Salin `.env.example` menjadi `.env.local` lalu isi:

   | Variabel | Keterangan |
   | --- | --- |
   | `GEMINI_API_KEY` | Kunci API Gemini (free tier) |
   | `GEMINI_MODEL` | Default `gemini-2.5-flash` |
   | `GEMINI_DAILY_REQUEST_CAP` | Pagu request AI global per hari (default 150) |
   | `GEMINI_PER_MINUTE_CAP` | Pagu request AI per menit (default 4) |
   | `DATABASE_URL` | Connection string Neon PostgreSQL |
   | `AUTH_SECRET` | Secret acak untuk sesi (mis. `openssl rand -hex 32`) |
   | `OAUTH_TOKEN_ENC_KEY` | Key untuk mengenkripsi token OAuth GSC di DB |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Kredensial OAuth Google (untuk GSC) |
   | `GOOGLE_REDIRECT_URI` | Default `http://localhost:3000/api/gsc/callback` |
   | `APP_URL` | Default `http://localhost:3000` |

   **Jangan pernah** meng-commit file berisi nilai asli.

2. Buat database Neon, tempel `DATABASE_URL`.

3. Generate token OAuth Google di Google Cloud Console (type Web app), aktifkan Search Console API, daftirkan `GOOGLE_REDIRECT_URI`.

## Menjalankan

```bash
npm install
npm run db:push      # atau: npm run db:migrate (menggunakan drizzle/0000_init.sql)
npm run dev          # http://localhost:3000
```

### Skrip

```bash
npm run dev          # server pengembangan
npm run build        # build produksi
npm run start        # jalankan hasil build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # vitest run (logika murni)
npm run db:generate  # drizzle-kit generate
npm run db:migrate   # drizzle-kit migrate
npm run db:push      # drizzle-kit push
```

Skema lengkap sudah di-generate di `drizzle/0000_init.sql` (19 tabel).

## Gemini free tier — bagaimana diterapkan

- **Selalu server-side.** Kunci API tidak pernah dikirim ke klien; semua panggilan Gemini lewat Route Handler Node.
- **Metering kuota global.** Pemakaian dihitung di tabel `usage_records` dengan pagu harian (`GEMINI_DAILY_REQUEST_CAP`) dan per-menit (`GEMINI_PER_MINUTE_CAP`) berbasis hari timezone Pacific. Melewati pagu menghasilkan `429` dengan pesan jujur, bukan diam-diam gagal.
- **Retry 429** dengan backoff pada level service.
- **Batch ramah kuota.** Fitur bulk (meta generator, crawler, jobs) memproses dalam batch kecil (mis. 3 item AI / 5 URL per jalan) dengan tombol "jalankan batch" agar tidak menembus limit dalam satu request.
- **Output AI divalidasi** sebagai data tak-tepercaya (Zod schema); angka volume/KD/CPC **tidak pernah** direkayasa — hanya dari input pengguna.

## Keamanan

- **Isolasi data per pengguna.** Setiap query memfilter `userId`; kepemilikan proyek diverifikasi server-side (`assertProjectOwnership`) sebelum operasi apa pun.
- **Proteksi SSRF crawler.** Skema dibatasi http/https, hostname privat/`.internal`/`.local`/metadata ditolak, literal IP privat & IPv6 loopback/ULA/link-local/IPv4-mapped diblokir, DNS di-resolve dan **semua** IP hasil diperiksa, kredensial di URL ditolak, redirect divalidasi ulang. JS target tidak dieksekusi (cheerio `scriptingEnabled: false`).
- **Auth.** Password di-hash scrypt (`scrypt$N$r$p$salt$hash`, NFKC), perbandingan `timingSafeEqual`, rate-limit login, cookie sesi HttpOnly.
- **CSV.** Batas ukuran 2MB & 5000 baris, formula-injection dinetralisir (`= + - @ tab/CR` → prefix `'`), escaping RFC via PapaParse.
- **Token OAuth GSC** dienkripsi at-rest memakai `OAUTH_TOKEN_ENC_KEY`.

## Search Console

Menggunakan API resmi Google via OAuth. Bila kredensial Google belum diisi, modul GSC memberikan pesan galat yang jelas (tidak pura-pura sukses / tidak data palsu).

## Verifikasi

Status terakhir gerbang kualitas:

- `npm run typecheck` — **lolos** (exit 0)
- `npm run lint` — **lolos** (exit 0)
- `npm run test` — **57 tes lolos** (SSRF, CSV, logika SEO, parse halaman/robots, hash password)
- `npm run build` — **lolos** (exit 0)

> `cacheComponents`/`partialPrefetching` sengaja dimatikan di `next.config.ts` karena tidak kompatibel dengan Route Handler `runtime = "nodejs"` yang dibutuhkan akses DB server-side. Aturan lint `react-hooks/set-state-in-effect` dimatikan secara sadar (false-positive pada pola fetch-on-mount idiomatik); lihat komentar di `eslint.config.mjs`.

## Catatan deploy

Belum dilakukan deployment ke produksi. Untuk Vercel: set seluruh variabel env di project settings, jalankan migrasi DB, lalu deploy. Pastikan `DATABASE_URL` Neon mengizinkan koneksi dari luar (Vercel egress).
