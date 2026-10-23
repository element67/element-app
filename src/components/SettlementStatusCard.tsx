/**
 * SettlementStatusCard — Element Settlement Engine UI
 *
 * Shows real-time settlement status for a P2P sell-side trade.
 * Wired to useSettlement hook; polls /api/settlement/status/:id every 4s.
 * Covers all 10 settlement statuses with clear explanations and actions.
 */

import { useState, useCallback, useEffect } from "react";
import {
  CheckCircle2, AlertTriangle, Loader2, Shield, Clock, Zap,
  Copy, ExternalLink, RefreshCw, ChevronRight, X,
} from "lucide-react";
import type { SettlementSummary, SettlementStatus } from "@/hooks/useSettlement";
import { useSettlement } from "@/hooks/useSettlement";
import { CryptoIcon } from "@/components/AssetIcons";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BLUE   = "#3b82f6";
const GREEN  = "#22c55e";
const AMBER  = "#f59e0b";
const RED    = "#ef4444";
const CARD   = "rgba(255,255,255,0.80)";
const CARD_H = "rgba(255,255,255,0.92)";
const BORDER = "rgba(100,116,139,0.18)";

// ─── Status config ────────────────────────────────────────────────────────────
interface StatusConfig {
  color: string;
  bg: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  isTerminal: boolean;
  isSuccess: boolean;
}

function getStatusConfig(s: SettlementStatus, confs?: number, required?: number): StatusConfig {
  switch (s) {
    case "awaiting_crypto":
      return { color: BLUE, bg: `${BLUE}15`, icon: <Clock size={16} />, label: "Awaiting Crypto",
        description: "Send your crypto to the deposit address below. Do not close this window.",
        isTerminal: false, isSuccess: false };
    case "tx_detected":
      return { color: BLUE, bg: `${BLUE}15`, icon: <Zap size={16} />, label: "Transaction Detected",
        description: "Your transaction was detected on the network. Verifying now…",
        isTerminal: false, isSuccess: false };
    case "verifying":
      return { color: AMBER, bg: `${AMBER}15`, icon: <Loader2 size={16} className="animate-spin" />, label: "Verifying",
        description: `Confirming on the blockchain (${confs ?? 0} / ${required ?? "?"} confirmations)`,
        isTerminal: false, isSuccess: false };
    case "early_payout_eligible":
      return { color: GREEN, bg: `${GREEN}15`, icon: <Zap size={16} />, label: "Early Payout Approved",
        description: "Your transaction passed all checks. Instant payout is being processed.",
        isTerminal: false, isSuccess: false };
    case "payout_processing":
      return { color: BLUE, bg: `${BLUE}15`, icon: <Loader2 size={16} className="animate-spin" />, label: "Payout Processing",
        description: "Sending your local currency payment now…",
        isTerminal: false, isSuccess: false };
    case "paid":
      return { color: GREEN, bg: `${GREEN}15`, icon: <CheckCircle2 size={16} />, label: "Paid",
        description: "Payment has been sent to your account. Check your bank for arrival.",
        isTerminal: false, isSuccess: true };
    case "awaiting_confirmation":
      return { color: AMBER, bg: `${AMBER}15`, icon: <Clock size={16} />, label: "Awaiting Confirmations",
        description: `Waiting for ${required ?? "?"} blockchain confirmations (${confs ?? 0} so far). Payout will follow.`,
        isTerminal: false, isSuccess: false };
    case "completed":
      return { color: GREEN, bg: `${GREEN}15`, icon: <CheckCircle2 size={16} />, label: "Completed",
        description: "Settlement fully complete. Funds confirmed and reconciled.",
        isTerminal: true, isSuccess: true };
    case "under_review":
      return { color: AMBER, bg: `${AMBER}15`, icon: <Shield size={16} />, label: "Under Review",
        description: "Your trade is being reviewed. Funds are safe. Our team will contact you.",
        isTerminal: true, isSuccess: false };
    case "failed":
      return { color: RED, bg: `${RED}15`, icon: <AlertTriangle size={16} />, label: "Failed",
        description: "Settlement could not be completed. Contact support with your Trade ID.",
        isTerminal: true, isSuccess: false };
  }
}

// ─── Progress stepper ─────────────────────────────────────────────────────────
const STEPS: SettlementStatus[] = [
  "awaiting_crypto", "tx_detected", "verifying",
  "early_payout_eligible", "payout_processing", "paid", "completed",
];

function ProgressStepper({ status }: { status: SettlementStatus }) {
  const isFailure = status === "failed" || status === "under_review";
  const currentIdx = STEPS.indexOf(status);

  return (
    <div className="flex items-center gap-0 w-full">
      {STEPS.map((step, i) => {
        const done    = isFailure ? false : currentIdx > i;
        const active  = !isFailure && currentIdx === i;
        const color   = isFailure && i === currentIdx ? RED : done ? GREEN : active ? BLUE : "#1e293b";
        return (
          <div key={step} className="flex items-center flex-1">
            <div className="w-2.5 h-2.5 rounded-full shrink-0 transition-all duration-300"
              style={{ background: done ? GREEN : active ? BLUE : isFailure ? "#1e293b" : "#1e293b",
                       border: `2px solid ${color}` }} />
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-0.5 transition-all duration-300"
                style={{ background: done ? GREEN : "#1e293b" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Deposit address box ───────────────────────────────────────────────────────
function DepositBox({ settlement }: { settlement: SettlementSummary }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  if (!settlement.depositAddress) return (
    <div className="p-3 rounded-xl text-xs flex items-start gap-2"
      style={{ background: `${AMBER}10`, border: `1px solid ${AMBER}30` }}>
      <AlertTriangle size={13} style={{ color: AMBER, marginTop: 1 }} className="shrink-0" />
      <span style={{ color: AMBER }}>
        Deposit address not configured. Set VAULT_EVM_ADDRESS in .env to enable settlements.
      </span>
    </div>
  );

  return (
    <div className="rounded-xl p-3 flex flex-col gap-2" style={{ background: CARD_H, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold" style={{ color: "var(--subtle)" }}>
          Send exactly {settlement.cryptoAmount} {settlement.crypto} to:
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
          style={{ background: `${BLUE}15`, color: BLUE }}>
          {settlement.network}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-[11px] font-mono truncate" style={{ color: "var(--ink)" }}>
          {settlement.depositAddress}
        </code>
        <button onClick={() => copy(settlement.depositAddress!)} title="Copy address"
          className="shrink-0 p-1 rounded transition-colors"
          style={{ color: copied ? GREEN : "#64748b" }}>
          <Copy size={13} />
        </button>
      </div>
      <div className="text-[10px]" style={{ color: "#475569" }}>
        Only send <strong style={{ color: "#94a3b8" }}>{settlement.crypto}</strong> on{" "}
        <strong style={{ color: "#94a3b8" }}>{settlement.network}</strong>. Wrong network = lost funds.
      </div>
    </div>
  );
}

// ─── Tx hash submission ───────────────────────────────────────────────────────
function TxHashForm({ onSubmit, loading }: { onSubmit: (hash: string) => void; loading: boolean }) {
  const [hash, setHash] = useState("");
  const valid = hash.startsWith("0x") && hash.length === 66;
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold" style={{ color: "var(--subtle)" }}>
        Already sent? Submit your transaction hash to speed up verification:
      </div>
      <div className="flex gap-2">
        <input
          value={hash}
          onChange={e => setHash(e.target.value.trim())}
          placeholder="0x..."
          className="flex-1 px-3 py-2 rounded-xl text-xs font-mono outline-none"
          style={{ background: CARD_H, border: `1px solid ${BORDER}`, color: "var(--ink)" }}
        />
        <button
          onClick={() => valid && onSubmit(hash)}
          disabled={!valid || loading}
          className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
          style={{ background: BLUE, color: "#fff" }}>
          {loading ? <Loader2 size={11} className="animate-spin" /> : <ChevronRight size={11} />}
          Verify
        </button>
      </div>
      {hash && !valid && (
        <div className="text-[10px]" style={{ color: RED }}>
          Enter a valid EVM tx hash (0x + 64 hex characters)
        </div>
      )}
    </div>
  );
}

// ─── Main card ────────────────────────────────────────────────────────────────
interface SettlementStatusCardProps {
  /** Pass the settlement object directly if you already have it */
  initialSettlement?: SettlementSummary | null;
  /** Or pass tradeId to load from server (P2P) */
  tradeId?: string;
  /** Or pass settlementId to load directly (Quick Swap) */
  settlementId?: string;
  onClose?: () => void;
  /** Fiat symbol for display */
  fiatSymbol?: string;
}

export function SettlementStatusCard({
  initialSettlement,
  tradeId,
  settlementId,
  onClose,
  fiatSymbol = "₦",
}: SettlementStatusCardProps) {
  const engine = useSettlement();

  // Auto-load when an ID is provided
  useEffect(() => {
    if (settlementId) { void engine.loadById(settlementId); }
    else if (tradeId) { void engine.loadByTrade(tradeId); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementId, tradeId]);
  const s = initialSettlement ?? engine.settlement;

  if (!s) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3"
        style={{ color: "var(--subtle)" }}>
        <Loader2 size={24} className="animate-spin" />
        <span className="text-xs">Loading settlement status…</span>
      </div>
    );
  }

  const cfg = getStatusConfig(s.status, s.txConfirmations, s.requiredConfs);
  const fiatFmt = parseFloat(s.fiatAmount).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const explorerBase: Record<string, string> = {
    ethereum: "https://etherscan.io/tx/",
    base:     "https://basescan.org/tx/",
    arbitrum: "https://arbiscan.io/tx/",
    optimism: "https://optimistic.etherscan.io/tx/",
    polygon:  "https://polygonscan.com/tx/",
  };
  const explorerUrl = s.txHash
    ? `${explorerBase[s.network] ?? "https://etherscan.io/tx/"}${s.txHash}`
    : null;

  return (
    <div className="rounded-2xl flex flex-col gap-3 p-4"
      style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${BORDER}` }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: cfg.bg, color: cfg.color }}>
            {cfg.icon}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold" style={{ color: "#f1f5f9" }}>Element Settlement</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: cfg.bg, color: cfg.color }}>
                {cfg.label}
              </span>
            </div>
            <div className="text-[10px] font-mono" style={{ color: "#475569" }}>
              #{s.id.slice(-8).toUpperCase()}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!cfg.isTerminal && (
            <button onClick={() => void engine.loadByTrade(s.tradeId)} title="Refresh"
              className="p-1.5 rounded-lg transition-colors"
              style={{ background: CARD_H, color: "var(--subtle)" }}>
              <RefreshCw size={13} />
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg"
              style={{ background: CARD_H, color: "var(--subtle)" }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Progress stepper */}
      <ProgressStepper status={s.status} />

      {/* Status message */}
      <div className="rounded-xl px-3 py-2.5 text-xs"
        style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
        {cfg.description}
      </div>

      {/* Trade summary */}
      <div className="rounded-xl p-3 grid grid-cols-2 gap-2 text-xs"
        style={{ background: CARD_H, border: `1px solid ${BORDER}` }}>
        <div>
          <div style={{ color: "var(--subtle)" }}>You sent</div>
          <div className="flex items-center gap-1.5 mt-0.5 font-bold" style={{ color: "#f1f5f9" }}>
            <CryptoIcon symbol={s.crypto} size={14} />
            {s.cryptoAmount} {s.crypto}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--subtle)" }}>You receive</div>
          <div className="font-bold mt-0.5" style={{ color: GREEN }}>
            {fiatSymbol}{fiatFmt} {s.fiat}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--subtle)" }}>Rate</div>
          <div className="mt-0.5" style={{ color: "#94a3b8" }}>
            {fiatSymbol}{s.rate.toLocaleString("en-US", { maximumFractionDigits: 0 })} / {s.crypto}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--subtle)" }}>Fee (0.5%)</div>
          <div className="mt-0.5" style={{ color: "#94a3b8" }}>
            {fiatSymbol}{parseFloat(s.fee).toLocaleString("en-US", { maximumFractionDigits: 0 })} {s.fiat}
          </div>
        </div>
      </div>

      {/* Network / confirmations */}
      {s.txHash && (
        <div className="flex items-center justify-between text-xs"
          style={{ color: "var(--subtle)" }}>
          <span>
            {s.txConfirmations} / {s.requiredConfs} confirmations
          </span>
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1" style={{ color: BLUE }}>
              View on Explorer <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}

      {/* Confirmation progress bar */}
      {s.requiredConfs > 0 && s.txHash && (
        <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(100,116,139,0.12)" }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(100, (s.txConfirmations / s.requiredConfs) * 100)}%`,
              background: s.txConfirmations >= s.requiredConfs ? GREEN : BLUE,
            }} />
        </div>
      )}

      {/* Early payout badge */}
      {s.earlyPayoutGranted && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: `${GREEN}10`, border: `1px solid ${GREEN}25`, color: GREEN }}>
          <Zap size={11} />
          <span>Early payout granted — you don't have to wait for full confirmation</span>
        </div>
      )}

      {/* Payout reference */}
      {s.payoutRef && (
        <div className="flex items-center justify-between text-xs"
          style={{ color: "var(--subtle)" }}>
          <span>Payout ref</span>
          <code className="font-mono" style={{ color: "#94a3b8" }}>{s.payoutRef}</code>
        </div>
      )}

      {/* Deposit address — shown while awaiting crypto */}
      {s.status === "awaiting_crypto" && <DepositBox settlement={s} />}

      {/* Tx hash submission — shown after deposit address is shown */}
      {s.status === "awaiting_crypto" && (
        <TxHashForm onSubmit={h => void engine.submitTx(h)} loading={engine.loading} />
      )}

      {/* Error */}
      {engine.error && (
        <div className="text-xs px-3 py-2 rounded-xl"
          style={{ background: `${RED}10`, color: RED, border: `1px solid ${RED}25` }}>
          {engine.error}
        </div>
      )}

      {/* Risk flags — only shown in under_review */}
      {s.status === "under_review" && s.riskFlags.length > 0 && (
        <div className="rounded-xl p-3 text-xs flex flex-col gap-1"
          style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}20` }}>
          <div className="font-semibold" style={{ color: AMBER }}>Review flags (internal):</div>
          {s.riskFlags.map(f => (
            <div key={f} className="flex items-center gap-1.5" style={{ color: "#94a3b8" }}>
              <span>·</span> {f.replace(/_/g, " ")}
            </div>
          ))}
        </div>
      )}

      {/* Support footer */}
      <div className="text-[10px] text-center" style={{ color: "#374151" }}>
        Trade ID: {s.tradeId.slice(-8).toUpperCase()} · Settlement powered by Element Settlement Engine
      </div>
    </div>
  );
}
