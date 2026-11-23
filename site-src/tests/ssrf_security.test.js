import { describe, it, expect } from "vitest";

// Replicate the exact SSRF functions from supabase/functions/admin-extract-listing/index.ts
function isPrivateIpv4(a, b, c, d) {
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function parseIpv4(ip) {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  const nums = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    if (p.length > 1 && p.startsWith("0")) return null;
    const n = Number(p);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return nums;
}

function parseIpv6(ip) {
  let s = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
  const zoneIdx = s.indexOf("%");
  if (zoneIdx !== -1) s = s.slice(0, zoneIdx);

  const lastColon = s.lastIndexOf(":");
  if (lastColon === -1) return null;
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    const h1 = (((v4[0] << 8) | v4[1]) & 0xffff).toString(16);
    const h2 = (((v4[2] << 8) | v4[3]) & 0xffff).toString(16);
    s = s.slice(0, lastColon) + `:${h1}:${h2}`;
  }

  const parts = s.split("::");
  if (parts.length > 2) return null;

  let left = [];
  if (parts[0]) {
    for (const h of parts[0].split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
      left.push(parseInt(h, 16));
    }
  }

  let right = [];
  if (parts.length === 2 && parts[1]) {
    for (const h of parts[1].split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
      right.push(parseInt(h, 16));
    }
  }

  if (parts.length === 1) {
    if (left.length !== 8) return null;
    return left;
  }

  const needed = 8 - (left.length + right.length);
  if (needed < 0) return null;
  return [...left, ...Array(needed).fill(0), ...right];
}

function isPrivateIpv6(w) {
  if (w.every((x) => x === 0)) return true; // ::
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true; // ::1
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 (ULA)
  if ((w[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 (Link-Local)
  if ((w[0] & 0xff00) === 0xff00) return true; // ff00::/8 (Multicast)
  if (w[0] === 0x0100 && w[1] === 0 && w[2] === 0 && w[3] === 0) return true; // 100::/64 (Discard)
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // 2001:db8::/32 (Doc)
  if (w[0] === 0x2001 && (w[1] & 0xfff0) === 0x0010) return true; // 2001:10::/28 (ORCHID)
  if (w[0] === 0x2001 && (w[1] & 0xfff0) === 0x0020) return true; // 2001:20::/28 (ORCHIDv2)

  // IPv4-mapped IPv6 (::ffff:0:0/96)
  if (w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0xffff) {
    return true; // Disallow all IPv4-mapped IPv6
  }

  // IPv4-compatible IPv6 (deprecated ::/96)
  if (w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0) {
    return true;
  }

  // NAT64 well-known prefix (64:ff9b::/96)
  if (w[0] === 0x0064 && w[1] === 0xff9b && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0) {
    const a = w[6] >> 8, b = w[6] & 0xff, c = w[7] >> 8, d = w[7] & 0xff;
    if (isPrivateIpv4(a, b, c, d)) return true;
    return true; // Disallow NAT64 prefix completely from public imports
  }

  // NAT64 local prefix (64:ff9b:1::/48)
  if (w[0] === 0x0064 && w[1] === 0xff9b && w[2] === 0x0001) {
    return true;
  }

  // 6to4 (2002::/16)
  if (w[0] === 0x2002) {
    const a = w[1] >> 8, b = w[1] & 0xff, c = w[2] >> 8, d = w[2] & 0xff;
    if (isPrivateIpv4(a, b, c, d)) return true;
    return true;
  }

  return false;
}

function isPrivateIp(ip) {
  const clean = ip.trim().replace(/^\[|\]$/g, "");
  const v4 = parseIpv4(clean);
  if (v4) return isPrivateIpv4(v4[0], v4[1], v4[2], v4[3]);
  const v6 = parseIpv6(clean);
  if (v6) return isPrivateIpv6(v6);
  return true; // Invalid format is rejected
}

describe("SSRF Protection Tests", () => {
  it("blocks private IPv4 addresses", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("10.255.255.255")).toBe(true);
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("192.168.100.254")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("100.127.255.255")).toBe(true);
    expect(isPrivateIp("0.0.0.0")).toBe(true);
    expect(isPrivateIp("224.0.0.1")).toBe(true);
    expect(isPrivateIp("240.0.0.1")).toBe(true);
    expect(isPrivateIp("255.255.255.255")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("93.184.216.34")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    expect(isPrivateIp("100.128.0.1")).toBe(false);
  });

  it("blocks private and internal IPv6 addresses", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("::")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fd12:3456:789a::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("ff02::1")).toBe(true);
    expect(isPrivateIp("100::1")).toBe(true);
    expect(isPrivateIp("2001:db8::1")).toBe(true);
  });

  it("blocks IPv4-mapped and compatible IPv6", () => {
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(true);
    expect(isPrivateIp("0:0:0:0:0:ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::127.0.0.1")).toBe(true);
  });

  it("blocks NAT64 well-known and local prefixes", () => {
    expect(isPrivateIp("64:ff9b::127.0.0.1")).toBe(true);
    expect(isPrivateIp("64:ff9b::7f00:1")).toBe(true);
    expect(isPrivateIp("64:ff9b::169.254.169.254")).toBe(true);
    expect(isPrivateIp("64:ff9b::a9fe:a9fe")).toBe(true);
    expect(isPrivateIp("64:ff9b::192.168.1.1")).toBe(true);
    expect(isPrivateIp("64:ff9b:1::1")).toBe(true);
  });

  it("blocks 6to4 encapsulation", () => {
    expect(isPrivateIp("2002:7f00:0001::")).toBe(true);
    expect(isPrivateIp("2002:a9fe:a9fe::")).toBe(true);
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
    expect(isPrivateIp("2a00:1450:4009:81f::200e")).toBe(false);
  });

  it("blocks malformed or non-canonical IP strings", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("127.0.0.1.extra")).toBe(true);
    expect(isPrivateIp("127.0.0.01")).toBe(true); // Leading zero blocked
    expect(isPrivateIp("999.999.999.999")).toBe(true);
  });
});
