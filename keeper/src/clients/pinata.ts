import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface IPFSResult {
  cid: string;
  ipfsHash: `0x${string}`; // bytes32 for on-chain storage
  url: string;
  provider: "pinata" | "storacha";
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

    const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.jwt}`,
      },
      body: JSON.stringify({
        pinataContent: content,
        pinataMetadata: { name: filename },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Pinata upload failed (${response.status}): ${err}`);
    }

    const data = (await response.json()) as { IpfsHash: string };
    const cid = data.IpfsHash;
    const ipfsHash = cidToBytes32(cid);

    // Cache locally so precache.ts can copy to frontend/public/ipfs-cache/
    writeFileSync(join(this.cacheDir, `${cid}.json`), json, "utf8");
    console.log(`[IPFS] Pinned via Pinata: ${cid}`);

    return {
      cid,
      ipfsHash,
      url: `https://gateway.pinata.cloud/ipfs/${cid}`,
      provider: "pinata",
    };
  }
}
