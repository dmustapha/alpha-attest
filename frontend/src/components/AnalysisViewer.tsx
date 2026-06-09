"use client";

import { useState } from "react";
import { fetchAnalysis } from "../lib/ipfs";

interface SignalAnalysisDoc {
  ticker: string;
  price: number;
  direction: string;
  analysis: string;
  dimensions: {
    priceTrend: string;
    volume: string;
    sectorContext: string;
    confidence: string;
    investmentThesis: string;
    riskFactors: string;
  };
}

interface Props {
  cid: string;
}

export default function AnalysisViewer({ cid }: Props) {
  const [doc, setDoc] = useState<SignalAnalysisDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function load() {
    if (doc) { setExpanded(!expanded); return; }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAnalysis(cid) as SignalAnalysisDoc;
      setDoc(result);
      setExpanded(true);
    } catch {
      setError("Failed to load analysis from IPFS.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={load}
        disabled={loading}
        style={{
          padding: "4px 10px",
          background: "transparent",
          color: "#60a5fa",
          border: "1px solid #1e3a5f",
          borderRadius: 4,
          fontSize: 12,
          cursor: loading ? "not-allowed" : "pointer",
        }}>
        {loading ? "Loading..." : expanded ? "Hide Analysis" : "View Analysis"}
      </button>

      {error && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#f87171" }}>{error}</div>
      )}

      {expanded && doc && (
        <div style={{
          marginTop: 12,
          padding: "12px 16px",
          background: "#0d1117",
          border: "1px solid #1f2937",
          borderRadius: 6,
          fontSize: 12,
          color: "#d1d5db",
          maxHeight: 400,
          overflowY: "auto",
          lineHeight: 1.6,
        }}>
          <p style={{ marginTop: 0, whiteSpace: "pre-wrap" }}>{doc.analysis}</p>
        </div>
      )}
    </div>
  );
}
