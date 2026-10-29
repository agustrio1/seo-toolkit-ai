import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Aplikasi ini dinamis (DB server-side + sesi per-request), sehingga
  // route handler butuh runtime Node. cacheComponents (dan
  // partialPrefetching yang bergantung padanya) tidak kompatibel dengan
  // `export const runtime = "nodejs"` pada Route Handler, jadi dimatikan.
  cacheComponents: false,
  // Saat akses dev dari host lain (mis. IP jaringan/LAN), Next 16 memblokir
  // semua dev resource /_next/* (inklusif JS hidrasi) yang membuat form tidak
  // interaktif. Daftarkan origin yang boleh agar hidrasi berjalan.
  allowedDevOrigins: ["192.168.1.14"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
