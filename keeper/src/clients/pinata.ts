import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export interface IPFSResult {
  cid: string;
  ipfsHash: `0x${string}`; // bytes32 for on-chain storage
  url: string;
  provider: "pinata" | "storacha";
}

// Handles both CIDv0 (Qm..., base58) and CIDv1 (b..., base32)
// Extracts the raw 32-byte SHA-256 digest for on-chain storage
export function cidToBytes32(cid: string): `0x${string}` {
  if (cid.startsWith("Qm")) {
    // CIDv0: base58-encoded multihash [0x12, 0x20, ...32 bytes...]
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

  if (cid.startsWith("b") || cid.startsWith("B")) {
    // CIDv1: base32 multibase (strip 'b' prefix, then base32-decode)
    const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
    const input = cid.slice(1).toLowerCase();
    let bits = 0;
    let value = 0;
    const result: number[] = [];
    for (const char of input) {
      const idx = alphabet.indexOf(char);
      if (idx === -1) continue; // ignore padding
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        result.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    const bytes = Buffer.from(result);
    // Find SHA-256 multihash prefix (0x12 = sha2-256, 0x20 = 32 bytes)
    const markerIdx = bytes.findIndex(
      (_, i) => bytes[i] === 0x12 && bytes[i + 1] === 0x20
    );
    if (markerIdx === -1) throw new Error(`No SHA-256 multihash in CIDv1: ${cid}`);
    const hash = bytes.slice(markerIdx + 2, markerIdx + 34);
    return `0x${hash.toString("hex")}` as `0x${string}`;
  }

  throw new Error(`Unsupported CID format: ${cid}`);
}

// Decode a Pinata scoped JWT to extract the underlying key/secret pair.
// Pinata issues scoped JWTs that embed the raw key and secret in the payload.
// The legacy v2 API accepts these as pinata_api_key / pinata_secret_api_key
// headers, bypassing scope restrictions on the JWT bearer path.
function extractPinataKeypair(jwt: string): { key: string; secret: string } | null {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")
    ) as { scopedKeyKey?: string; scopedKeySecret?: string };
    if (payload.scopedKeyKey && payload.scopedKeySecret) {
      return { key: payload.scopedKeyKey, secret: payload.scopedKeySecret };
    }
    return null;
  } catch {
    return null;
  }
}

export class PinataClient {
  private readonly jwt: string;
  private readonly keypair: { key: string; secret: string } | null;
  private readonly cacheDir: string;

  constructor(jwt: string) {
    this.jwt = jwt;
    this.keypair = extractPinataKeypair(jwt);
    this.cacheDir = join(process.cwd(), ".ipfs-cache");
    mkdirSync(this.cacheDir, { recursive: true });
  }

  async upload(content: object, filename: string): Promise<IPFSResult> {
    const json = JSON.stringify(content, null, 2);

    // Attempt 1: Pinata v3 Files API (different scope than v2)
    try {
      const formData = new FormData();
      formData.append("file", new Blob([json], { type: "application/json" }), filename);
      formData.append("name", filename);
      formData.append("network", "public");

      const v3res = await fetch("https://uploads.pinata.cloud/v3/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.jwt}` },
        body: formData,
        signal: AbortSignal.timeout(15_000),
      });

      if (v3res.ok) {
        const v3data = (await v3res.json()) as { data: { cid: string } };
        const cid = v3data.data.cid;
        const ipfsHash = cidToBytes32(cid);
        writeFileSync(join(this.cacheDir, `${cid}.json`), json, "utf8");
        console.log(`[IPFS] Pinned via Pinata v3: ${cid}`);
        return { cid, ipfsHash, url: `https://gateway.pinata.cloud/ipfs/${cid}`, provider: "pinata" };
      }
      const v3err = await v3res.text();
      console.warn(`[IPFS] Pinata v3 failed (${v3res.status}): ${v3err}`);
    } catch (err) {
      console.warn("[IPFS] Pinata v3 error:", err);
    }

    // Attempt 2: v2 with raw key/secret headers (bypasses scoped JWT scope restrictions)
    if (this.keypair) {
      try {
        const ksRes = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            pinata_api_key: this.keypair.key,
            pinata_secret_api_key: this.keypair.secret,
          },
          body: JSON.stringify({
            pinataContent: content,
            pinataMetadata: { name: filename },
          }),
          signal: AbortSignal.timeout(15_000),
        });

        if (ksRes.ok) {
          const ksData = (await ksRes.json()) as { IpfsHash: string };
          const cid = ksData.IpfsHash;
          const ipfsHash = cidToBytes32(cid);
          writeFileSync(join(this.cacheDir, `${cid}.json`), json, "utf8");
          console.log(`[IPFS] Pinned via Pinata v2 (key/secret): ${cid}`);
          return { cid, ipfsHash, url: `https://gateway.pinata.cloud/ipfs/${cid}`, provider: "pinata" };
        }
        const ksErr = await ksRes.text();
        console.warn(`[IPFS] Pinata v2 key/secret failed (${ksRes.status}): ${ksErr}`);
      } catch (err) {
        console.warn("[IPFS] Pinata v2 key/secret error:", err);
      }
    }

    // Attempt 3: v2 Bearer JWT (original approach — may fail on scope issues)
    const v2res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.jwt}`,
      },
      body: JSON.stringify({
        pinataContent: content,
        pinataMetadata: { name: filename },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!v2res.ok) {
      const err = await v2res.text();
      throw new Error(
        `Pinata upload failed. All three methods exhausted.\n` +
        `To fix: go to app.pinata.cloud → API Keys → create a new key with ` +
        `"pinFileToIPFS" scope enabled, then update PINATA_JWT in .env.\n` +
        `Last error (${v2res.status}): ${err}`
      );
    }

    const v2data = (await v2res.json()) as { IpfsHash: string };
    const cid = v2data.IpfsHash;
    const ipfsHash = cidToBytes32(cid);
    writeFileSync(join(this.cacheDir, `${cid}.json`), json, "utf8");
    console.log(`[IPFS] Pinned via Pinata v2: ${cid}`);
    return { cid, ipfsHash, url: `https://gateway.pinata.cloud/ipfs/${cid}`, provider: "pinata" };
  }
}
