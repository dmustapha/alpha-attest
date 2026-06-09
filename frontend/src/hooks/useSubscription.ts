"use client";

import { useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  SUBSCRIPTION_MANAGER_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
} from "../lib/contracts";

export function useSubscription() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [isSubscriber, setIsSubscriber] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSubscription = async () => {
    if (!publicClient || !address) return;
    const result = (await publicClient.readContract({
      address: CONTRACT_ADDRESSES.SUBSCRIPTION_MANAGER,
      abi: SUBSCRIPTION_MANAGER_ABI,
      functionName: "isSubscriber",
      args: [address],
    })) as boolean;
    setIsSubscriber(result);
    return result;
  };

  const subscribe = async () => {
    if (!walletClient || !address || !publicClient) return;
    setPending(true);
    setError(null);
    try {
      // Fetch actual USDG decimals before computing fee
      const decimals = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.USDG,
        abi: [{
          type: "function", name: "decimals", stateMutability: "view",
          inputs: [], outputs: [{ name: "", type: "uint8" }]
        }],
        functionName: "decimals",
      }) as number;
      const fee = 10n * 10n ** BigInt(decimals);

      const approveTx = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.USDG,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACT_ADDRESSES.SUBSCRIPTION_MANAGER, fee],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });

      const subscribeTx = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.SUBSCRIPTION_MANAGER,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: "subscribe",
      });
      await publicClient.waitForTransactionReceipt({ hash: subscribeTx });
      await checkSubscription();
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 80) : "Transaction failed. Check your USDG balance.");
    } finally {
      setPending(false);
    }
  };

  const cancelSubscription = async () => {
    if (!walletClient || !publicClient) return;
    setPending(true);
    setError(null);
    try {
      const tx = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.SUBSCRIPTION_MANAGER,
        abi: SUBSCRIPTION_MANAGER_ABI,
        functionName: "cancelSubscription",
      });
      await publicClient.waitForTransactionReceipt({ hash: tx });
      await checkSubscription();
    } catch (err) {
      setError(err instanceof Error ? err.message.slice(0, 80) : "Transaction failed.");
    } finally {
      setPending(false);
    }
  };

  return { isSubscriber, checkSubscription, subscribe, cancelSubscription, pending, error };
}
