"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { SIGNAL_REGISTRY_ABI, CONTRACT_ADDRESSES } from "../lib/contracts";

export interface OnChainSignal {
  id: bigint;
  ticker: string;
  price: bigint;
  timestamp: bigint;
  ipfsHash: `0x${string}`;
  direction: number;
  sequenceNumber: bigint;
  keeperSignature: `0x${string}`;
  blockNumber: bigint;
  status: number; // 0=PENDING, 1=CORRECT, 2=INCORRECT
  resolvedPrice: bigint;
}

export function useSignals(refreshInterval = 30000) {
  const publicClient = usePublicClient();
  const [signals, setSignals] = useState<OnChainSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = async () => {
    if (!publicClient) return;
    try {
      const count = (await publicClient.readContract({
        address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
        abi: SIGNAL_REGISTRY_ABI,
        functionName: "signalCount",
      })) as bigint;

      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));
      const fetched = (await Promise.all(
        ids.map(id =>
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
            abi: SIGNAL_REGISTRY_ABI,
            functionName: "getSignal",
            args: [id],
          })
        )
      )) as OnChainSignal[];
      setSignals([...fetched].reverse()); // newest first
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    if (!publicClient) return;

    // Subscribe to SignalCommitted events directly via Alchemy WebSocket.
    // Avoids the serverless isolation issue with SSE on Vercel — no in-memory
    // subscriber set, no cross-instance message loss.
    const unwatch = publicClient.watchContractEvent({
      address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
      abi: SIGNAL_REGISTRY_ABI,
      eventName: "SignalCommitted",
      onLogs: () => { fetchAll(); },
    });

    return unwatch;
  }, [publicClient]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling fallback: only active when publicClient unavailable (pre-connect)
  useEffect(() => {
    if (publicClient) return;
    const interval = setInterval(fetchAll, refreshInterval);
    return () => clearInterval(interval);
  }, [publicClient]); // eslint-disable-line react-hooks/exhaustive-deps

  return { signals, loading, error };
}

export function useAccuracyScore() {
  const publicClient = usePublicClient();
  const [score, setScore] = useState<{ correct: bigint; total: bigint } | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    publicClient.readContract({
      address: CONTRACT_ADDRESSES.SIGNAL_REGISTRY,
      abi: SIGNAL_REGISTRY_ABI,
      functionName: "getAccuracyScore",
    }).then((result) => {
      const [correct, total] = result as [bigint, bigint];
      setScore({ correct, total });
    }).catch(() => {
      // Accuracy score unavailable — non-critical, UI handles null gracefully
    });
  }, [publicClient]);

  return score;
}
