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

// <!-- [CRITIQUE E-4] useSignals upgraded: SSE from Alchemy Notify as primary, 30s polling as fallback -->
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

    let pollingInterval: ReturnType<typeof setInterval> | null = null;

    const es = new EventSource("/api/notify");

    es.onmessage = () => {
      fetchAll();
    };

    es.onerror = () => {
      es.close();
      // Only start polling once — guard against repeated onerror calls
      if (!pollingInterval) {
        pollingInterval = setInterval(fetchAll, refreshInterval);
      }
    };

    // Cleanup: close SSE and clear any polling interval
    return () => {
      es.close();
      if (pollingInterval) clearInterval(pollingInterval);
    };
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
