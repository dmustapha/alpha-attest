import type { IPFSResult } from "./pinata.js";

export class StorachaClient {
  async upload(_content: object, _filename: string): Promise<IPFSResult> {
    throw new Error(
      "[Storacha] Not configured. Run `npx @storacha/cli create` to provision a space DID and proof, " +
      "then replace this class with a persistent store implementation."
    );
  }
}
