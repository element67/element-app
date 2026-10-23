/**
 * useSwapEngine — Frontend hook for the RushPay AI Instant Swap Engine
 *
 * Drives the full swap lifecycle via the /api/swap/* backend endpoints:
 *   1. getQuote()      → get a live rate quote (5-minute TTL)
 *   2. initiate()      → confirm intent + provide destination details
 *   3. submitPayment() → send tx hash (crypto→fiat) or bank ref (fiat→crypto)
 *   4. pollStatus()    → auto-poll every 3s until terminal state
 *   5. cancel()        → cancel a pending swap
 *
 * Security:
 * - All verification and payout happen server-side
 * - No private keys ever reach this hook
 * - Frontend only sends payment proofs (tx hash / ref), never balances
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types (mirror server types — no server import in frontend) ────────────────
export type SwapDirection = "crypto_to_fiat" | "fiat_to_crypto";

export type SwapStatus =
  | "quoted" | "initiated" | "payment_pending" | "verifying"
  | "verified" | "executing" | "completed" | "failed"
  | "cancelled" | "fraud_hold";

export interface BankInstructions {
  bankName:      string;
  accountNumber: string;
  accountName:   string;
  bankCode:      string;
  reference:     string;
  provider:      "flutterwave" | "paystack" | "unavailable";
}

export interface SwapQuote {
  id:               string;
  direction:        SwapDirection;
  crypto:           string;
  network:          string;
  fiat:             string;
  cryptoAmount:     string;
  fiatAmount:       string;
  rate:             number;
  fee:              string;
  feePercent:       number;
  vaultAddress:     string | null;
  bankInstructions: BankInstructions | null;
  status:           SwapStatus;
  expiresAt:        number;
  payoutTxHash:     string | null;
  fraudFlags:       string[];
}

export type SwapEnginePhase =
  | "idle"
  | "quoting"
  | "confirming"       // user reviewing quote before initiating
  | "awaiting_payment" // swap initiated; user must send payment
  | "submitted"        // payment proof submitted; verifying
  | "completed"
  | "failed"
  | "fraud_hold";

export interface SwapEngineState {
  phase:      SwapEnginePhase;
  quote:      SwapQuote | null;
  error:      string | null;
  isLoading:  boolean;
  /** seconds remaining before quote expires */
  expiresIn:  number;
}

export interface GetQuoteParams {
  direction:    SwapDirection;
  crypto:       string;
  network:      string;
  fiat:         string;
  cryptoAmount?: string;
  fiatAmount?:  string;
}

export interface InitiateParams {
  customerAddress?: string;
  customerBank?: {
    bankCode:      string;
    accountNumber: string;
    accountName:   string;
    provider:      string;
  };
}

export interface SubmitPaymentParams {
  txHash?:     string;
  paymentRef?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3_000;
const TERMINAL_STATUSES: SwapStatus[] = ["completed", "failed", "cancelled", "fraud_hold"];

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useSwapEngine() {
  const [state, setState] = useState<SwapEngineState>({
    phase: "idle", quote: null, error: null, isLoading: false, expiresIn: 0,
  });

  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current)  { clearInterval(pollRef.current);  pollRef.current  = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // Countdown timer for quote expiry
  const startCountdown = useCallback((expiresAt: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const secs = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setState(prev => ({ ...prev, expiresIn: secs }));
      if (secs === 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setState(prev =>
          prev.phase === "confirming" || prev.phase === "awaiting_payment"
            ? { ...prev, phase: "idle", error: "Quote expired — please get a new quote", quote: null }
            : prev
        );
      }
    }, 1000);
  }, []);

  const apiFetch = useCallback(async (path: string, method: "GET" | "POST", body?: unknown) => {
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as { swap?: SwapQuote; error?: string };
    if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data.swap!;
  }, []);

  // ── Get a quote ─────────────────────────────────────────────────────────────
  const getQuote = useCallback(async (params: GetQuoteParams) => {
    stopPolling();
    setState({ phase: "quoting", quote: null, error: null, isLoading: true, expiresIn: 0 });
    try {
      const quote = await apiFetch("/api/swap/quote", "POST", params);
      startCountdown(quote.expiresAt);
      setState({ phase: "confirming", quote, error: null, isLoading: false, expiresIn: Math.floor((quote.expiresAt - Date.now()) / 1000) });
    } catch (e) {
      setState({ phase: "idle", quote: null, error: String(e), isLoading: false, expiresIn: 0 });
    }
  }, [apiFetch, startCountdown, stopPolling]);

  // ── Initiate (user confirmed the quote) ─────────────────────────────────────
  const initiate = useCallback(async (params: InitiateParams) => {
    setState(prev => {
      if (!prev.quote) return prev;
      return { ...prev, isLoading: true, error: null };
    });
    const quoteId = state.quote?.id;
    if (!quoteId) return;
    try {
      const swap = await apiFetch("/api/swap/initiate", "POST", { swapId: quoteId, ...params });
      setState(prev => ({ ...prev, phase: "awaiting_payment", quote: swap, isLoading: false }));
    } catch (e) {
      setState(prev => ({ ...prev, isLoading: false, error: String(e) }));
    }
  }, [apiFetch, state.quote?.id]);

  // ── Poll status ──────────────────────────────────────────────────────────────
  const startPolling = useCallback((swapId: string) => {
    stopPolling();
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const swap = await apiFetch(`/api/swap/status/${swapId}`, "GET");
          const phase: SwapEnginePhase =
            swap.status === "completed"  ? "completed"  :
            swap.status === "failed"     ? "failed"     :
            swap.status === "fraud_hold" ? "fraud_hold" :
            swap.status === "cancelled"  ? "failed"     : "submitted";

          setState(prev => ({ ...prev, quote: swap, phase }));

          if (TERMINAL_STATUSES.includes(swap.status)) {
            stopPolling();
          }
        } catch { /* network hiccup — keep polling */ }
      })();
    }, POLL_INTERVAL_MS);
  }, [apiFetch, stopPolling]);

  // ── Submit payment proof ─────────────────────────────────────────────────────
  const submitPayment = useCallback(async (params: SubmitPaymentParams) => {
    const quoteId = state.quote?.id;
    if (!quoteId) return;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const swap = await apiFetch("/api/swap/payment", "POST", { swapId: quoteId, ...params });
      setState(prev => ({ ...prev, phase: "submitted", quote: swap, isLoading: false }));
      startPolling(quoteId);
    } catch (e) {
      setState(prev => ({ ...prev, isLoading: false, error: String(e) }));
    }
  }, [apiFetch, startPolling, state.quote?.id]);

  // ── Cancel ───────────────────────────────────────────────────────────────────
  const cancel = useCallback(async () => {
    const quoteId = state.quote?.id;
    if (!quoteId) { setState({ phase: "idle", quote: null, error: null, isLoading: false, expiresIn: 0 }); return; }
    stopPolling();
    try {
      await apiFetch(`/api/swap/cancel/${quoteId}`, "POST");
    } catch { /* ignore cancel errors */ }
    setState({ phase: "idle", quote: null, error: null, isLoading: false, expiresIn: 0 });
  }, [apiFetch, state.quote?.id, stopPolling]);

  // ── Reset ────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    stopPolling();
    setState({ phase: "idle", quote: null, error: null, isLoading: false, expiresIn: 0 });
  }, [stopPolling]);

  return {
    ...state,
    getQuote,
    initiate,
    submitPayment,
    cancel,
    reset,
    /** true when the backend server is available */
    isServerAvailable: async () => {
      try {
        const r = await fetch("/api/health");
        return r.ok;
      } catch { return false; }
    },
  };
}
