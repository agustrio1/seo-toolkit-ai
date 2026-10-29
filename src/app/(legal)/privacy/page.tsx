import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — SEO Toolkit AI",
  description: "Cara SEO Toolkit AI mengumpulkan, memakai, dan melindungi data Anda.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Kebijakan Privasi</h1>
      <p className="text-sm text-muted-foreground">Terakhir diperbarui: 29 Oktober 2026</p>

      <h2>1. Siapa kami</h2>
      <p>
        SEO Toolkit AI (&ldquo;Aplikasi&rdquo;) adalah platform alat SEO berbasis web yang dioperasikan oleh
                jadikanweb.id (contact@jadikanweb.id). Aplikasi ini berjalan di domain
        jadikanweb.id dan subdomain vercel.app sebagai lingkungan operasional.
      </p>

      <h2>2. Data yang kami kumpulkan</h2>
      <ul>
        <li>
          <strong>Akun:</strong> alamat email dan hash kata sandi (algoritma scrypt). Kami tidak pernah
          menyimpan kata sandi Anda dalam bentuk teks asli.
        </li>
        <li>
          <strong>Data kerja:</strong> project, kata kunci, hasil analisis konten, hasil crawl, brief konten,
          meta tag, kluster, laporan, serta riwayat pemakaian fitur AI yang Anda buat di dalam aplikasi.
        </li>
        <li>
          <strong>Token Google Search Console (opsional)</strong>: bila Anda menghubungkan akun Google, kami
          menyimpan token OAuth (access/refresh token) dalam keadaan terenkripsi AES-256-GCM di database kami.
          Token hanya dipakai untuk mengambil data Search Console milik akun Anda sendiri (read-only).
        </li>
        <li>
          <strong>Cookie sesi:</strong> cookie HTTP-only untuk menjaga Anda tetap login. Cookie sementara
          selama proses OAuth Google.
        </li>
      </ul>

      <h2>3. Data yang TIDAK kami kumpulkan</h2>
      <p>
        Tidak ada iklan, tidak ada pelacak pihak ketiga (analytics pemasaran), tidak ada penjualan data.
        Kami tidak meminta akses tulis apa pun ke akun Google Anda — scope OAuth yang dipakai hanyalah
        <code className="rounded bg-muted px-1">https://www.googleapis.com/auth/webmasters.readonly</code>.
      </p>

      <h2>4. Cara data dipakai</h2>
      <ul>
        <li>Menyediakan fitur: analisis SEO, pembuatan konten AI, crawler, agregasi laporan.</li>
        <li>
          Pemrosesan AI: teks yang Anda kirim (kata kunci, konten, URL) diproses oleh Google Gemini API
          di server kami. Prompt dan hasil generate disimpan sebagai riwayat kerja Anda.
        </li>
        <li>
          Metering kuota: jumlah panggilan AI per hari dicatat untuk membatasi pemakaian tier gratis.
        </li>
      </ul>

      <h2>5. Penyedia layanan (sub-prosesor)</h2>
      <ul>
        <li><strong>Google</strong> — OAuth (Sign in dengan Google), Search Console API, Gemini API.</li>
        <li><strong>Vercel Inc.</strong> — hosting aplikasi (region sesuai konfigurasi platform).</li>
        <li><strong>Neon Inc.</strong> — basis data PostgreSQL terkelola.</li>
      </ul>
      <p>
        Data hanya dibagikan kepada penyedia di atas sejauh diperlukan untuk mengoperasikan layanan,
        dan tidak pernah untuk tujuan pemasaran pihak ketiga.
      </p>

      <h2>6. Keamanan</h2>
      <ul>
        <li>Kata sandi di-hash dengan scrypt; token Google dienkripsi AES-256-GCM sebelum disimpan.</li>
        <li>Semua komunikasi memakai HTTPS. Kredensial server disimpan sebagai environment variable.</li>
        <li>Crawler internal kami memiliki proteksi SSRF dan menghormati batas keamanan jaringan.</li>
      </ul>

      <h2>7. Retensi &amp; penghapusan data</h2>
      <p>
        Anda dapat menghapus project, riwayat analisis, dan memutus koneksi Google Search Console kapan saja
        dari dalam aplikasi (koneksi GSC sekaligus mencabut token di sisi Google). Untuk penghapusan akun dan
        seluruh sisa datanya, kirim permintaan dari email terdaftar Anda ke contact@jadikanweb.id; kami
        memprosesnya maksimal 30 hari.
      </p>

      <h2>8. Hak Anda</h2>
      <p>
        Sesuai UU PDP No. 27/2022 (Indonesia) dan prinsip GDPR, Anda berhak atas informasi, akses, koreksi,
        penghapusan, dan penarikan persetujuan pemrosesan data. Hubungi kontak di atas.
      </p>

      <h2>9. Perubahan kebijakan</h2>
      <p>
        Bila kebijakan ini berubah secara material, tanggal &ldquo;terakhir diperbarui&rdquo; di atas akan
        diubah. Penggunaan berkelanjutan setelah perubahan berarti penerimaan kebijakan baru.
      </p>
    </>
  );
}
