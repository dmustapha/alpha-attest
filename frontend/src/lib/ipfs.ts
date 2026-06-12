// On-chain, a signal stores the raw 32-byte SHA-256 digest of its analysis
// document. The keeper pins via Pinata v3, which addresses content as CIDv1
// raw-codec (bafkrei…) — multibase base32 of [0x01 cidv1, 0x55 raw, 0x12 sha2-256,
// 0x20 len] + digest. Early keeper builds derived CIDv0 (Qm…) instead, so the
// fetch path tries the v1 form first (all live signals) and falls back to v0
// (legacy local-cache documents).

const B32 = "abcdefghijklmnopqrstuvwxyz234567";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

// CIDv1 raw-codec: 0x01 0x55 0x12 0x20 + digest → multibase base32 ('b' prefix)
export function bytes32ToCidV1(bytes32: `0x${string}`): string {
  const digest = hexToBytes(bytes32);
  const cid = new Uint8Array(36);
  cid.set([0x01, 0x55, 0x12, 0x20], 0); // cidv1, raw, sha2-256, 32 bytes
  cid.set(digest, 4);
  return "b" + base32Encode(cid);
}

// Legacy CIDv0 (Qm…): base58 of 0x12 0x20 + digest. Kept only for documents
// cached locally by early keeper builds.
export function bytes32ToCid(bytes32: `0x${string}`): string {
  const hashBytes = hexToBytes(bytes32);
  const multihash = new Uint8Array(34);
  multihash[0] = 0x12;
  multihash[1] = 0x20;
  multihash.set(hashBytes, 2);
  return base58Encode(multihash);
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  let result = "";
  const base = 58n;
  while (num > 0n) {
    result = BASE58_ALPHABET[Number(num % base)] + result;
    num = num / base;
  }
  for (const byte of bytes) {
    if (byte === 0) result = "1" + result;
    else break;
  }
  return result;
}

export function getIPFSUrl(cid: string): string {
  return `https://ipfs.io/ipfs/${cid}`;
}

export interface AnalysisFetchResult {
  raw: string; // exact bytes as served — hash THIS, never a re-stringify
  cid: string; // the CID form that resolved
  url: string; // the URL that served it
}

// Fetch the analysis document by its on-chain digest. Tries the CIDv1 form
// first (local cache → ipfs.io → Pinata gateway), then the legacy CIDv0 form
// over the same sources.
export async function fetchAnalysisRaw(bytes32: `0x${string}`): Promise<AnalysisFetchResult> {
  const candidates = [bytes32ToCidV1(bytes32), bytes32ToCid(bytes32)];
  for (const cid of candidates) {
    const urls = [
      `/ipfs-cache/${cid}.json`,
      `https://ipfs.io/ipfs/${cid}`,
      `https://gateway.pinata.cloud/ipfs/${cid}`,
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) return { raw: await r.text(), cid, url };
      } catch {
        // next source
      }
    }
  }
  throw new Error("Analysis document unreachable under any CID form");
}

export async function fetchAnalysis(bytes32: `0x${string}`): Promise<object> {
  const { raw } = await fetchAnalysisRaw(bytes32);
  return JSON.parse(raw);
}

// Recompute the document's SHA-256 in the user's own browser and compare it to
// the on-chain digest. Pinata raw-codec CIDs are the SHA-256 of the exact
// bytes, so this round-trips — verification, not assertion.
export async function verifyAnalysisHash(
  raw: string,
  onChainHash: `0x${string}`
): Promise<{ computed: `0x${string}`; matches: boolean }> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const computed = ("0x" +
    [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
  return { computed, matches: computed === onChainHash.toLowerCase() };
}
