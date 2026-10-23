/**
 * NativeWalletContext — singleton provider so all consumers share one
 * useNativeWallet instance instead of each spawning their own network calls.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useNativeWallet, type UseNativeWalletReturn } from "@/hooks/useNativeWallet";
export type { UseNativeWalletReturn };

const NativeWalletContext = createContext<UseNativeWalletReturn | null>(null);

export function NativeWalletProvider({ children }: { children: ReactNode }) {
  const wallet = useNativeWallet({ autoSync: true });
  return (
    <NativeWalletContext.Provider value={wallet}>
      {children}
    </NativeWalletContext.Provider>
  );
}

/** Use this everywhere instead of useNativeWallet() directly. */
export function useSharedWallet(): UseNativeWalletReturn {
  const ctx = useContext(NativeWalletContext);
  if (!ctx) throw new Error("useSharedWallet must be used inside NativeWalletProvider");
  return ctx;
}
