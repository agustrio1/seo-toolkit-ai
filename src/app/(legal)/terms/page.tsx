import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ketentuan Layanan — SEO Toolkit AI",
  description: "Syarat dan ketentuan penggunaan SEO Toolkit AI.",
};

export default function TermsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Ketentuan Layanan</h1>
      <p className="text-sm text-muted-foreground">Terakhir diperbarui: 29 Oktober 2026</p>

      <h2>1. Cakupan layanan</h2>
      <p>
        SEO Toolkit AI menyediakan perangkat bantu SEO berbasis web: riset kata kunci, klustering AI,
        analisis konten, generator meta, crawler teknis, integrasi Google Search Console, laporan, dan
        analisis GEO/AI Search. Dengan membuat akun, Anda menyetujui ketentuan ini.
      </p>

      <h2>2. Akun</h2>
      <ul>
        <li>Anda bertanggung jawab menjaga kerahasiaan kredensial akun Anda.</li>
        <li>Satu akun untuk satu pengguna; jangan membagikan akses.</li>
        <li>Anda dapat menghapus akun dan data Anda kapan saja (lihat Kebijakan Privasi).</li>
      </ul>

      <h2>3. Fitur gratis &amp; kuota</h2>
      <p>
        Fitur AI memakai Google Gemini tier gratis. Kuota harian/per-menit dapat dibatasi tanpa
        pemberitahuan sebelumnya oleh Google maupun oleh kami (metering). Bila kuota habis, fitur AI
        tidak dapat dipakai sementara — fitur non-AI tetap berjalan. Kami tidak menjamin ketersediaan
        layanan 100% (SLA) pada tier gratis.
      </p>

      <h2>4. Data Google Search Console</h2>
      <ul>
        <li>Integrasi GSC bersifat opsional dan hanya membaca data milik akun Google yang Anda hubungkan.</li>
        <li>
          Data Search Console dapat terlambat beberapa hari, dan query bervolume sangat kecil
          dianonimisasi oleh Google. Kami menampilkan data apa adanya tanpa estimasi atau fabrikasi.
        </li>
        <li>
          Kami tidak berafiliasi dengan, didukung oleh, atau diberi izin oleh Google LLC maupun
          Google Search Console. &ldquo;Google&rdquo; dan &ldquo;Search Console&rdquo; adalah merek dagang
          Google LLC.
        </li>
      </ul>

      <h2>5. Penggunaan yang wajar</h2>
      <ul>
        <li>Dilarang memakai crawler untuk menarget situs tanpa izin, host internal, atau alamat yang diblokir sistem.</li>
        <li>Dilarang memakai layanan untuk spam, konten ilegal, atau aktivitas yang melanggar hukum yang berlaku di Indonesia.</li>
        <li>Dilarang melakukan reverse engineering, beban berlebih (abuse kuota), atau upaya menembus pembatasan keamanan.</li>
      </ul>

      <h2>6. Tidak ada jaminan hasil</h2>
      <p>
        Hasil SEO bergantung pada banyak faktor di luar kendali kami (algoritma Google, kompetisi, kualitas
        situs). Rekomendasi AI dan metrik yang ditampilkan adalah alat bantu keputusan, bukan jaminan
        peringkat, trafik, atau pendapatan.
      </p>

      <h2>7. Batasan tanggung jawab</h2>
      <p>
        Sejauh diizinkan hukum, penyedia layanan tidak bertanggung jawab atas kerugian tidak langsung
        akibat penggunaan atau ketidakmampuan menggunakan layanan, termasuk kerugian akibat keputusan
        bisnis yang diambil berdasarkan data dari aplikasi.
      </p>

      <h2>8. Penangguhan &amp; penghentian</h2>
      <p>
        Kami dapat menangguhkan akun yang melanggar ketentuan ini. Anda dapat berhenti menggunakan
        layanan kapan saja; permintaan penghapusan data diproses sesuai Kebijakan Privasi.
      </p>

      <h2>9. Perubahan ketentuan &amp; hukum yang berlaku</h2>
      <p>
        Perubahan ketentuan diumumkan lewat pembaruan halaman ini. Ketentuan ini tunduk pada hukum
        Republik Indonesia.
      </p>

      <h2>10. Kontak</h2>
      <p>Pertanyaan tentang ketentuan ini: contact@jadikanweb.id</p>
    </>
  );
}
