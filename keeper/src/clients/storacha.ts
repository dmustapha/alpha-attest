// WARNING: UNVERIFIED PATTERN — test immediately before relying on this fallback
// Prerequisites: run `npx @storacha/cli create` once to generate space DID and proof
// The principal and proof are stored in ~/.config/storacha/ by default

import type { IPFSResult } from "./pinata.js";
import { cidToBytes32 } from "./pinata.js";

export class StorachaClient {
  async upload(content: object, filename: string): Promise<IPFSResult> {
    // CAUTION: ASSUMED PATTERN — dynamic import to avoid startup errors if not installed
    const { create } = await import("@storacha/client");
    const { StoreMemory } = await import("@storacha/client/stores/memory");

    // Note: StoreMemory does NOT persist between process restarts.
    // For production use, replace with a persistent store.
    const client = await create({ store: new StoreMemory() });

    const json = JSON.stringify(content, null, 2);
    const file = new File([json], filename, { type: "application/json" });

    const cid = await client.uploadFile(file);
    const cidStr = cid.toString();

    return {
      cid: cidStr,
      ipfsHash: cidToBytes32(cidStr),
      url: `https://w3s.link/ipfs/${cidStr}`,
      provider: "storacha",
    };
  }
}
