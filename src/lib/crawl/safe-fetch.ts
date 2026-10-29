import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { isBlockedIp, SsrfError, validateTargetUrl, resolveRedirectLocation } from "./ssrf";

/**
 * Lookup kustom untuk undici: pada saat koneksi benar-benar dibuat,
 * setiap alamat hasil DNS diperiksa. Ini menutup celah DNS rebinding / TOCTOU
 * karena pemeriksaan terjadi pada resolusi yang sama dengan yang dipakai koneksi.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safeLookup: any = (hostname: string, options: unknown, callback: (e: Error | null, addr?: unknown, family?: number) => void) => {
  dns.promises
    .lookup(hostname, { all: true, verbatim: true })
    .then((addresses) => {
      if (addresses.length === 0) {
        callback(new SsrfError("DNS_EMPTY"), undefined);
        return;
      }
      for (const a of addresses) {
        if (isBlockedIp(a.address)) {
          callback(new SsrfError("BLOCKED_IP"), undefined);
          return;
        }
      }
      const opts = options as { all?: boolean };
      if (opts?.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    })
    .catch((e) => callback(e as Error, undefined));
};

const safeAgent = new Agent({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connect: { lookup: safeLookup } as any,
  connections: 4,
  keepAliveTimeout: 10_000,
});

export interface FetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

const MAX_REDIRECTS = 5;

export async function safeFetchHtml(
  startUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const maxBytes = opts.maxBytes ?? 400_000;
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Validasi eksplisit tiap hop (skema, hostname, blok cadangan — resolusi final
    // tetap dijaga safeAgent saat koneksi dibuka).
    await validateTargetUrl(current);

    const res = await undiciFetch(current, {
      redirect: "manual",
      dispatcher: safeAgent,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "SEToolkitAI/1.0 (+technical SEO audit; respectful of robots.txt)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    const status = res.status;
    if (status >= 300 && status < 400) {
      const location = res.headers.get("location");
      // Konsumsi body kecil agar socket bebas.
      await res.body?.cancel().catch(() => {});
      if (!location) throw new SsrfError("REDIRECT_NO_LOCATION");
      current = resolveRedirectLocation(location, new URL(current));
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const reader = res.body?.getReader();
    let received = 0;
    let truncated = false;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > maxBytes) {
          truncated = true;
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
    }
    const bodyBytes = new Uint8Array(received > maxBytes ? maxBytes : received);
    let offset = 0;
    for (const c of chunks) {
      if (offset + c.length > bodyBytes.length) {
        bodyBytes.set(c.subarray(0, bodyBytes.length - offset), offset);
        break;
      }
      bodyBytes.set(c, offset);
      offset += c.length;
    }
    return {
      finalUrl: current,
      status,
      contentType,
      body: new TextDecoder("utf-8", { fatal: false }).decode(bodyBytes),
      truncated,
    };
  }
  throw new SsrfError("TOO_MANY_REDIRECTS");
}
