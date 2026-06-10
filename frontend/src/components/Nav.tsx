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
        <svg className="aa-nav-logo-glyph" viewBox="0 0 40 46" fill="none" aria-hidden="true">
          <path
            d="M20 2 L37 9 L37 28 Q37 39 20 44 Q3 39 3 28 L3 9 Z"
            fill="currentColor" fillOpacity="0.10"
            stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"
          />
          <polyline
            points="7,27 11,27 14,18 17,36 20,27 23,27 26,22 29,27 33,27"
            fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"
          />
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
