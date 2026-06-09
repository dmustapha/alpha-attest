import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getRobinhoodTestnet } from "../clients/chain.js";

export interface SignalPayload {
  ticker: string;
  price: bigint;        // 8 decimal fixed-point
  timestamp: bigint;    // Unix seconds
  ipfsHash: `0x${string}`;
  direction: number;    // 0=BULLISH, 1=BEARISH, 2=NEUTRAL
  sequenceNumber: bigint;
}

// EIP-712 types — MUST match SignalRegistry.sol SIGNAL_TYPEHASH exactly
const SIGNAL_TYPES = {
  Signal: [
    { name: "ticker", type: "string" },
    { name: "price", type: "uint256" },
    { name: "timestamp", type: "uint256" },
    { name: "ipfsHash", type: "bytes32" },
    { name: "direction", type: "uint8" },
    { name: "sequenceNumber", type: "uint256" },
  ],
} as const;

export class EIP712Signer {
  private readonly walletClient;
  private readonly verifyingContract: `0x${string}`;

  constructor(privateKey: `0x${string}`, verifyingContract: `0x${string}`) {
    const account = privateKeyToAccount(privateKey);
    this.verifyingContract = verifyingContract;

    this.walletClient = createWalletClient({
      account,
      chain: getRobinhoodTestnet(),
      transport: http(),
    });
  }

  async sign(payload: SignalPayload): Promise<`0x${string}`> {
    // Domain separator MUST match SignalRegistry constructor: EIP712("AlphaAttest", "1")
    return await this.walletClient.signTypedData({
      domain: {
        name: "AlphaAttest",
        version: "1",
        chainId: 46630,
        verifyingContract: this.verifyingContract,
      },
      types: SIGNAL_TYPES,
      primaryType: "Signal",
      message: {
        ticker: payload.ticker,
        price: payload.price,
        timestamp: payload.timestamp,
        ipfsHash: payload.ipfsHash,
        direction: payload.direction,
        sequenceNumber: payload.sequenceNumber,
      },
    });
  }
}
