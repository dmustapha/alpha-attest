import Link from "next/link";
import Nav from "../../components/Nav";
import { CONTRACT_ADDRESSES } from "../../lib/contracts";

const PROOF_DATA = {
  signalRegistry: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
  subscriptionManager: CONTRACT_ADDRESSES.SUBSCRIPTION_MANAGER,
  mockConsumer: CONTRACT_ADDRESSES.MOCK_CONSUMER,
  usdg: CONTRACT_ADDRESSES.USDG,
};

const EXPLORER_BASE = "https://explorer.testnet.chain.robinhood.com/address";

const CONTRACTS = [
  { name: "SignalRegistry", addr: PROOF_DATA.signalRegistry, role: "Core — stores every signal on-chain and verifies the cryptographic signature proving who published it" },
  { name: "SubscriptionManager", addr: PROOF_DATA.subscriptionManager, role: "USDG-gated access control" },
  { name: "Signal Consumer", addr: PROOF_DATA.mockConsumer, role: "Receives new signals automatically and reads Robinhood Chain equity prices on each publish" },
  { name: "USDG Token", addr: PROOF_DATA.usdg, role: "Robinhood Chain native stablecoin" },
];

const STEPS = [
  "A live price feed watches TSLA and AMZN continuously. When a price move of 1% or more is detected, the process starts automatically.",
  "AI generates a detailed 400+ word analysis — what moved, why it likely moved, and which direction it signals. This takes seconds.",
  "The analysis is uploaded to IPFS — a permanent, distributed storage network where every document's address is derived from its exact content. Change one character and the address changes completely.",
  "That fingerprint is signed with a cryptographic key and submitted to the Robinhood Chain blockchain. This happens before any subscriber sees the analysis.",
  "The blockchain confirms the signature and records the fingerprint permanently. The timestamp is now on-chain and cannot be altered.",
  "The record is immutable. The analysis you read has the exact same fingerprint as the one locked on-chain — if even a single character changed, the fingerprint would be completely different.",
  "You can verify this yourself: click Verify on any signal to see the on-chain fingerprint matched against the live IPFS document.",
];

const INTEGRATION_DEPTH = [
  ["Cryptographic Signing", "Every signal is signed with a private key. The blockchain verifies the signature before accepting the record."],
  ["Consumer Interface", "Other apps and smart contracts can plug in to receive new signals automatically whenever one is published."],
  ["Stablecoin Access", "Subscriptions are paid in USDG (≈ $1 each, the native stablecoin of Robinhood Chain). Your wallet acts as your subscription key — no account or password required."],
  ["Equity Market Data", "TSLA and AMZN equity token prices are read from Robinhood Chain on every signal."],
  ["IPFS Provenance", "Every analysis document is pinned to IPFS before publication. The document fingerprint is what's stored on-chain."],
  ["Live Updates", "Signal events stream to the frontend in real time. Falls back to 30-second polling if streaming is unavailable."],
];

export default function ProofPage() {
  return (
    <>
      <Nav />
      <main className="aa-page" style={{ maxWidth: 860 }}>
        <Link href="/" className="aa-back">← Signal Feed</Link>

        <div className="aa-hero">
          <h1>How AlphaAttest Works</h1>
          <p>Any AI signal service can claim accuracy. We lock every analysis to the blockchain before publication — making it impossible to quietly edit old calls after the fact.</p>
        </div>

        {/* Verification Process — leads */}
        <div className="aa-section">
          <h2>The Verification Process</h2>
          <ol className="aa-steps">
            {STEPS.map((step, i) => (
              <li key={i} className="aa-step">
                {i === 5 ? <strong style={{ color: "var(--text)" }}>{step}</strong> : step}
              </li>
            ))}
          </ol>
        </div>

        {/* Technical Architecture */}
        <div className="aa-section">
          <h2>Technical Architecture</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            {INTEGRATION_DEPTH.map(([label, desc]) => (
              <div key={label} className="aa-data-cell">
                <div className="aa-data-key">{label}</div>
                <div style={{ fontSize: 12, color: "var(--text-2)" }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* On-Chain Records — at bottom */}
        <div className="aa-section">
          <h2>On-Chain Records</h2>
          <table className="aa-table">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Address</th>
                <th>Role</th>
                <th>Explorer</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((row) => (
                <tr key={row.name}>
                  <td style={{ color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                    {row.name}
                  </td>
                  <td className="mono">{row.addr.slice(0, 10)}…{row.addr.slice(-8)}</td>
                  <td style={{ color: "var(--text-3)", fontSize: 12 }}>{row.role}</td>
                  <td>
                    {row.addr.startsWith("0x") ? (
                      <a
                        href={`${EXPLORER_BASE}/${row.addr}`}
                        target="_blank"
                        rel="noreferrer"
                        className="aa-btn aa-btn-ghost aa-btn-sm"
                        style={{ color: "var(--brand)", borderColor: "var(--brand-glow)" }}
                      >
                        View →
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-4)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 20 }}>
          <Link href="/" className="aa-btn aa-btn-primary">Back to Signals →</Link>
        </div>
      </main>
    </>
  );
}
