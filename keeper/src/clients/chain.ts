import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// NOTE: Chain definition is deferred inside ChainClient constructor (not top-level) so that
// dotenv.config() in index.ts runs before ALCHEMY_API_KEY is read. In ESM, top-level module
// expressions evaluate before the importing module's body runs — reading env vars here would
// produce "undefined". The CHAIN_ID constant is safe to export since it's a literal.
export const ROBINHOOD_CHAIN_ID = 46630;

// Exported for use in eip712.ts — safe because env is loaded before any constructor runs
export function getRobinhoodTestnet() {
  return defineChain({
    id: ROBINHOOD_CHAIN_ID,
    name: "Robinhood Chain Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: {
        http: [`https://robinhood-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`],
        webSocket: [`wss://robinhood-testnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`],
      },
    },
  });
}

const REGISTRY_ABI = parseAbi([
  "function commitSignal(string ticker, uint256 price, uint256 timestamp, bytes32 ipfsHash, uint8 direction, uint256 sequenceNumber, bytes keeperSignature) returns (uint256)",
  "function resolveSignal(uint256 signalId, uint256 actualPrice)",
  "function lastSequenceNumber() view returns (uint256)",
  "function signalCount() view returns (uint256)",
  "function getSignal(uint256 signalId) view returns ((uint256 id, string ticker, uint256 price, uint256 timestamp, bytes32 ipfsHash, uint8 direction, uint256 sequenceNumber, bytes keeperSignature, uint256 blockNumber, uint8 status, uint256 resolvedPrice))",
]);

export interface OnChainSignal {
  id: bigint;
  ticker: string;
  price: bigint;
  timestamp: bigint;
  ipfsHash: `0x${string}`;
  direction: number;
  sequenceNumber: bigint;
  keeperSignature: `0x${string}`;
  blockNumber: bigint;
  status: number; // 0=PENDING, 1=CORRECT, 2=INCORRECT
  resolvedPrice: bigint;
}

export class ChainClient {
  private readonly walletClient;
  private readonly publicClient;
  private readonly registryAddress: `0x${string}`;

  constructor(privateKey: `0x${string}`, registryAddress: `0x${string}`) {
    const account = privateKeyToAccount(privateKey);
    this.registryAddress = registryAddress;

    const chain = getRobinhoodTestnet();

    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    this.publicClient = createPublicClient({
      chain,
      transport: http(),
    });
  }

  async commitSignal(
    ticker: string,
    price: bigint,
    timestamp: bigint,
    ipfsHash: `0x${string}`,
    direction: number,
    sequenceNumber: bigint,
    signature: `0x${string}`
  ): Promise<`0x${string}`> {
    const txHash = await this.walletClient.writeContract({
      address: this.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "commitSignal",
      args: [ticker, price, timestamp, ipfsHash, direction, sequenceNumber, signature],
    });

    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[Chain] Signal committed: ${txHash}`);
    return txHash;
  }

  async resolveSignal(signalId: bigint, actualPrice: bigint): Promise<`0x${string}`> {
    const txHash = await this.walletClient.writeContract({
      address: this.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "resolveSignal",
      args: [signalId, actualPrice],
    });
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`[Chain] Signal #${signalId} resolved: ${txHash}`);
    return txHash;
  }

  async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  async getLastSequenceNumber(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "lastSequenceNumber",
    })) as bigint;
  }

  async getSignalCount(): Promise<bigint> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "signalCount",
    })) as bigint;
  }

  async getSignal(signalId: bigint): Promise<OnChainSignal> {
    return (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "getSignal",
      args: [signalId],
    })) as OnChainSignal;
  }
}
