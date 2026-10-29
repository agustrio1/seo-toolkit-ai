import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Aturan baru di eslint-plugin-react-hooks v6 ini menandai pola
      // fetch-on-mount yang idiomatik (reset state + muat data) sebagai error,
      // termasuk pemanggilan fungsi async. Kami pertahankan pola tersebut
      // karena menghilangkan reset sinkron akan menampilkan data basi saat
      // proyek/hari berubah, jadi aturan ini dimatikan secara sadar.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Skrip bantu sekali-pakai dari alur deploy Vercel (CommonJS, bukan sumber app).
    ".vercel-tmp/**",
  ]),
]);

export default eslintConfig;
