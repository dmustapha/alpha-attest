"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { OnChainSignal } from "../hooks/useSignals";
import { bytes32ToCidV1, getIPFSUrl, fetchAnalysis } from "../lib/ipfs";

interface Props {
  signal: OnChainSignal;
  isSubscriber: boolean;
}

const DIR_LABEL = { 0: "BULLISH", 1: "BEARISH", 2: "NEUTRAL" } as const;
const DIR_GLOSS = {
  BULLISH: "upward move expected",
  BEARISH: "downward move expected",
  NEUTRAL: "no strong move expected",
} as const;
const STATUS_LABEL = { 0: "PENDING", 1: "CORRECT", 2: "INCORRECT" } as const;

export default function SignalCard({ signal, isSubscriber }: Props) {
  const [analysisPreview, setAnalysisPreview] = useState<string | null>(null);
  const cid = bytes32ToCidV1(signal.ipfsHash);
  const price = `$${(Number(signal.price) / 1e8).toFixed(2)}`;
  const time = new Date(Number(signal.timestamp) * 1000).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const dir = signal.direction as 0 | 1 | 2;
  const statusNum = signal.status as 0 | 1 | 2;
  const dirLabel = DIR_LABEL[dir];

  useEffect(() => {
    if (!isSubscriber) return;
    fetchAnalysis(signal.ipfsHash)
      .then(doc => {
        const text = String((doc as Record<string, unknown>).analysis ?? "");
        setAnalysisPreview(text.slice(0, 160).trim() || "");
      })
      .catch(() => setAnalysisPreview(""));
  }, [signal.ipfsHash, isSubscriber]);

  return (
    <div className="aa-signal" data-direction={dirLabel}>
      {/* Row 1: core data */}
      <div className="aa-signal-identity">
        <span className="aa-signal-ticker">{signal.ticker}</span>
        <span className="aa-signal-dir" data-dir={dirLabel}>{dirLabel}</span>
        <span className="aa-dir-gloss">{DIR_GLOSS[dirLabel]}</span>
      </div>

      <div className="aa-signal-price-block">
        <div className="aa-signal-price">{price}</div>
        <div className="aa-signal-time">{time}</div>
      </div>

      <div
        className="aa-signal-status"
        data-status={STATUS_LABEL[statusNum]}
        title={statusNum === 0 ? "Outcome confirmed against market price ~12 minutes after publication (50 blocks)" : undefined}
      >
        {STATUS_LABEL[statusNum]}
        {statusNum === 0 && (
          <span style={{ display: "block", fontSize: 9, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginTop: 2, letterSpacing: "0.04em" }}>awaiting outcome</span>
        )}
      </div>

      <div className="aa-signal-actions">
        <Link
          href={`/verify/${signal.id.toString()}`}
          className="aa-btn aa-btn-ghost aa-btn-sm"
          style={{ color: "var(--brand)", borderColor: "var(--brand-glow)" }}
        >
          Verify →
        </Link>
      </div>

      {/* Row 2: analysis preview — full width */}
      <div className="aa-signal-analysis">
        {isSubscriber ? (
          analysisPreview === null ? (
            <span className="aa-signal-analysis-loading">Loading analysis…</span>
          ) : analysisPreview === "" ? (
            <a
              href={getIPFSUrl(cid)}
              target="_blank"
              rel="noreferrer"
              className="aa-signal-analysis-link"
            >
              Read full analysis →
            </a>
          ) : (
            <>
              <span className="aa-signal-analysis-text">{analysisPreview}…</span>
              <a
                href={getIPFSUrl(cid)}
                target="_blank"
                rel="noreferrer"
                className="aa-signal-analysis-link"
              >
                Read full analysis →
              </a>
            </>
          )
        ) : (
          <span className="aa-signal-analysis-gate">
            This signal includes a full breakdown: what moved, why, and the reasoning behind the call.{" "}
            <button
              style={{
                color: "var(--brand)",
                cursor: "pointer",
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
              }}
              onClick={() =>
                document.querySelector(".aa-subscribe-callout")?.scrollIntoView({ behavior: "smooth", block: "center" })
              }
            >
              Subscribe to read it →
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
