"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../components/Nav";
import { useAccount, useConnect, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { useSignals, useAccuracyScore } from "../hooks/useSignals";
import { useSubscription } from "../hooks/useSubscription";
import SignalCard from "../components/SignalCard";
import SampleSignals from "../components/SampleSignals";
import SubscribeButton from "../components/SubscribeButton";

function OnboardingBlock() {
  const [open, setOpen] = useState(false);
  return (
    <div className="aa-onboarding">
      <button className="aa-onboarding-toggle" onClick={() => setOpen(o => !o)}>
        <span>New to crypto trading tools?</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{open ? "▲ Hide" : "▼ Show"}</span>
      </button>
      {open && (
        <div className="aa-onboarding-body">
          <div className="aa-onboarding-step">
            <span className="aa-onboarding-n">1.</span>
            <span>You can browse signals and verify their authenticity right now — no wallet needed.</span>
          </div>
          <div className="aa-onboarding-step">
            <span className="aa-onboarding-n">2.</span>
            <span>To read the full analysis, you need a crypto wallet. <strong style={{ color: "var(--text)" }}>MetaMask</strong> is free and takes 2 minutes to install.</span>
          </div>
          <div className="aa-onboarding-step">
            <span className="aa-onboarding-n">3.</span>
            <span>Switch MetaMask to <strong style={{ color: "var(--text)" }}>Robinhood Chain Testnet</strong> (the blockchain this app runs on).</span>
          </div>
          <div className="aa-onboarding-step">
            <span className="aa-onboarding-n">4.</span>
            <span>
              Subscribe for <strong style={{ color: "var(--text)" }}>10 USDG/month</strong> — USDG is a testnet stablecoin.{" "}
              <a
                href={`https://explorer.testnet.chain.robinhood.com/address/0x7E955252E15c84f5768B83c41a71F9eba181802F`}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--brand)" }}
              >
                Get test USDG →
              </a>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { isConnected } = useAccount();
  const { connect } = useConnect();
  const chainId = useChainId();
  const isWrongNetwork = isConnected && chainId !== 46630;
  const { signals, loading, error } = useSignals();
  const accuracyScore = useAccuracyScore();
  const { isSubscriber, checkSubscription } = useSubscription();

  useEffect(() => {
    if (isConnected) checkSubscription();
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  const accuracyPct =
    accuracyScore && Number(accuracyScore.total) > 0
      ? Math.round((Number(accuracyScore.correct) * 100) / Number(accuracyScore.total))
      : null;

  return (
    <>
      <Nav />
      <main className="aa-page">
        {/* Hero */}
        <div className="aa-hero">
          <div className="aa-hero-badge">
            <span className="aa-hero-badge-dot" />
            Live Signal Feed · TSLA · AMZN
          </div>
          <h1>AI Trading Signals.<br />Every Call on Record.</h1>
          <p className="aa-hero-sub">
            We publish AI analysis on TSLA and AMZN before the market moves. Every
            signal is locked in the moment it&apos;s generated — so our track record can
            never be quietly edited. What we called, we called.
          </p>
          <div className="aa-hero-actions">
            <a href="#feed" className="aa-btn aa-btn-primary">View Live Signals</a>
            <Link href="/proof" className="aa-btn aa-btn-ghost">How It Works →</Link>
          </div>
        </div>

        {/* Wrong network warning */}
        {isWrongNetwork && (
          <div className="aa-network-warning">
            Your wallet is on the wrong network. Switch to{" "}
            <strong>Robinhood Chain Testnet (ID 46630)</strong> to load signals and subscribe.
          </div>
        )}

        {/* Stats strip */}
        <div className="aa-stats" style={{ gridTemplateColumns: accuracyPct !== null ? "repeat(2,1fr)" : "1fr" }}>
          <div className="aa-stat">
            <span className="aa-stat-label">Signals Published</span>
            <span className="aa-stat-value">{loading ? "—" : signals.length}</span>
            <span className="aa-stat-sub">TSLA · AMZN</span>
          </div>
          {accuracyPct !== null && (
            <div className="aa-stat">
              <span className="aa-stat-label">Accuracy</span>
              <span className="aa-stat-value">{accuracyPct}%</span>
              <span className="aa-stat-sub">
                {accuracyScore!.correct.toString()}/{accuracyScore!.total.toString()} resolved
              </span>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="aa-how-section">
          <div className="aa-section-label">How It Works</div>
          <div className="aa-how-strip">
            <div className="aa-how-step">
              <span className="aa-how-num">01</span>
              <div>
                <div className="aa-how-title">AI watches the market</div>
                <div className="aa-how-desc">Price moves of 1% or more on TSLA or AMZN trigger an automatic analysis.</div>
              </div>
            </div>
            <div className="aa-how-step">
              <span className="aa-how-num">02</span>
              <div>
                <div className="aa-how-title">Call locked in permanently</div>
                <div className="aa-how-desc">The analysis is published to a permanent storage network and its fingerprint is recorded on-chain — before you read it.</div>
              </div>
            </div>
            <div className="aa-how-step">
              <span className="aa-how-num">03</span>
              <div>
                <div className="aa-how-title">You can verify any call</div>
                <div className="aa-how-desc">Click Verify on any signal to see the on-chain fingerprint matched against the live document. If it was edited, they won&apos;t match.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Insight strip */}
        <div className="aa-insight">
          Most AI signal services can quietly delete bad calls and only show their winners.
          Every signal here is locked in the moment it&apos;s generated — wins and losses both.{" "}
          <Link href="/proof" style={{ color: "var(--brand)" }}>
            See how we prove it →
          </Link>
        </div>

        {/* Sample signals — judge preview, no wallet required */}
        <SampleSignals />

        {/* Subscribe callout — not connected */}
        {!isConnected && (
          <div className="aa-subscribe-callout">
            <div>
              <div className="aa-subscribe-callout-title">Full Analysis Access</div>
              <div className="aa-subscribe-callout-sub">
                Each signal comes with a full breakdown: what moved, why it moved, and the reasoning behind the call.
                $10/month in USDG (≈ $1 each). Your wallet is your subscription key — no account or password needed.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                onClick={() => connect({ connector: injected() })}
                className="aa-btn aa-btn-primary"
              >
                Connect Wallet to Subscribe
              </button>
              <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
                Need a wallet? MetaMask is free and takes 2 minutes to set up.
              </span>
              <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
                Subscribing needs testnet USDG — get test funds at the{" "}
                <a href="https://faucet.testnet.chain.robinhood.com/" target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>
                  Robinhood Chain faucet
                </a>
                , or browse and verify every signal without subscribing.
              </span>
            </div>
          </div>
        )}

        {/* Subscribe callout — connected (all states handled by SubscribeButton) */}
        {isConnected && (
          <div className="aa-subscribe-callout">
            <div>
              <div className="aa-subscribe-callout-title">
                {isSubscriber ? "Your Subscription" : "Unlock Full Analysis"}
              </div>
              <div className="aa-subscribe-callout-sub">
                {isSubscriber
                  ? "You have full access to all signal analyses."
                  : "Read the complete 400+ word analysis behind every signal — what moved, the macro context, and the full reasoning. $10/month in USDG (≈ $1 each)."}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <SubscribeButton />
              {!isSubscriber && (
                <span style={{ fontSize: 11, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
                  Needs testnet USDG —{" "}
                  <a href="https://faucet.testnet.chain.robinhood.com/" target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>
                    Robinhood Chain faucet
                  </a>
                  . Browsing and verifying signals is free.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Onboarding — collapsible for first-time users */}
        <OnboardingBlock />

        {/* Feed header */}
        <div id="feed" className="aa-feed-header">
          <div className="aa-feed-title">
            <span className="aa-live-dot" />
            Live Signals
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-4)" }}>
            Live
          </span>
        </div>

        {/* Error state */}
        {error && (
          <div className="aa-error-state">
            Unable to load signals from the chain. Check your connection and refresh.
          </div>
        )}

        {/* Signal list */}
        {loading ? (
          <div className="aa-loading">
            Fetching signals from chain<span className="aa-cursor" />
          </div>
        ) : signals.length === 0 ? (
          <div className="aa-empty">
            Monitoring TSLA and AMZN for price moves of 1% or more.
            The next signal will appear here automatically.
            <span className="aa-cursor" />
          </div>
        ) : (
          <div className="aa-signal-list">
            {signals.map((signal) => (
              <SignalCard
                key={signal.id.toString()}
                signal={signal}
                isSubscriber={isSubscriber ?? false}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
