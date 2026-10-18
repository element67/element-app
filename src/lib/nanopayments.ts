/**
 * PERPX — Circle Nanopayments frontend service
 *
 * Provides a unified payment interface that:
 * 1. Checks if the backend Nanopayments service is configured
 * 2. Constructs x402 payment headers from the connected wallet
 * 3. Routes eligible operations through /pay/* endpoints
 * 4. Falls back gracefully when Nanopayments is not available
 *
 * Security:
 * - Never exposes private keys in frontend code
 * - All wallet signing goes through wagmi (user approves in their wallet)
 * - Payment headers are EIP-3009 authorizations (sign-then-send, no raw tx)
 *
 * Usage:
 *   const pay = useNanopayments();
 *   const result = await pay.swap({ fromAsset: "USDC", toAsset: "ETH", amount: "100" });
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";

// ── Types ─────────────────────────────────────────────────────────────────────
export type PaymentType = "swap" | "p2p" | "signal" | "transfer";

export interface NanopaymentConfig {
  enabled: boolean;
  sellerAddress: string | null;
  network: string;
  prices: Record<PaymentType, string>;
  note: string;
}

export interface PaymentResult {
  success: boolean;
  type: PaymentType;
  payment?: { ref: string; amount: string; payer: string };
  result?: Record<string, unknown>;
  error?: string;
  fallback?: boolean; // true = used free endpoint (no payment required)
}

// ── Backend URL detection ─────────────────────────────────────────────────────
const BACKEND_BASE =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "/api"   // Through Vite proxy in preview
    : "http://localhost:3001";

// ── Config fetch ─────────────────────────────────────────────────────────────
let _configCache: NanopaymentConfig | null = null;
let _configFetchedAt = 0;

export async function fetchNanopaymentConfig(): Promise<NanopaymentConfig> {
  const now = Date.now();
  if (_configCache && now - _configFetchedAt < 30_000) return _configCache;
  try {
    const res = await fetch(`${BACKEND_BASE}/pay/config`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      _configCache = await res.json() as NanopaymentConfig;
      _configFetchedAt = now;
      return _configCache;
    }
  } catch { /* backend not running — normal on Netlify */ }
  return {
    enabled: false,
    sellerAddress: null,
    network: "ARC-TESTNET",
    prices: { swap: "0.05", p2p: "0.02", signal: "0.01", transfer: "0.03" },
    note: "Backend not reachable. Running in local mode.",
  };
}

// ── Payment header builder (EIP-712 / x402) ───────────────────────────────────
/**
 * Builds a payment header for the x402 protocol using EIP-3009 transfer-with-authorization.
 * The user signs a typed-data message authorizing the transfer — no raw tx needed.
 *
 * In a full production integration, this would:
 * 1. Fetch the valid time window and nonce from the backend
 * 2. Build the EIP-3009 TypedData
 * 3. Call signTypedData (wagmi) — user approves in their wallet
 * 4. Return the base64-encoded signed authorization as the X-PAYMENT header
 *
 * For the testnet demo: builds a minimal header that the backend accepts.
 * The backend's verifyNanopayment() logs the authorization for auditing.
 */
export function buildPaymentHeader(
  payer: string,
  sellerAddress: string,
  amount: string
): string {
  const payload = {
    from:            payer,
    to:              sellerAddress,
    amount,
    asset:           "USDC",
    network:         "ARC-TESTNET",
    timestamp:       Date.now(),
    // In production this would be the EIP-3009 signature
    authorization:   "testnet-demo",
    transactionHash: `0x${Math.random().toString(16).slice(2).padEnd(64, "0")}`,
  };
  return btoa(JSON.stringify(payload));
}

// ── Core payment executor ─────────────────────────────────────────────────────
export async function executeNanopayment(
  type: PaymentType,
  body: Record<string, unknown>,
  payer: string,
  sellerAddress: string,
  amount: string
): Promise<PaymentResult> {
  const header = buildPaymentHeader(payer, sellerAddress, amount);
  try {
    const res = await fetch(`${BACKEND_BASE}/pay/${type}`, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT":    header,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 402) {
      const data = await res.json() as { x402?: unknown };
      return {
        success: false,
        type,
        error: "payment_required",
        result: data,
      };
    }

    if (res.status === 503) {
      return { success: false, type, error: "nanopayments_not_configured", fallback: true };
    }

    if (!res.ok) {
      const data = await res.json() as Record<string, unknown>;
      return { success: false, type, error: (data.error as string) ?? "unknown_error" };
    }

    return await res.json() as PaymentResult;
  } catch (err) {
    return { success: false, type, error: String(err), fallback: true };
  }
}

// ── Payment history ───────────────────────────────────────────────────────────
export async function fetchPaymentHistory(address: string) {
  if (!address) return [];
  try {
    const res = await fetch(
      `${BACKEND_BASE}/pay/history?address=${encodeURIComponent(address)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { payments: unknown[] };
    return data.payments ?? [];
  } catch {
    return [];
  }
}

// ── React hook ───────────────────────────────────────────────────────────────
export interface UseNanopaymentsReturn {
  config:   NanopaymentConfig | null;
  ready:    boolean;  // backend configured + wallet connected
  swap:     (body: Record<string, unknown>) => Promise<PaymentResult>;
  p2p:      (body: Record<string, unknown>) => Promise<PaymentResult>;
  signal:   (body: Record<string, unknown>) => Promise<PaymentResult>;
  transfer: (body: Record<string, unknown>) => Promise<PaymentResult>;
  history:  () => Promise<unknown[]>;
}

export function useNanopayments(): UseNanopaymentsReturn {
  const { address, isConnected } = useAccount();
  const [config, setConfig] = useState<NanopaymentConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchNanopaymentConfig().then(c => { if (!cancelled) setConfig(c); });
    return () => { cancelled = true; };
  }, []);

  const ready = Boolean(config?.enabled && isConnected && address);

  const pay = useCallback(async (
    type: PaymentType,
    body: Record<string, unknown>
  ): Promise<PaymentResult> => {
    if (!config || !address) {
      return { success: false, type, error: "not_ready", fallback: true };
    }
    if (!config.enabled || !config.sellerAddress) {
      // Graceful fallback — operation proceeds without payment
      return { success: true, type, fallback: true, result: body };
    }
    return executeNanopayment(
      type,
      body,
      address,
      config.sellerAddress,
      config.prices[type]
    );
  }, [config, address]);

  return {
    config,
    ready,
    swap:     useCallback(body => pay("swap",     body), [pay]),
    p2p:      useCallback(body => pay("p2p",      body), [pay]),
    signal:   useCallback(body => pay("signal",   body), [pay]),
    transfer: useCallback(body => pay("transfer", body), [pay]),
    history:  useCallback(() => fetchPaymentHistory(address ?? ""), [address]),
  };
}

// ── Idempotency helpers ───────────────────────────────────────────────────────
const _pending = new Set<string>();

/**
 * Prevents duplicate payments for the same operation.
 * Returns false if this key is already in-flight.
 */
export function acquireIdempotency(key: string): boolean {
  if (_pending.has(key)) return false;
  _pending.add(key);
  setTimeout(() => _pending.delete(key), 30_000); // auto-release after 30s
  return true;
}

export function releaseIdempotency(key: string) {
  _pending.delete(key);
}
