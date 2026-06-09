"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

export default function Nav() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <nav className="aa-nav">
      <Link href="/" className="aa-nav-logo" style={{ textDecoration: "none" }}>
        <svg className="aa-nav-logo-glyph" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 2L18 10L10 18L2 10L10 2Z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M10 5L15 10L10 15L5 10L10 5Z"
            fill="currentColor"
            opacity="0.3"
          />
          <circle cx="10" cy="10" r="1.5" fill="currentColor" />
        </svg>
        AlphaAttest
      </Link>

      <div className="aa-nav-links">
        <Link
          href="/"
          className={`aa-nav-link${pathname === "/" ? " active" : ""}`}
        >
          Signals
        </Link>
        <Link
          href="/proof"
          className={`aa-nav-link${pathname === "/proof" ? " active" : ""}`}
        >
          How It Works
        </Link>
      </div>

      <div className="aa-nav-right">
        {isConnected ? (
          <>
            <span className="aa-address">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </span>
            <button
              onClick={() => disconnect()}
              className="aa-btn aa-btn-ghost aa-btn-sm"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={() => connect({ connector: injected() })}
            className="aa-btn aa-btn-primary aa-btn-sm"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
}
