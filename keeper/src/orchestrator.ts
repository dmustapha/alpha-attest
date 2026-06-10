import { FinnhubClient, type TradeData } from "./clients/finnhub.js";
import { AnthropicClient } from "./clients/anthropic.js";
import { PinataClient } from "./clients/pinata.js";
import { StorachaClient } from "./clients/storacha.js";
import { ChainClient } from "./clients/chain.js";
import { EIP712Signer, type SignalPayload } from "./signer/eip712.js";

// >1% price change triggers analysis and signal commitment
const CHANGE_THRESHOLD = 0.01;

// Blocks to wait before resolving a signal (~50 blocks ≈ 10 minutes on Robinhood Chain)
const RESOLVE_DELAY_BLOCKS = 50n;

interface PriceState {
  price: number;
  timestamp: number;
}

interface PendingResolve {
  signalId: bigint;
  ticker: string;
  commitBlock: bigint;
}

export class SignalOrchestrator {
  private readonly finnhub: FinnhubClient;
  private readonly anthropic: AnthropicClient;
  private readonly pinata: PinataClient;
  private readonly storacha: StorachaClient;
  private readonly chain: ChainClient;
  private readonly signer: EIP712Signer;

  // Baseline price per symbol
  private readonly lastPrices = new Map<string, PriceState>();
  // Prevent concurrent processing for the same symbol
  private readonly processing = new Set<string>();
  // Signals committed but not yet resolved
  private readonly pendingResolves: PendingResolve[] = [];

  constructor(config: {
    finnhubKey: string;
    anthropicKey: string;
    pinataJwt: string;
    keeperPrivateKey: `0x${string}`;
    registryAddress: `0x${string}`;
  }) {
    this.finnhub = new FinnhubClient(config.finnhubKey, ["TSLA", "AMZN"]);
    this.anthropic = new AnthropicClient(config.anthropicKey);
    this.pinata = new PinataClient(config.pinataJwt);
    this.storacha = new StorachaClient();
    this.chain = new ChainClient(config.keeperPrivateKey, config.registryAddress);
    this.signer = new EIP712Signer(config.keeperPrivateKey, config.registryAddress);
  }

  start(): void {
    console.log("[AlphaAttest] Keeper starting...");

    this.finnhub.on("trade", (trade: TradeData) => {
      // Intentionally fire-and-forget — errors logged inside handleTrade
      this.handleTrade(trade).catch(() => undefined);
    });

    this.finnhub.connect();
    console.log("[AlphaAttest] Monitoring TSLA and AMZN for >1% price movements");

    // Check every 2 minutes if any pending signals have passed the resolve delay
    setInterval(() => this.resolveReady().catch(console.error), 120_000);
    console.log("[AlphaAttest] Auto-resolver active (every 2 min, after 50 blocks)");
  }

  private async handleTrade(trade: TradeData): Promise<void> {
    const symbol = trade.symbol;

    // Skip if already processing this symbol (no concurrent signals per ticker)
    if (this.processing.has(symbol)) return;

    const last = this.lastPrices.get(symbol);
    if (!last) {
      this.lastPrices.set(symbol, { price: trade.price, timestamp: trade.timestamp });
      return;
    }

    const changeAbs = Math.abs(trade.price - last.price);
    const changePct = changeAbs / last.price;
    if (changePct < CHANGE_THRESHOLD) return;

    const priceChangePct = ((trade.price - last.price) / last.price) * 100;
    this.processing.add(symbol);

    try {
      console.log(`[${symbol}] ${priceChangePct > 0 ? "+" : ""}${priceChangePct.toFixed(2)}% — generating signal`);

      // Step 1: Claude analysis (minimum 400 words, 6 dimensions)
      const analysis = await this.anthropic.generateAnalysis(
        symbol,
        trade.price,
        priceChangePct,
        trade.timestamp
      );
      console.log(`[${symbol}] Analysis: ${analysis.wordCount} words, ${analysis.direction}`);

      // Step 2: Build IPFS document
      const ipfsDoc = {
        version: "1.0",
        ticker: symbol,
        price: trade.price,
        priceChangePct,
        timestamp: trade.timestamp,
        timestampISO: new Date(trade.timestamp).toISOString(),
        direction: analysis.direction,
        analysis: analysis.analysis,
        wordCount: analysis.wordCount,
        dimensions: analysis.dimensions,
        generatedAt: new Date().toISOString(),
      };

      // Step 3: IPFS upload — Pinata primary, Storacha fallback
      let ipfsResult;
      try {
        ipfsResult = await this.pinata.upload(
          ipfsDoc,
          `${symbol}-${trade.timestamp}.json`
        );
        console.log(`[${symbol}] IPFS (Pinata): ${ipfsResult.cid}`);
      } catch (err) {
        console.warn(`[${symbol}] Pinata failed, trying Storacha:`, err);
        ipfsResult = await this.storacha.upload(
          ipfsDoc,
          `${symbol}-${trade.timestamp}.json`
        );
        console.log(`[${symbol}] IPFS (Storacha): ${ipfsResult.cid}`);
      }

      // Step 4: Get next sequence number from chain
      const lastSeq = await this.chain.getLastSequenceNumber();
      const sequenceNumber = lastSeq + 1n;

      // Step 5: Convert price to fixed-point (8 decimal places)
      // $200.50 → 20050000000n
      const priceFixed = BigInt(Math.round(trade.price * 1e8));

      // Convert timestamp: Finnhub gives ms, store seconds
      const timestampSecs = BigInt(Math.floor(trade.timestamp / 1000));

      const directionNum =
        analysis.direction === "BULLISH" ? 0
        : analysis.direction === "BEARISH" ? 1
        : 2;

      const payload: SignalPayload = {
        ticker: symbol,
        price: priceFixed,
        timestamp: timestampSecs,
        ipfsHash: ipfsResult.ipfsHash,
        direction: directionNum,
        sequenceNumber,
      };

      // Step 6: EIP-712 sign
      const signature = await this.signer.sign(payload);
      console.log(`[${symbol}] EIP-712 signed`);

      // Step 7: Commit to SignalRegistry
      // CRITICAL: IPFS hash committed on-chain BEFORE any frontend refresh
      // This is the cryptographic proof of pre-publication reasoning
      const txHash = await this.chain.commitSignal(
        symbol,
        payload.price,
        payload.timestamp,
        payload.ipfsHash,
        directionNum,
        sequenceNumber,
        signature
      );

      console.log(`[${symbol}] On-chain: ${txHash}`);
      console.log(`[${symbol}] CID: ${ipfsResult.cid} | Hash: ${ipfsResult.ipfsHash}`);

      // Step 8: Queue for auto-resolution after RESOLVE_DELAY_BLOCKS
      const commitBlock = await this.chain.getBlockNumber();
      this.pendingResolves.push({ signalId: sequenceNumber, ticker: symbol, commitBlock });
      console.log(`[${symbol}] Queued for resolution after block ${commitBlock + RESOLVE_DELAY_BLOCKS}`);

      // Update baseline
      this.lastPrices.set(symbol, { price: trade.price, timestamp: trade.timestamp });

    } catch (err) {
      console.error(`[${symbol}] Signal processing error:`, err);
    } finally {
      this.processing.delete(symbol);
    }
  }

  private async resolveReady(): Promise<void> {
    if (this.pendingResolves.length === 0) return;

    let currentBlock: bigint;
    try {
      currentBlock = await this.chain.getBlockNumber();
    } catch {
      return; // RPC hiccup — try again next interval
    }

    for (let i = this.pendingResolves.length - 1; i >= 0; i--) {
      const pending = this.pendingResolves[i];
      if (currentBlock - pending.commitBlock < RESOLVE_DELAY_BLOCKS) continue;

      try {
        const actualPrice = await this.finnhub.getQuote(pending.ticker);
        const priceFixed = BigInt(Math.round(actualPrice * 1e8));
        await this.chain.resolveSignal(pending.signalId, priceFixed);
        console.log(`[Resolver] Signal #${pending.signalId} (${pending.ticker}) resolved at $${actualPrice}`);
        this.pendingResolves.splice(i, 1);
      } catch (err) {
        console.error(`[Resolver] Failed to resolve signal #${pending.signalId}:`, err);
        // Leave in queue — will retry next interval
      }
    }
  }
}
