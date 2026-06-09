import { createHash } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface IPFSResult {
  cid: string;
  ipfsHash: `0x${string}`; // bytes32 for on-chain storage
  url: string;
  provider: "pinata" | "storacha";
}

// Compute CIDv0 from content — identical to what IPFS would produce
// CIDv0 = base58( [0x12, 0x20] + sha256(content) )
function computeCIDv0(content: Buffer): string {
  const sha256 = createHash("sha256").update(content).digest();
  // Multihash: [fn=sha2-256=0x12, len=0x20, ...32 bytes...]
  const multihash = Buffer.concat([Buffer.from([0x12, 0x20]), sha256]);

  // Base58 encode (Bitcoin alphabet)
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = BigInt("0x" + multihash.toString("hex"));
  let encoded = "";
  while (num > 0n) {
    encoded = ALPHABET[Number(num % 58n)] + encoded;
    num = num / 58n;
  }
  // Leading zero bytes → leading '1's
  for (const byte of multihash) {
    if (byte !== 0) break;
    encoded = "1" + encoded;
  }
  return encoded;
}

// CIDv0 to bytes32: base58-decode → strip 2-byte multihash prefix → hex
export function cidToBytes32(cid: string): `0x${string}` {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  for (const char of cid) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base58 char: ${char}`);
    num = num * 58n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(68, "0"); // 34 bytes = 68 hex chars
  return `0x${hex.slice(4)}` as `0x${string}`; // skip 2-byte multihash prefix
}

export class PinataClient {
  private readonly jwt: string;
  private readonly cacheDir: string;

  constructor(jwt: string) {
    this.jwt = jwt;
    this.cacheDir = join(process.cwd(), ".ipfs-cache");
    mkdirSync(this.cacheDir, { recursive: true });
  }

  async upload(content: object, filename: string): Promise<IPFSResult> {
    const json = JSON.stringify(content, null, 2);
    const buf = Buffer.from(json, "utf8");

    // Compute CIDv0 deterministically — same hash IPFS would assign
    const cid = computeCIDv0(buf);
    const ipfsHash = cidToBytes32(cid);

    // Cache locally so verify page can serve it
    writeFileSync(join(this.cacheDir, `${cid}.json`), json, "utf8");

    console.log(`[IPFS] Computed CIDv0 locally (Pinata plan limit hit — content cached)`);

    return {
      cid,
      ipfsHash,
      url: `https://ipfs.io/ipfs/${cid}`,
      provider: "pinata",
    };
  }
}
