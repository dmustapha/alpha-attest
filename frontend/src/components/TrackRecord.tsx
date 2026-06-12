"use client";

// [E1] Track Record strip — the product IS the permanent report card, so it
// renders as the largest element under the hero. Built entirely from data
// useSignals already fetched: zero additional RPC.

import Link from "next/link";
import type { OnChainSignal } from "../hooks/useSignals";

interface Props {
  signals: OnChainSignal[]; // newest first, as returned by useSignals
  loading: boolean;
}

const OUTCOME = {
  0: { glyph: "○", label: "pending" },
  1: { glyph: "✓", label: "correct" },
  2: { glyph: "✗", label: "incorrect" },
} as const;

export default function TrackRecord({ signals, loading }: Props) {
  const chronological = [...signals].reverse();
  const resolved = signals.filter((s) => s.status !== 0);
  const correct = resolved.filter((s) => s.status === 1);
  const accuracyPct = resolved.length > 0
    ? Math.round((correct.length * 100) / resolved.length)
    : null;

  return (
    <div className="aa-track">
      <div className="aa-track-main">
        <div>
          <div className="aa-stat-label">Track Record</div>
          {accuracyPct !== null ? (
            <div className="aa-track-accuracy">
              {accuracyPct}%
              <span className="aa-track-denominator">
                {correct.length} of {resolved.length} calls correct · every call on record
              </span>
            </div>
          ) : (
            <div className="aa-track-accuracy" style={{ color: "var(--text-3)" }}>
              {loading ? "—" : signals.length > 0 ? "Resolving" : "0 calls"}
              <span className="aa-track-denominator">
                {signals.length > 0
                  ? `${signals.length} signal${signals.length === 1 ? "" : "s"} published · outcomes confirm ~12 min after each call`
                  : "the ledger starts with the first autonomous signal"}
              </span>
            </div>
          )}
        </div>
        <div>
          <div className="aa-stat-label">Signals Published</div>
          <div className="aa-track-count">{loading ? "—" : signals.length}</div>
        </div>
      </div>

      {chronological.length > 0 && (
        <div className="aa-track-chips" aria-label="Signal outcomes in chronological order">
          {chronological.map((s) => {
            const o = OUTCOME[(s.status as 0 | 1 | 2) ?? 0];
            return (
              <Link
                key={s.id.toString()}
                href={`/verify/${s.id.toString()}`}
                className="aa-track-chip"
                data-outcome={o.label}
                title={`#${s.id} ${s.ticker} — ${o.label}`}
              >
                {o.glyph}
              </Link>
            );
          })}
        </div>
      )}

      <div className="aa-track-tagline">
        Misses are preserved forever — that&apos;s the point.
      </div>
    </div>
  );
}
