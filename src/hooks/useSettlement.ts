/**
 * useSettlement — frontend hook for the Element Settlement Engine
 *
 * Drives the settlement lifecycle for P2P sell-side trades:
 *   1. create()         → create settlement record + get deposit address
 *   2. submitTx()       → notify engine of tx hash (on-chain verify starts)
 *   3. poll()           → auto-poll /api/settlement/status/:id every 4s
 *   4. finalize()       → manually trigger finalization (confs reached)
 *
 * Security:
 *   - No private keys pass through this hook
 *   - All verification and payouts happen server-side
 *   - Frontend only submits tx hash and bank details
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type SettlementStatus =
  | "awaiting_crypto"
  | "tx_detected"
  | "verifying"
  | "early_payout_eligible"
  | "payout_processing"
  | "paid"
  | "awaiting_confirmation"
  | "completed"
  | "under_review"
  | "failed";

export interface SettlementSummary {
  id:                  string;
  tradeId:             string;
  sellerId:            string;
  crypto:              string;
  network:             string;
  cryptoAmount:        string;
  depositAddress:      string | null;
  txHash:              string | null;
  txConfirmations:     number;
  fiat:                string;
  fiatAmount:          string;
  rate:                number;
  fee:                 string;
  payoutRef:           string | null;
  payoutConfirmed:     boolean;
  riskScore:           number;
  riskFlags:           string[];
  earlyPayoutGranted:  boolean;
  vaultReserved:       number;
  requiredConfs:       number;
  status:              SettlementStatus;
  statusMessage:       string;
  recipientBankProvider: string | null;
  createdAt:           number;
  updatedAt:           number;
  expiresAt:           number;
}

export interface CreateSettlementParams {
  tradeId:      string;
  sellerId:     string;
  crypto:       string;
  network:      string;
  cryptoAmount: string;
  fiat:         string;
  recipientBank?: {
    bankCode:      string;
    accountNumber: string;
    accountName:   string;
    bankName:      string;
    provider:      "flutterwave" | "paystack" | "unavailable";
  };
}

const TERMINAL: SettlementStatus[] = ["completed", "failed", "under_review"];
const POLL_MS = 4_000;

export function useSettlement() {
  const [settlement, setSettlement] = useState<SettlementSummary | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const apiFetch = useCallback(async (path: string, method: "GET" | "POST", body?: unknown) => {
    const res  = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json() as { settlement?: SettlementSummary; error?: string };
    if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data.settlement!;
  }, []);

  const startPoll = useCallback((id: string) => {
    stopPoll();
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const s = await apiFetch(`/api/settlement/status/${id}`, "GET");
          setSettlement(s);
          if (TERMINAL.includes(s.status)) stopPoll();
        } catch { /* keep polling on network blip */ }
      })();
    }, POLL_MS);
  }, [apiFetch, stopPoll]);

  const create = useCallback(async (params: CreateSettlementParams) => {
    stopPoll();
    setLoading(true);
    setError(null);
    try {
      const s = await apiFetch("/api/settlement/create", "POST", params);
      setSettlement(s);
      if (!TERMINAL.includes(s.status)) startPoll(s.id);
      return s;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [apiFetch, startPoll, stopPoll]);

  const submitTx = useCallback(async (txHash: string) => {
    if (!settlement) return;
    setLoading(true);
    setError(null);
    try {
      const s = await apiFetch("/api/settlement/tx-detected", "POST", {
        settlementId: settlement.id, txHash,
      });
      setSettlement(s);
      if (!TERMINAL.includes(s.status)) startPoll(s.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [apiFetch, settlement, startPoll]);

  const loadByTrade = useCallback(async (tradeId: string) => {
    try {
      const s = await apiFetch(`/api/settlement/by-trade/${tradeId}`, "GET");
      setSettlement(s);
      if (!TERMINAL.includes(s.status)) startPoll(s.id);
      return s;
    } catch { return null; }
  }, [apiFetch, startPoll]);

  const loadById = useCallback(async (id: string) => {
    try {
      const s = await apiFetch(`/api/settlement/status/${id}`, "GET");
      setSettlement(s);
      if (!TERMINAL.includes(s.status)) startPoll(s.id);
      return s;
    } catch { return null; }
  }, [apiFetch, startPoll]);

  const reset = useCallback(() => {
    stopPoll();
    setSettlement(null);
    setError(null);
    setLoading(false);
  }, [stopPoll]);

  return { settlement, loading, error, create, submitTx, loadByTrade, loadById, reset };
}
