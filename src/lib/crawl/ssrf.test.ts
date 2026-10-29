import { describe, it, expect } from "vitest";
import { isBlockedIp, isBlockedIpV4, isBlockedIpV6, resolveRedirectLocation, validateTargetUrl, SsrfError } from "@/lib/crawl/ssrf";

describe("SSRF blocklist IPv4", () => {
  it("memblokir range privat/loopback/link-local/metadata/reserved", () => {
    const blocked = [
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254", // metadata cloud (AWS/GCP)
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "192.0.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ];
    for (const ip of blocked) expect(isBlockedIpV4(ip)).toBe(true);
  });

  it("mengizinkan IP publik", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "192.167.1.1", "93.184.216.34", "192.203.113.1"]) {
      expect(isBlockedIpV4(ip)).toBe(false);
    }
  });

  it("menolak string yang bukan IP valid", () => {
    expect(isBlockedIp("999.1.1.1")).toBe(true);
    expect(isBlockedIp("example.com")).toBe(true);
  });
});

describe("SSRF blocklist IPv6", () => {
  it("memblokir loopback, link-local, ULA, IPv4-mapped privat", () => {
    expect(isBlockedIpV6("::1")).toBe(true);
    expect(isBlockedIpV6("::")).toBe(true);
    expect(isBlockedIpV6("fe80::1")).toBe(true);
    expect(isBlockedIpV6("fd00::1234")).toBe(true);
    expect(isBlockedIpV6("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpV6("::ffff:10.0.0.1")).toBe(true);
    expect(isBlockedIpV6("64:ff9b::8.8.8.8")).toBe(true);
  });

  it("mengizinkan IPv6 publik", () => {
    expect(isBlockedIpV6("2606:4700:4700::1111")).toBe(false);
    expect(isBlockedIpV6("2001:4860:4860::8888")).toBe(false);
  });

  it("isBlockedIp mendeteksi tipe dengan benar", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });
});

describe("validateTargetUrl", () => {
  it("menolak protocol bukan http/https (file:, gopher:, dll)", async () => {
    for (const u of ["file:///etc/passwd", "gopher://127.0.0.1:11211/", "http://[::1]/"]) {
      await expect(validateTargetUrl(u)).rejects.toBeInstanceOf(SsrfError);
    }
  });

  it("menolak hostname terlarang & .internal", async () => {
    await expect(validateTargetUrl("http://localhost/")).rejects.toMatchObject({ code: "BLOCKED_HOSTNAME" });
    await expect(validateTargetUrl("http://metadata.google.internal/")).rejects.toMatchObject({ code: "BLOCKED_HOSTNAME" });
    await expect(validateTargetUrl("http://db.internal/")).rejects.toMatchObject({ code: "BLOCKED_HOSTNAME" });
  });

  it("menolak credential di URL", async () => {
    await expect(validateTargetUrl("https://user:pass@8.8.8.8/")).rejects.toMatchObject({ code: "CREDENTIALS_IN_URL" });
  });

  it("menolak literal IP privat tanpa perlu DNS", async () => {
    await expect(validateTargetUrl("http://169.254.169.254/latest/meta-data/")).rejects.toMatchObject({ code: "BLOCKED_IP" });
    await expect(validateTargetUrl("http://10.0.0.5/")).rejects.toMatchObject({ code: "BLOCKED_IP" });
  });

  it("URL rusak ditolak", async () => {
    await expect(validateTargetUrl("bukan-url")).rejects.toMatchObject({ code: "INVALID_URL" });
  });
});

describe("resolveRedirectLocation", () => {
  const from = new URL("https://example.com/a/b");
  it("menyelesaikan path relatif", () => {
    expect(resolveRedirectLocation("/c", from)).toBe("https://example.com/c");
    expect(resolveRedirectLocation("../d", from)).toBe("https://example.com/d");
  });
  it("location absolut dipertahankan (validasi IP dilakukan pemanggil berikutnya)", () => {
    expect(resolveRedirectLocation("https://other.com/x", from)).toBe("https://other.com/x");
  });
  it("location tidak valid → SsrfError", () => {
    expect(() => resolveRedirectLocation("http://[invalid", from)).toThrow(SsrfError);
  });
});
