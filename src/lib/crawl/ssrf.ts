import { promises as dns } from "node:dns";
import { isIP } from "node:net";

/**
 * Proteksi SSRF: validasi skema, hostname, dan hasil resolusi DNS (IPv4 + IPv6).
 * Pemeriksaan dilakukan pada IP hasil resolusi, bukan hanya string URL,
 * dan diulang untuk setiap redirect.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

export class SsrfError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function isBlockedIpV4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b >= 18 && b <= 19)) return true; // benchmark
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved
  return false;
}

export function isBlockedIpV6(ip: string): boolean {
  const v = ip.toLowerCase().split("%")[0];
  if (v === "::" || v === "::1") return true;
  // fc00::/7 unique local, fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/i.test(v)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(v)) return true;
  // IPv4-mapped ::ffff:a.b.c.d
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpV4(mapped[1]);
  // 64:ff9b NAT64 dan 2001:db8 documentation tidak boleh diakses
  if (v.startsWith("64:ff9b:")) return true;
  if (v.startsWith("100:")) return true; // discard-only
  // ::/96 IPv4-compatible
  if (/^::(\d+\.\d+\.\d+\.\d+)$/.test(v)) {
    const m = v.match(/^::(\d+\.\d+\.\d+\.\d+)$/)!;
    return isBlockedIpV4(m[1]);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIpV4(ip);
  if (kind === 6) return isBlockedIpV6(ip);
  return true; // bukan IP valid → tolak
}

export interface ValidatedTarget {
  url: URL;
  hostname: string;
  addresses: string[];
}

/**
 * Validasi penuh: skema → hostname → resolusi DNS → semua address publik.
 * Mengembalikan daftar IP hasil resolusi untuk dipakai ulang bila diperlukan.
 */
export async function validateTargetUrl(rawUrl: string, allowedProtocols = ["http:", "https:"]): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError("INVALID_URL");
  }
  if (!allowedProtocols.includes(url.protocol)) throw new SsrfError("BLOCKED_PROTOCOL");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname) throw new SsrfError("EMPTY_HOST");
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".internal") || hostname.endsWith(".local")) {
    throw new SsrfError("BLOCKED_HOSTNAME");
  }
  if (url.username || url.password) throw new SsrfError("CREDENTIALS_IN_URL");

  // Jika hostname berupa literal IP, periksa langsung.
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new SsrfError("BLOCKED_IP");
    return { url, hostname, addresses: [hostname] };
  }

  let v4: string[] = [];
  let v6: string[] = [];
  try {
    [v4, v6] = await Promise.all([
      dns.resolve4(hostname).catch(() => [] as string[]),
      dns.resolve6(hostname).catch(() => [] as string[]),
    ]);
  } catch {
    throw new SsrfError("DNS_FAILURE");
  }
  const addresses = [...v4, ...v6];
  if (addresses.length === 0) throw new SsrfError("DNS_EMPTY");
  for (const a of addresses) {
    if (isBlockedIp(a)) throw new SsrfError("BLOCKED_IP");
  }
  return { url, hostname, addresses };
}

/** Validasi redirect location relatif/absolut terhadap URL asal. */
export function resolveRedirectLocation(location: string, fromUrl: URL): string {
  try {
    return new URL(location, fromUrl).toString();
  } catch {
    throw new SsrfError("INVALID_REDIRECT");
  }
}
