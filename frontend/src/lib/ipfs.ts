// Convert bytes32 (on-chain) → CIDv0 string (Qm...)
export function bytes32ToCid(bytes32: `0x${string}`): string {
  const hex = bytes32.slice(2); // remove "0x"
  const hashBytes = Buffer.from(hex, "hex");
  // Prepend 0x1220 — SHA-256 multihash prefix
  const multihash = new Uint8Array(34);
  multihash[0] = 0x12;
  multihash[1] = 0x20;
  multihash.set(hashBytes, 2);
  return base58Encode(multihash);
}

// Minimal base58 encoder (Bitcoin alphabet)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let num = BigInt("0x" + Buffer.from(bytes).toString("hex"));
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
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

export async function fetchAnalysis(cid: string): Promise<object> {
  // Try local cache first (works in dev and on Vercel)
  try {
    const local = await fetch(`/ipfs-cache/${cid}.json`);
    if (local.ok) return local.json();
  } catch {
    // fall through to public gateway
  }
  const url = getIPFSUrl(cid);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`IPFS fetch failed: ${response.status}`);
  return response.json();
}
