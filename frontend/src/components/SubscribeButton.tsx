"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useSubscription } from "../hooks/useSubscription";

export default function SubscribeButton() {
  const { address } = useAccount();
  const { isSubscriber, checkSubscription, subscribe, cancelSubscription, pending, error } = useSubscription();

  useEffect(() => {
    if (address) checkSubscription();
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isSubscriber === null) {
    return (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>
        Checking…
      </span>
    );
  }

  if (isSubscriber) {
    return (
      <div className="aa-subscribed">
        <div className="aa-subscribed-badge">
          <span className="aa-subscribed-dot" />
          Subscribed
        </div>
        <button onClick={cancelSubscription} disabled={pending} className="aa-btn aa-btn-danger aa-btn-sm">
          {pending ? "Cancelling…" : "Cancel"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button onClick={subscribe} disabled={pending} className="aa-btn aa-btn-primary">
        {pending ? "Processing…" : "Subscribe · 10 USDG / month"}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: "var(--danger)", fontFamily: "var(--font-mono)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
