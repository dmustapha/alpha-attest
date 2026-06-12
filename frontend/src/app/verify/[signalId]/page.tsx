"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Nav from "../../../components/Nav";
import { usePublicClient } from "wagmi";
import { SIGNAL_REGISTRY_ABI, CONTRACT_ADDRESSES } from "../../../lib/contracts";
import { fetchAnalysisRaw, verifyAnalysisHash, getIPFSUrl } from "../../../lib/ipfs";
import type { OnChainSignal } from "../../../hooks/useSignals";

type VerifyStatus = "loading" | "verified" | "mismatch" | "error";

const DIR_COLOR = { BULLISH: "var(--ok)", BEARISH: "var(--danger)", NEUTRAL: "var(--warn)" } as const;

function shortHash(h: string): string {
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export default function VerifySignal() {
  const params = useParams();
  const signalId = params.signalId as string;
  const publicClient = usePublicClient();

  const [signal, setSignal] = useState<OnChainSignal | null>(null);
  const [ipfsDoc, setIpfsDoc] = useState<Record<string, unknown> | null>(null);
  const [cid, setCid] = useState<string>("");
  const [computedHash, setComputedHash] = useState<string>("");
  const [status, setStatus] = useState<VerifyStatus>("loading");

  useEffect(() => {
    if (!publicClient || !signalId) return;
    (async () => {
      try {
        const s = (await publicClient.readContract({
          address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
          abi: SIGNAL_REGISTRY_ABI,
          functionName: "getSignal",
          args: [BigInt(signalId)],
        })) as OnChainSignal;
        setSignal(s);

        // Fetch the exact bytes, then recompute SHA-256 locally and compare it
        // to the on-chain digest. "Verified" is earned, never asserted.
        const { raw, cid: resolvedCid } = await fetchAnalysisRaw(s.ipfsHash);
        setCid(resolvedCid);
        const { computed, matches } = await verifyAnalysisHash(raw, s.ipfsHash);
        setComputedHash(computed);
        setIpfsDoc(JSON.parse(raw) as Record<string, unknown>);
        setStatus(matches ? "verified" : "mismatch");
      } catch {
        setStatus("error");
      }
    })();
  }, [publicClient, signalId]);

  const dirLabel = (["BULLISH", "BEARISH", "NEUTRAL"][signal?.direction ?? 2]) as keyof typeof DIR_COLOR;
  const statusLabel = ["PENDING", "CORRECT", "INCORRECT"][signal?.status ?? 0];
  const priceFormatted = signal ? `$${(Number(signal.price) / 1e8).toFixed(2)}` : "—";

  return (
    <>
      <Nav />
      <main className="aa-page" style={{ maxWidth: 860 }}>
        <Link href="/" className="aa-back">← Signal Feed</Link>

        <div className="aa-hero">
          <h1>Signal #{signalId}</h1>
          <p>Independent verification that this analysis has not changed since it was published</p>
        </div>

        {status === "loading" && (
          <div className="aa-loading">
            <div>Verifying on-chain record<span className="aa-cursor" /></div>
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-4)" }}>
              Fetching the live document and recomputing its fingerprint in your browser. This takes a few seconds.
            </div>
          </div>
        )}

        {status === "mismatch" && signal && (
          <div className="aa-verify-status" data-ok="false">
            <div className="aa-verify-badge" data-ok="false">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 16 }}>✗</span>
              Mismatch — the live document does NOT match the on-chain fingerprint
            </div>
            <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              Your browser recomputed the document&apos;s fingerprint as {shortHash(computedHash)},
              but the chain recorded {shortHash(signal.ipfsHash)} at publish time. The document
              served right now is not the one that was locked in. This is exactly the tampering
              this system exists to expose.
            </p>
          </div>
        )}

        {status === "verified" && signal && (
          <div className="aa-verify-status" data-ok="true">
            <div className="aa-verify-badge" data-ok="true">
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 16 }}>✓</span>
              Verified — This analysis is unchanged
            </div>
            <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              Hash recomputed in your browser just now: {shortHash(computedHash)} — equal to the
              on-chain record. If this analysis had been edited after publishing, even by one
              character, the fingerprints would differ. What you&apos;re reading is exactly what
              was locked in — no edits, no retroactive changes.
            </p>
          </div>
        )}

        {(status === "verified" || status === "mismatch") && signal && (
          <>
            {/* Data grid */}
            <div className="aa-data-grid">
              <div className="aa-data-cell">
                <div className="aa-data-key">Blockchain Fingerprint</div>
                <div className="aa-data-val mono">{signal.ipfsHash}</div>
              </div>
              <div className="aa-data-cell">
                <div className="aa-data-key">Recomputed In Your Browser</div>
                <div
                  className="aa-data-val mono"
                  style={{ color: status === "verified" ? "var(--ok)" : "var(--danger)" }}
                >
                  {computedHash}
                </div>
              </div>
              <div className="aa-data-cell">
                <div className="aa-data-key">Content Address (IPFS)</div>
                <div className="aa-data-val mono">{cid}</div>
              </div>
              <div className="aa-data-cell">
                <div className="aa-data-key">Signal Call</div>
                <div className="aa-data-val">
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{signal.ticker}</span>
                  {" — "}
                  <span style={{ fontFamily: "var(--font-mono)", color: DIR_COLOR[dirLabel] ?? "var(--warn)" }}>
                    {dirLabel}
                  </span>
                </div>
              </div>
              <div className="aa-data-cell">
                <div className="aa-data-key">Outcome</div>
                <div
                  className="aa-data-val"
                  style={{
                    fontFamily: "var(--font-mono)",
                    color:
                      statusLabel === "CORRECT"
                        ? "var(--ok)"
                        : statusLabel === "INCORRECT"
                        ? "var(--danger)"
                        : "var(--text-3)",
                  }}
                >
                  {statusLabel}
                </div>
              </div>
              <div className="aa-data-cell">
                <div className="aa-data-key">Entry Price</div>
                <div className="aa-data-val" style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}>
                  {priceFormatted}
                </div>
              </div>
              <div className="aa-data-cell">
                <div className="aa-data-key">Signal ID</div>
                <div className="aa-data-val" style={{ fontFamily: "var(--font-mono)" }}>
                  #{signalId}
                  {signal.sequenceNumber.toString() !== signalId && (
                    <span style={{ color: "var(--text-4)", fontSize: 11, marginLeft: 8 }}>
                      sequence #{signal.sequenceNumber.toString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <a
                href={getIPFSUrl(cid)}
                target="_blank"
                rel="noreferrer"
                className="aa-btn aa-btn-ghost aa-btn-sm"
              >
                View raw document →
              </a>
              <a
                href={`https://explorer.testnet.chain.robinhood.com/block/${signal.blockNumber.toString()}`}
                target="_blank"
                rel="noreferrer"
                className="aa-btn aa-btn-ghost aa-btn-sm"
              >
                On-Chain Record →
              </a>
            </div>

            {ipfsDoc && (
              <div className="aa-analysis-box">
                {!!ipfsDoc.ticker && (
                  <div style={{ marginBottom: 12, display: "flex", gap: 16, alignItems: "center" }}>
                    <span className="aa-signal-ticker">{String(ipfsDoc.ticker)}</span>
                    {typeof ipfsDoc.direction === "string" && (
                      <span className="aa-signal-dir" data-dir={ipfsDoc.direction}>
                        {ipfsDoc.direction}
                      </span>
                    )}
                  </div>
                )}
                <div className="aa-data-key" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span>AI Analysis</span>
                  {signal && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-4)" }}>
                      Published {new Date(Number(signal.timestamp) * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                </div>
                {(() => {
                  const text = String(ipfsDoc.analysis ?? "");
                  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
                  return paragraphs.length > 1 ? (
                    <div className="aa-analysis-text">
                      {paragraphs.map((p, i) => <p key={i} style={{ marginBottom: "1em" }}>{String(p)}</p>)}
                    </div>
                  ) : (
                    <div className="aa-analysis-text">{text}</div>
                  );
                })()}
              </div>
            )}
          </>
        )}

        {status === "error" && (
          <div className="aa-verify-status" data-ok="false">
            <div className="aa-verify-badge" data-ok="false">
              Could not load the IPFS document right now
            </div>
            <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              The on-chain record exists — only the IPFS fetch failed. Try again in a few seconds. The blockchain record is permanent regardless.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
