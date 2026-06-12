"use client";

// [E-2] SampleSignals — judge preview: 3 pre-cached signals, full analysis, no wallet required
// Uses NEXT_PUBLIC_SAMPLE_SIGNAL_IDS to load signal IDs, reads from on-chain + IPFS cache.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createPublicClient, http } from "viem";
import { SIGNAL_REGISTRY_ABI, CONTRACT_ADDRESSES } from "../lib/contracts";
import { fetchAnalysis } from "../lib/ipfs";

// First three signals on the v1.1 registry — committed autonomously by the
// live keeper. A code constant (not env) so a stale deploy value can never
// point judges at missing signals.
const SAMPLE_SIGNAL_IDS = [1, 2, 3];

const robinhoodTestnet = {
  id: 46630,
  name: "Robinhood Chain Testnet",
  network: "robinhood-testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com"] },
    public: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
} as const;

const DIR_COLOR: Record<string, string> = {
  BULLISH: "var(--ok)",
  BEARISH: "var(--danger)",
  NEUTRAL: "var(--warn)",
};

interface SampleSignalData {
  id: number;
  ticker: string;
  direction: string;
  price: string;
  timestamp: string;
  analysisPreview: string;
  wordCount?: number;
}

export default function SampleSignals() {
  const [samples, setSamples] = useState<SampleSignalData[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setLoading(true);
    const client = createPublicClient({
      chain: robinhoodTestnet,
      transport: http(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL),
    });

    Promise.all(
      SAMPLE_SIGNAL_IDS.map(async (id) => {
        try {
          const s = await client.readContract({
            address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
            abi: SIGNAL_REGISTRY_ABI,
            functionName: "getSignal",
            args: [BigInt(id)],
          }) as {
            ticker: string; price: bigint; timestamp: bigint;
            ipfsHash: `0x${string}`; direction: number;
          };
          if (!s.ticker) return null; // beyond signalCount — empty struct

          const doc = await fetchAnalysis(s.ipfsHash) as Record<string, unknown>;
          const analysis = String(doc.analysis ?? "");
          const wordCount = typeof doc.wordCount === "number" ? doc.wordCount : undefined;
          // Extract a clean 2-sentence preview (no markdown)
          const cleaned = analysis.replace(/#+\s*/g, "").replace(/\*\*/g, "").trim();
          const sentences = cleaned.split(/(?<=[.!?])\s+/);
          const preview = sentences.slice(0, 2).join(" ").slice(0, 240);

          const dirs = ["BULLISH", "BEARISH", "NEUTRAL"];
          return {
            id,
            ticker: s.ticker,
            direction: dirs[s.direction] ?? "NEUTRAL",
            price: `$${(Number(s.price) / 1e8).toFixed(2)}`,
            timestamp: new Date(Number(s.timestamp) * 1000).toLocaleString("en-US", {
              month: "short", day: "numeric", year: "numeric",
            }),
            analysisPreview: preview,
            wordCount,
          } as SampleSignalData;
        } catch {
          return null;
        }
      })
    ).then(results => {
      setSamples(results.filter(Boolean) as SampleSignalData[]);
      setLoading(false);
    });
  }, [attempt]);

  if (loading) {
    return (
      <div className="aa-sample-signals">
        <div className="aa-section-label">Sample Signals — No Wallet Required</div>
        <div className="aa-loading" style={{ fontSize: 12, padding: "16px 0" }}>
          Loading sample signals<span className="aa-cursor" />
        </div>
      </div>
    );
  }

  // Honest failure state: the section promised content, so it never silently
  // vanishes — every signal stays independently verifiable even when IPFS is slow.
  if (samples.length === 0) {
    return (
      <div className="aa-sample-signals">
        <div className="aa-section-label">Sample Signals — No Wallet Required</div>
        <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 10, fontFamily: "var(--font-mono)" }}>
          Sample analyses are loading slowly from IPFS — every signal in the feed below remains
          independently verifiable on-chain.
        </p>
        <button className="aa-btn aa-btn-ghost aa-btn-sm" onClick={() => setAttempt(a => a + 1)}>
          Retry loading samples
        </button>
      </div>
    );
  }

  return (
    <div className="aa-sample-signals">
      <div className="aa-section-label">Sample Signals — No Wallet Required</div>
      <p style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16, fontFamily: "var(--font-mono)" }}>
        These are real AI analyses locked on-chain. Subscribe to access the full 400+ word analysis on every new signal.
      </p>
      <div className="aa-sample-list">
        {samples.map((s) => (
          <div key={s.id} className="aa-sample-card">
            <div className="aa-sample-header">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="aa-signal-ticker">{s.ticker}</span>
                <span className="aa-signal-dir" data-dir={s.direction} style={{ color: DIR_COLOR[s.direction] }}>
                  {s.direction}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-4)" }}>
                {s.price} · {s.timestamp}
              </div>
            </div>
            <div className="aa-sample-preview">
              {s.analysisPreview}
              {s.wordCount && (
                <span style={{ color: "var(--text-4)", fontFamily: "var(--font-mono)", fontSize: 10, marginLeft: 6 }}>
                  [{s.wordCount} words total]
                </span>
              )}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <Link href={`/verify/${s.id}`} className="aa-btn aa-btn-ghost aa-btn-sm">
                Verify on-chain →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
