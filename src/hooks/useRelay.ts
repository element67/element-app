/**
 * useRelay — Relay API integration (https://api.relay.link)
 *
 * Endpoints used:
 *   GET  /chains              → supported chains + featured tokens
 *   POST /currencies/v2       → curated token list with search
 *   POST /quote/v2            → executable quote with steps[]
 *   GET  /intents/status/v3   → status polling by requestId
 *
 * No API key required for public endpoints (optional x-api-key for higher limits).
 * All amounts returned by Relay are in the token's smallest unit (wei, etc.).
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── API base ─────────────────────────────────────────────────────────────────

export const RELAY_API = "https://api.relay.link";

/** Zero address = native gas token on EVM chains */
export const NATIVE_ADDRESS = "0x0000000000000000000000000000000000000000";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RelayChain {
  id: number;
  name: string;
  displayName: string;
  explorerUrl: string;
  explorerPaths?: { transaction?: string; address?: string; token?: string };
  depositEnabled: boolean;
  disabled: boolean;
  blockProductionLagging?: boolean;
  currency: {
    id: string; symbol: string; name: string;
    address: string; decimals: number; supportsBridging: boolean;
  };
  featuredTokens: RelayCurrency[];
  erc20Currencies?: RelayCurrency[];
  iconUrl?: string;
  brandColor?: string;
}

export interface RelayCurrency {
  id: string;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  supportsBridging?: boolean;
  metadata?: { logoURI?: string; verified?: boolean; isNative?: boolean };
  chainId?: number;
  vmType?: string;
}

/** Alias kept for backward compat */
export type RelayToken = RelayCurrency;

/** One step returned by /quote/v2 */
export interface RelayStep {
  id: string;               // e.g. "deposit"
  action: string;
  description: string;
  kind: "transaction" | "signature";
  requestId: string;        // poll /intents/status/v3?requestId=…
  items: Array<{
    status: "incomplete" | "complete";
    data: {
      from: string;
      to: string;
      data: string;
      value: string;
      chainId: number;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      gasLimit?: string;
    };
    check?: { endpoint: string; method: string };
  }>;
}

export interface RelayFee {
  amount: string;       // raw smallest unit
  currency: string;     // token symbol or "eth"
  amountUsd?: string;   // USD string if provided by API
}

export interface RelayQuote {
  steps: RelayStep[];
  fees: {
    gas?: RelayFee;
    relayer?: RelayFee;
    relayerService?: RelayFee;
    app?: RelayFee;
  };
  details: {
    operation: string;        // "bridge" | "swap" | "cross-chain-swap"
    timeEstimate: number;     // seconds
    currencyIn: {
      currency: RelayCurrency & { chainId: number };
      amount: string;
      amountUsd?: string;
    };
    currencyOut: {
      currency: RelayCurrency & { chainId: number };
      amount: string;
      minimumAmount?: string;
      amountUsd?: string;
    };
    rate?: string;
    slippageTolerance?: string;
  };
  /** Derived: the requestId from the first step */
  requestId: string;
}

export type RelayStatusValue =
  | "waiting" | "depositing" | "pending" | "submitted"
  | "success" | "delayed" | "refund" | "failure";

export interface RelayStatus {
  status: RelayStatusValue;
  inTxHashes?: string[];
  txHashes?: string[];
  updatedAt?: number;
  originChainId?: number;
  destinationChainId?: number;
  failReason?: string | null;
  details?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format raw smallest-unit amount into human-readable string */
export function formatRelayAmount(raw: string, decimals: number, maxFrac = 6): string {
  try {
    if (!raw || raw === "0") return "0";
    const bn = BigInt(raw);
    const divisor = BigInt(10 ** decimals);
    const whole = bn / divisor;
    const remainder = bn % divisor;
    if (remainder === 0n) return whole.toString();
    const fracStr = remainder.toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return raw;
  }
}

/** Alias */
export const formatTokenAmount = formatRelayAmount;

/** Parse human-readable amount into smallest-unit string */
export function parseRelayAmount(human: string, decimals: number): string {
  try {
    if (!human || human === "0" || human === ".") return "0";
    const [intPart, fracPart = ""] = human.split(".");
    const fracPadded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
    return (BigInt(intPart || "0") * BigInt(10 ** decimals) + BigInt(fracPadded || "0")).toString();
  } catch {
    return "0";
  }
}

// ─── useRelayChains ───────────────────────────────────────────────────────────

interface UseChainsResult {
  chains: RelayChain[];
  loading: boolean;
  error: string | null;
}

// Module-level cache — shared across ALL hook instances so only ONE network
// request fires regardless of how many components call useRelayChains().
let _chainsCache: RelayChain[] | null = null;
let _chainsInflight: Promise<RelayChain[]> | null = null;

function fetchChainsOnce(): Promise<RelayChain[]> {
  if (_chainsCache) return Promise.resolve(_chainsCache);
  if (_chainsInflight) return _chainsInflight;
  _chainsInflight = fetch(`${RELAY_API}/chains`)
    .then(r => r.json() as Promise<{ chains: RelayChain[] }>)
    .then(json => {
      _chainsCache = (json.chains ?? []).filter(c => !c.disabled && !c.blockProductionLagging);
      return _chainsCache;
    })
    .finally(() => { _chainsInflight = null; });
  return _chainsInflight;
}

export function useRelayChains(): UseChainsResult {
  const [chains, setChains]   = useState<RelayChain[]>(_chainsCache ?? []);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(_chainsCache === null);

  useEffect(() => {
    let cancelled = false;
    // Use Promise.resolve() so setState never fires synchronously inside the effect.
    Promise.resolve(_chainsCache ? Promise.resolve(_chainsCache) : fetchChainsOnce())
      .then(c => { if (!cancelled) { setChains(c); setLoading(false); } })
      .catch((e: unknown) => {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Failed to load chains"); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, []);

  return { chains, loading, error };
}

// ─── useRelayCurrencies ───────────────────────────────────────────────────────

interface UseCurrenciesResult {
  currencies: RelayCurrency[];
  loading: boolean;
  search: (term: string) => void;
}

/**
 * Fetch curated token list for a chain, with optional search term.
 * Also accepts an inline `term` as second arg for use in TokenPicker.
 */
export function useRelayCurrencies(chainId: number | null, inlineTerm?: string): UseCurrenciesResult {
  const [currencies, setCurrencies] = useState<RelayCurrency[]>([]);
  const [loading, setLoading]       = useState(!!chainId); // start loading if chainId provided
  const [manualTerm, setManualTerm] = useState("");

  // Use inlineTerm when provided (controlled), else manualTerm (uncontrolled)
  const term = inlineTerm !== undefined ? inlineTerm : manualTerm;

  useEffect(() => {
    if (!chainId) return;
    let cancelled = false;
    const body: Record<string, unknown> = { chainIds: [chainId], defaultList: !term, limit: 50, verified: true };
    if (term) { body["term"] = term; body["defaultList"] = false; }
    fetch(`${RELAY_API}/currencies/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(r => r.json() as Promise<RelayCurrency[]>)
      .then(list => {
        if (!cancelled) {
          setCurrencies(Array.isArray(list) ? list.map(t => ({ ...t, chainId: chainId ?? undefined })) : []);
        }
      })
      .catch(() => { if (!cancelled) setCurrencies([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [chainId, term]);

  const search = useCallback((t: string) => setManualTerm(t), []);
  return { currencies, loading, search };
}

// ─── useRelayQuote ────────────────────────────────────────────────────────────

export interface QuoteParams {
  user: string;                   // address depositing on origin chain
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;         // token address (zero = native)
  destinationCurrency: string;
  amount: string;                 // smallest unit string
  recipient?: string;             // defaults to user
  tradeType?: "EXACT_INPUT" | "EXACT_OUTPUT" | "EXPECTED_OUTPUT";
  topupGas?: boolean;
}

/** Quotes expire after 30s per Relay docs */
const QUOTE_TTL_MS = 30_000;

interface UseQuoteResult {
  quote: RelayQuote | null;
  loading: boolean;
  error: string | null;
  isExpired: boolean;
  expiresAt: number | null;
  fetchQuote: (params: QuoteParams) => Promise<RelayQuote | null>;
  clearQuote: () => void;
}

export function useRelayQuote(): UseQuoteResult {
  const [quote, setQuote]       = useState<RelayQuote | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [expiresAt, setExpires] = useState<number | null>(null);
  const [nowTick, setNowTick]   = useState(Date.now);

  // Tick every second to recompute isExpired
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const isExpired = expiresAt !== null && nowTick > expiresAt;

  const fetchQuote = useCallback(async (params: QuoteParams): Promise<RelayQuote | null> => {
    setLoading(true);
    setError(null);
    setQuote(null);
    setExpires(null);
    try {
      const body: Record<string, unknown> = {
        user: params.user,
        originChainId: params.originChainId,
        destinationChainId: params.destinationChainId,
        originCurrency: params.originCurrency,
        destinationCurrency: params.destinationCurrency,
        amount: params.amount,
        tradeType: params.tradeType ?? "EXACT_INPUT",
        explicitDeposit: true,
      };
      if (params.recipient && params.recipient !== params.user) body["recipient"] = params.recipient;
      if (params.topupGas) body["topupGas"] = true;

      const r = await fetch(`${RELAY_API}/quote/v2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as { message?: string; error?: string };
        throw new Error(err.message ?? err.error ?? `HTTP ${r.status}`);
      }

      const raw = await r.json() as Omit<RelayQuote, "requestId"> & { steps: RelayStep[] };
      // Derive requestId from first step
      const requestId = raw.steps?.[0]?.requestId ?? "";
      const q: RelayQuote = { ...raw, requestId };
      setQuote(q);
      setExpires(Date.now() + QUOTE_TTL_MS);
      return q;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Quote failed";
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearQuote = useCallback(() => {
    setQuote(null);
    setError(null);
    setExpires(null);
  }, []);

  return { quote, loading, error, isExpired, expiresAt, fetchQuote, clearQuote };
}

// ─── useRelayStatus ───────────────────────────────────────────────────────────

const TERMINAL: RelayStatusValue[] = ["success", "refund", "failure"];

/**
 * Polls /intents/status/v3 every 2s when a requestId is provided.
 * Stops automatically on terminal status.
 */
export function useRelayStatus(requestId: string | null): { status: RelayStatus | null; loading: boolean } {
  const [status, setStatus] = useState<RelayStatus | null>(null);
  const [loading, setLoading] = useState(!!requestId); // start loading when requestId provided
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeReqId = useRef<string | null>(null);

  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!requestId) return;

    activeReqId.current = requestId;
    const poll = async () => {
      try {
        const r = await fetch(`${RELAY_API}/intents/status/v3?requestId=${encodeURIComponent(requestId)}`);
        if (!r.ok) return;
        const s = await r.json() as RelayStatus;
        if (activeReqId.current !== requestId) return; // stale
        setStatus(s);
        setLoading(false);
        if (TERMINAL.includes(s.status)) {
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch { /* keep polling */ }
    };

    void poll();
    pollRef.current = setInterval(() => { void poll(); }, 2000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [requestId]);

  // cleanup on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  return { status, loading };
}
