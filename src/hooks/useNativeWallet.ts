/**
 * useNativeWallet — Frontend hook for the server-side self-custodial wallet.
 *
 * Responsibilities:
 *  - Get or create the user's wallet on first load (persists walletId in localStorage)
 *  - Retrieve addresses per network
 *  - Fetch live on-chain balances via the backend (never raw RPC from frontend)
 *  - Send transactions (calls backend /api/wallet/send — private key never leaves server)
 *  - Provide clear loading, error, and status states for the UI
 *
 * Security: private keys never leave the server. The frontend only ever holds
 * the opaque walletId and the derived public addresses.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useTxHistory } from "@/store/txHistoryStore";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NativeAddress {
  network:    string;
  address:    string;
  family:     "evm" | "bitcoin" | "solana" | "other";
  explorerUrl: string;
  receiveUri: string;   // e.g. "ethereum:0x…"
}

export interface NativeBalance {
  network:  string;
  symbol:   string;
  balance:  string;
  usdValue: number;
  source:   "rpc" | "simulated";
  error?:   string;
}

export type SendStatus = "idle" | "submitting" | "submitted" | "failed";

export interface SendResult {
  txHash:      string;
  explorerUrl: string;
  fee:         string;
  simulated:   boolean;
}

// ── User ID derivation ────────────────────────────────────────────────────────
// We derive a stable, anonymous user ID from a random UUID stored in localStorage.
// In a production app with authentication, use the authenticated user's ID instead.

function getOrCreateUserId(): string {
  const KEY = "rushpay-wallet-user-id";
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(KEY, id);
  return id;
}

// ── Network metadata (UI labels and URI schemes) ──────────────────────────────

const NETWORK_META: Record<string, { family: "evm" | "bitcoin" | "solana" | "other"; uriScheme: string; explorerBase: string }> = {
  Ethereum:       { family: "evm",     uriScheme: "ethereum",  explorerBase: "https://etherscan.io" },
  "Arc Testnet":  { family: "evm",     uriScheme: "ethereum",  explorerBase: "https://explorer.testnet.arc.io" },
  Arc:            { family: "evm",     uriScheme: "ethereum",  explorerBase: "https://explorer.arc.io" },
  Arbitrum:       { family: "evm",     uriScheme: "ethereum",  explorerBase: "https://arbiscan.io" },
  Optimism:       { family: "evm",     uriScheme: "ethereum",  explorerBase: "https://optimistic.etherscan.io" },
  Base:           { family: "evm",     uriScheme: "ethereum",  explorerBase: "https://basescan.org" },
  Polygon:        { family: "evm",     uriScheme: "ethereum",  explorerBase: "https://polygonscan.com" },
  BNB:            { family: "evm",     uriScheme: "ethereum",  explorerBase: "https://bscscan.com" },
  Avalanche:      { family: "evm",     uriScheme: "ethereum",  explorerBase: "https://snowtrace.io" },
  Solana:         { family: "solana",  uriScheme: "solana",    explorerBase: "https://solscan.io" },
  Bitcoin:        { family: "bitcoin", uriScheme: "bitcoin",   explorerBase: "https://blockstream.info" },
  Dogecoin:       { family: "bitcoin", uriScheme: "dogecoin",  explorerBase: "https://dogechain.info" },
  Litecoin:       { family: "bitcoin", uriScheme: "litecoin",  explorerBase: "https://ltc.bitaps.com" },
  TRON:           { family: "other",   uriScheme: "tron",      explorerBase: "https://tronscan.org" },
  XRP:            { family: "other",   uriScheme: "xrpl",      explorerBase: "https://xrpscan.com" },
};

function buildAddressInfo(network: string, address: string): NativeAddress {
  const meta = NETWORK_META[network] ?? { family: "evm", uriScheme: "ethereum", explorerBase: "https://etherscan.io" };
  return {
    network, address, family: meta.family,
    explorerUrl: `${meta.explorerBase}/address/${address}`,
    receiveUri:  `${meta.uriScheme}:${address}`,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseNativeWalletReturn {
  // Wallet creation
  walletId:       string | null;
  isNew:          boolean;
  loading:        boolean;
  error:          string | null;

  // Addresses
  addresses:      Record<string, string>;   // network → address
  getAddressInfo: (network: string) => NativeAddress | null;

  // Balances
  fetchBalance:   (network: string, symbol: string) => Promise<NativeBalance>;
  balanceCache:   Record<string, NativeBalance>;  // "NETWORK/SYMBOL" → result

  // Sending
  sendStatus:     SendStatus;
  sendError:      string | null;
  sendResult:     SendResult | null;
  sendCrypto:     (params: { network: string; symbol: string; to: string; amount: string }) => Promise<void>;
  resetSend:      () => void;

  // Store sync
  syncToStore:    (opts?: { includeSlow?: boolean }) => Promise<void>;
  syncing:        boolean;
}

// Module-level sync lock — prevents concurrent syncToStore calls from multiple
// hook instances (App.tsx, WalletPage, CryptoDashboard all hold one each).
let _syncInFlight: Promise<void> | null = null;

// Read localStorage once at module load time (server-safe: guarded by typeof window)
function readStoredWallet() {
  if (typeof window === "undefined") return { id: null, addrs: {} as Record<string, string> };
  const id    = localStorage.getItem("rushpay-wallet-id");
  const addrs = (() => {
    try { return JSON.parse(localStorage.getItem("rushpay-wallet-addrs") ?? "{}") as Record<string, string>; }
    catch { return {} as Record<string, string>; }
  })();
  return { id, addrs };
}

export function useNativeWallet(_opts?: { autoSync?: boolean }): UseNativeWalletReturn {
  const stored = useRef(readStoredWallet());

  const [walletId,  setWalletId]  = useState<string | null>(() => stored.current.id);
  const [isNew,     setIsNew]     = useState(false);
  const [loading,   setLoading]   = useState(() => !stored.current.id);
  const [error,     setError]     = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>(() => stored.current.addrs);

  const [balanceCache, setBalanceCache] = useState<Record<string, NativeBalance>>({});
  const [sendStatus,   setSendStatus]   = useState<SendStatus>("idle");
  const [sendError,    setSendError]    = useState<string | null>(null);
  const [sendResult,   setSendResult]   = useState<SendResult | null>(null);
  const [syncing,      setSyncing]      = useState(false);
  const initRef = useRef(false);

  const setAssetAddress    = useWalletStore(s => s.setAssetAddress);
  const updateAssetBalance = useWalletStore(s => s.updateAssetBalance);
  const storeAssets        = useWalletStore(s => s.assets);
  const addTx              = useTxHistory(s => s.addTx);
  const updateTx           = useTxHistory(s => s.updateTx);

  // ── Create wallet on first mount when localStorage has no existing walletId ──
  // Effect is async-only: all setState calls happen in .then / .catch callbacks,
  // never synchronously inside the effect body.
  useEffect(() => {
    if (stored.current.id || initRef.current) return;
    initRef.current = true;

    const userId = getOrCreateUserId();
    fetch("/api/wallet/get-or-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
      .then(r => r.json() as Promise<{ walletId: string; addresses: Record<string, string>; isNew: boolean }>)
      .then(data => {
        setWalletId(data.walletId);
        setIsNew(data.isNew);
        setAddresses(data.addresses);
        setLoading(false);
        localStorage.setItem("rushpay-wallet-id", data.walletId);
        localStorage.setItem("rushpay-wallet-addrs", JSON.stringify(data.addresses));
        // Push real addresses into walletStore — overwrites any stale placeholder
        const evmAddr = data.addresses["Ethereum"] ?? data.addresses["Arc Testnet"] ?? "";
        if (evmAddr) {
          ["USDC","USDT","ETH","BNB","ARB","ARC"].forEach(sym => setAssetAddress(sym, evmAddr));
        }
        if (data.addresses["Solana"])  setAssetAddress("SOL", data.addresses["Solana"]);
        if (data.addresses["Bitcoin"]) setAssetAddress("BTC", data.addresses["Bitcoin"]);
      })
      .catch((e: unknown) => {
        setError(String(e));
        setLoading(false);
      });
  // Empty dep array: intentionally run once. `stored.current` read in the effect is fine
  // because ref mutations don't trigger re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Address lookup ─────────────────────────────────────────────────────────
  const getAddressInfo = useCallback((network: string): NativeAddress | null => {
    const addr = addresses[network];
    if (!addr) return null;
    return buildAddressInfo(network, addr);
  }, [addresses]);

  // Ref mirror of balanceCache for use inside callbacks without dep churn
  const balanceCacheRef = useRef<Record<string, NativeBalance>>({});

  // ── Balance fetching — stale-while-revalidate (15s client TTL) ───────────────
  // Returns cached value immediately if fresh, fetches in background if stale.
  const balanceFetchTime = useRef<Record<string, number>>({});
  const CLIENT_BAL_TTL = 15_000;

  const fetchBalance = useCallback(async (network: string, symbol: string): Promise<NativeBalance> => {
    if (!walletId) return { network, symbol, balance: "0", usdValue: 0, source: "simulated", error: "Wallet not initialized" };

    const cacheKey = `${network}/${symbol}`;
    const lastFetch = balanceFetchTime.current[cacheKey] ?? 0;
    const isFresh = Date.now() - lastFetch < CLIENT_BAL_TTL;

    // Return cached immediately if fresh — no network call
    const cached = balanceCacheRef.current[cacheKey];
    if (cached && isFresh) return cached;

    try {
      balanceFetchTime.current[cacheKey] = Date.now();
      const r = await fetch(
        `/api/wallet/balance/${walletId}/${encodeURIComponent(network)}/${symbol}`,
        { signal: AbortSignal.timeout(7000) },
      );
      const data = await r.json() as NativeBalance;
      balanceCacheRef.current = { ...balanceCacheRef.current, [cacheKey]: data };
      setBalanceCache(prev => ({ ...prev, [cacheKey]: data }));
      return data;
    } catch (e) {
      const result: NativeBalance = { network, symbol, balance: "0", usdValue: 0, source: "simulated", error: String(e) };
      balanceCacheRef.current = { ...balanceCacheRef.current, [cacheKey]: result };
      setBalanceCache(prev => ({ ...prev, [cacheKey]: result }));
      return result;
    }
  }, [walletId]);

  // ── Send transaction ───────────────────────────────────────────────────────
  const sendCrypto = useCallback(async (params: { network: string; symbol: string; to: string; amount: string }) => {
    if (!walletId) { setSendError("Wallet not initialized"); return; }
    setSendStatus("submitting");
    setSendError(null);
    setSendResult(null);

    // Record pending tx immediately so it shows in history during broadcast
    const pendingTx = addTx({
      type: "send", status: "pending",
      symbol: params.symbol, network: params.network,
      amount: params.amount, toAddress: params.to,
    });

    try {
      const r = await fetch("/api/wallet/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId, ...params }),
      });
      const data = await r.json() as { txHash?: string; explorerUrl?: string; fee?: string; simulated?: boolean; error?: string; status?: string };
      if (!r.ok || data.error) throw new Error(data.error ?? "Send failed");
      if (data.status === "failed") throw new Error("Transaction could not be submitted — check balance and network");
      const result = { txHash: data.txHash ?? "", explorerUrl: data.explorerUrl ?? "", fee: data.fee ?? "", simulated: data.simulated ?? false };
      setSendResult(result);
      setSendStatus("submitted");
      // Update tx record with hash and confirmed status
      updateTx(pendingTx.id, { status: "confirmed", txHash: result.txHash, explorerUrl: result.explorerUrl, fee: result.fee });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
      setSendStatus("failed");
      updateTx(pendingTx.id, { status: "failed" });
    }
  }, [walletId, addTx, updateTx]);

  const resetSend = useCallback(() => {
    setSendStatus("idle");
    setSendError(null);
    setSendResult(null);
  }, []);

  // ── Sync on-chain balances into walletStore ────────────────────────────────
  // Runs all EVM balance fetches in parallel (no sequential 150ms gaps).
  // Skips Solana and Bitcoin in background auto-sync — their public RPCs
  // regularly take 5-30s and block the JS thread; users can refresh manually.
  const syncToStore = useCallback(async (opts?: { includeSlow?: boolean }) => {
    if (!walletId) return;
    // Module-level dedup: if any hook instance is already syncing, reuse that promise
    if (_syncInFlight) return _syncInFlight;
    setSyncing(true);
    _syncInFlight = (async () => { try {
      // Snapshot assets at call time — avoids stale closure issues
      const assets = useWalletStore.getState().assets;

      // Build a deduped list of (network, symbol) pairs from the store's assets
      const pairs: Array<{ network: string; symbol: string; storeSymbol: string }> = assets
        .filter(a => a.type === "crypto" || a.type === "stablecoin")
        .map(a => {
          const net = a.network === "Arc" ? "Arc Testnet"
                    : a.network === "BNB" ? "BNB"
                    : a.network ?? "Ethereum";
          return { network: net, symbol: a.symbol, storeSymbol: a.symbol };
        });

      // Deduplicate by network+symbol
      const seen = new Set<string>();
      const dedupedPairs = pairs.filter(p => {
        const k = `${p.network}/${p.symbol}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // Exclude slow non-EVM chains from background auto-sync unless explicitly requested
      const SLOW_NETWORKS = new Set(["Solana", "Bitcoin", "Dogecoin", "Litecoin", "TRON", "XRP"]);
      const activePairs = opts?.includeSlow
        ? dedupedPairs
        : dedupedPairs.filter(p => !SLOW_NETWORKS.has(p.network));

      // Fetch ALL EVM chains in parallel — no sequential gaps, no blocking
      const results = await Promise.allSettled(
        activePairs.map(async ({ network, symbol, storeSymbol }) => {
          const r = await fetch(
            `/api/wallet/balance/${walletId}/${encodeURIComponent(network)}/${symbol}`,
            { signal: AbortSignal.timeout(6000) },
          );
          if (!r.ok) return;
          const data = await r.json() as NativeBalance;
          const bal = parseFloat(data.balance);
          if (!isNaN(bal)) updateAssetBalance(storeSymbol, bal);
          const cacheKey = `${network}/${symbol}`;
          setBalanceCache(prev => ({ ...prev, [cacheKey]: data }));
        })
      );
      // Log any failures silently — never block the UI
      results.forEach((r, i) => {
        if (r.status === "rejected") console.debug("[wallet] balance fetch failed:", activePairs[i]?.network, String(r.reason));
      });
    } finally {
      setSyncing(false);
      _syncInFlight = null;
    }
    })();
    return _syncInFlight;
  // syncing intentionally NOT in deps — would cause interval churn every sync cycle
  // storeAssets intentionally NOT in deps — we snapshot via getState() at call time
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletId, updateAssetBalance]);

  return {
    walletId, isNew, loading, error,
    addresses, getAddressInfo,
    fetchBalance, balanceCache,
    sendStatus, sendError, sendResult, sendCrypto, resetSend,
    syncToStore, syncing,
  };
}
