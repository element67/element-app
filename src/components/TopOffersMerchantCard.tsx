/**
 * Top Offer Merchant Escrow — UI
 *
 * Completely separate from:
 *  - Quick Swap (swapEngine / settlement.ts)
 *  - General P2P marketplace (p2pStore / P2PPanel)
 *
 * Architecture:
 *  1. Merchant list fetched from /api/merchant-escrow/merchants
 *  2. User selects offer → reviews rate, fee, net payout
 *  3. One-tap "Accept Offer" → POST /api/merchant-escrow/accept
 *  4. Trade status polled every 4s until terminal
 *  5. Status stepper: offer_accepted → funds_reserved → verifying_payment
 *                     → processing → completed | under_review | failed
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Shield, Star, CheckCircle2, AlertTriangle, Loader2, X,
  Lock, RefreshCw, Clock, Zap, Copy, ExternalLink,
  TrendingUp, Info,
} from "lucide-react";
import { CryptoIcon } from "@/components/AssetIcons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MerchantOffer {
  merchantId: string;
  merchantName: string;
  asset: string;
  network: string;
  availableAmt: number;
  depositedAmt: number;
  reservedAmt: number;
  status: string;
  kycLevel: number;
  fiatCurrency: string;
  ratePerUnit: number;
  minFiat: number;
  maxFiat: number;
  feePct: number;
  payMethods: string[];
  riskScore: number;
}

interface EscrowTrade {
  id: string;
  merchantId: string;
  asset: string;
  cryptoAmt: number;
  fiatCurrency: string;
  fiatGross: number;
  fiatFee: number;
  fiatNet: number;
  rateUsed: number;
  rateLockExpiresAt: number;
  payMethod: string;
  status: TradeStatus;
  payoutRef?: string;
  failReason?: string;
  createdAt: number;
  updatedAt: number;
  audit: { ts: number; event: string; actor: string; detail?: string }[];
}

type TradeStatus =
  | "offer_accepted"
  | "funds_reserved"
  | "verifying_payment"
  | "processing"
  | "completed"
  | "under_review"
  | "failed"
  | "cancelled"
  | "refunded";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TERMINAL: TradeStatus[] = ["completed", "failed", "cancelled", "refunded"];

function fmtFiat(n: number, cur: string) {
  try { return n.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }); }
  catch { return `${cur} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`; }
}

function fmtCrypto(n: number, asset: string) {
  const d = asset === "BTC" ? 6 : 4;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d })} ${asset}`;
}

function fmtAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const KYC_LABEL: Record<number, string> = { 0: "Unverified", 1: "Basic", 2: "Standard", 3: "Advanced" };
const KYC_COLOR: Record<number, string> = {
  0: "#f87171", 1: "#fbbf24", 2: "#60a5fa", 3: "#4ade80",
};

const STATUS_CFG: Record<TradeStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  offer_accepted:    { label: "Offer Accepted",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  icon: <CheckCircle2 size={14} /> },
  funds_reserved:    { label: "Funds Reserved",    color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  icon: <Lock size={14} /> },
  verifying_payment: { label: "Verifying Payment", color: "#fb923c", bg: "rgba(251,146,60,0.1)",  icon: <RefreshCw size={14} className="animate-spin" /> },
  processing:        { label: "Processing Payout", color: "#a78bfa", bg: "rgba(167,139,250,0.1)", icon: <Loader2 size={14} className="animate-spin" /> },
  completed:         { label: "Completed",         color: "#4ade80", bg: "rgba(74,222,128,0.1)",  icon: <CheckCircle2 size={14} /> },
  under_review:      { label: "Under Review",      color: "#fb923c", bg: "rgba(251,146,60,0.1)",  icon: <AlertTriangle size={14} /> },
  failed:            { label: "Failed",            color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: <X size={14} /> },
  cancelled:         { label: "Cancelled",         color: "var(--subtle)", bg: "rgba(148,163,184,0.1)", icon: <X size={14} /> },
  refunded:          { label: "Refunded",          color: "#22c55e", bg: "rgba(34,197,94,0.1)",   icon: <CheckCircle2 size={14} /> },
};

const STEPS: TradeStatus[] = [
  "offer_accepted", "funds_reserved", "verifying_payment", "processing", "completed",
];

function stepIndex(status: TradeStatus): number {
  const i = STEPS.indexOf(status);
  return i >= 0 ? i : (["under_review", "failed"].includes(status) ? 2 : 0);
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const CARD    = "rgba(255,255,255,0.80)";
const CARD_H  = "rgba(255,255,255,0.92)";
const BORDER  = "rgba(100,116,139,0.18)";
const BORDER_S = "rgba(100,116,139,0.12)";
const BLUE    = "#3b82f6";
const GREEN   = "#22c55e";
const AMBER   = "#fbbf24";

// ─── Sub-components ───────────────────────────────────────────────────────────

function EscrowBadge({ available, asset }: { available: number; asset: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(251,191,36,0.12)", color: AMBER, border: `1px solid rgba(251,191,36,0.25)` }}>
      <Lock size={9} />
      {fmtCrypto(available, asset)} escrowed
    </span>
  );
}

function KycBadge({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ background: `${KYC_COLOR[level]}18`, color: KYC_COLOR[level], border: `1px solid ${KYC_COLOR[level]}30` }}>
      <Shield size={9} />
      KYC {KYC_LABEL[level]}
    </span>
  );
}

function RiskBadge({ score }: { score: number }) {
  const color = score < 30 ? GREEN : score < 60 ? AMBER : "#f87171";
  const label = score < 30 ? "Low Risk" : score < 60 ? "Med Risk" : "High Risk";
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ background: `${color}15`, color, border: `1px solid ${color}28` }}>
      {label}
    </span>
  );
}

// ─── Merchant Offer Card ──────────────────────────────────────────────────────

function MerchantOfferCard({ offer, onAccept }: { offer: MerchantOffer; onAccept: (o: MerchantOffer) => void }) {
  const fiatOpt = offer.fiatCurrency;

  return (
    <div className="rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
      style={{ background: CARD, border: `1px solid ${BORDER}` }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: BORDER_S }}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm"
            style={{ background: `rgba(59,130,246,0.15)`, color: BLUE }}>
            {offer.merchantName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{offer.merchantName}</span>
              {offer.kycLevel >= 2 && <Shield size={11} className="text-blue-400" />}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Star size={9} className="fill-yellow-400 text-yellow-400" />
              <span className="text-[10px]" style={{ color: "#64748b" }}>Top Merchant</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <KycBadge level={offer.kycLevel} />
          <RiskBadge score={offer.riskScore} />
        </div>
      </div>

      {/* Rate + asset */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CryptoIcon symbol={offer.asset} size={20} />
            <div>
              <div className="text-xs font-semibold" style={{ color: "var(--subtle)" }}>Sell {offer.asset}</div>
              <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{offer.network}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-mono font-bold" style={{ color: GREEN }}>
              {fmtFiat(offer.ratePerUnit, fiatOpt)}
            </div>
            <div className="text-[10px]" style={{ color: "var(--subtle)" }}>per {offer.asset}</div>
          </div>
        </div>

        {/* Escrow badge + limits */}
        <div className="flex items-center justify-between mb-3">
          <EscrowBadge available={offer.availableAmt} asset={offer.asset} />
          <span className="text-[10px]" style={{ color: "var(--subtle)" }}>
            {fmtFiat(offer.minFiat, fiatOpt)} – {fmtFiat(offer.maxFiat, fiatOpt)}
          </span>
        </div>

        {/* Payment methods */}
        <div className="flex flex-wrap gap-1 mb-3">
          {offer.payMethods.slice(0, 3).map(m => (
            <span key={m} className="text-[10px] px-2 py-0.5 rounded font-medium"
              style={{ background: "rgba(59,130,246,0.1)", color: BLUE, border: `1px solid rgba(59,130,246,0.2)` }}>
              {m.replace(/_/g, " ")}
            </span>
          ))}
          {offer.payMethods.length > 3 && (
            <span className="text-[10px] px-2 py-0.5 rounded" style={{ color: "var(--subtle)" }}>
              +{offer.payMethods.length - 3} more
            </span>
          )}
        </div>

        {/* Accept button */}
        <button onClick={() => onAccept(offer)}
          className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg,${GREEN},#16a34a)`, color: "#000" }}>
          <Zap size={14} />
          Accept Offer — One Tap
        </button>
      </div>
    </div>
  );
}

// ─── Accept Offer Modal ───────────────────────────────────────────────────────

function AcceptOfferModal({
  offer, takerId, onClose, onTradeCreated,
}: {
  offer: MerchantOffer;
  takerId: string;
  onClose: () => void;
  onTradeCreated: (t: EscrowTrade) => void;
}) {
  const [fiatAmt, setFiatAmt]         = useState("");
  const [payMethod, setPayMethod]     = useState(offer.payMethods[0] ?? "bank_transfer");
  const [recipientName, setName]      = useState("");
  const [recipientAccount, setAcct]   = useState("");
  const [agreed, setAgreed]           = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  // Rate lock expiry is computed once when modal mounts — stable string for display
  const [rateLockExpiry]              = useState(() =>
    new Date(Date.now() + 180_000).toLocaleTimeString()
  );

  const fiatNum    = parseFloat(fiatAmt) || 0;
  const cryptoAmt  = fiatNum ? fiatNum / offer.ratePerUnit : 0;
  const fiatFee    = fiatNum * (offer.feePct / 100);
  const fiatNet    = fiatNum - fiatFee;
  const rateExpiry = rateLockExpiry;

  const rangeErr = fiatNum > 0 && (fiatNum < offer.minFiat || fiatNum > offer.maxFiat)
    ? `Limits: ${fmtFiat(offer.minFiat, offer.fiatCurrency)} – ${fmtFiat(offer.maxFiat, offer.fiatCurrency)}`
    : "";

  const isValid = fiatNum >= offer.minFiat && fiatNum <= offer.maxFiat
    && recipientAccount.trim().length >= 6 && agreed && !loading;

  async function handleAccept() {
    if (!isValid) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/merchant-escrow/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantId: offer.merchantId, takerId, fiatAmt: fiatNum,
          payMethod, recipientName, recipientAccount,
        }),
      });
      const data = await res.json() as { ok: boolean; trade?: EscrowTrade; error?: string };
      if (!data.ok) { setError(data.error ?? "Failed to accept offer"); return; }
      onTradeCreated(data.trade!);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${BORDER}` }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10"
          style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderColor: BORDER }}>
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>
              Sell {offer.asset} to {offer.merchantName}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--subtle)" }}>
              Rate locked until {rateExpiry} · Fee {offer.feePct}%
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/5">
            <X size={16} style={{ color: "#64748b" }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Rate summary */}
          <div className="flex items-center justify-between p-3.5 rounded-xl" style={{ background: CARD_H }}>
            <div className="flex items-center gap-2">
              <CryptoIcon symbol={offer.asset} size={20} />
              <div>
                <div className="text-xs font-semibold" style={{ color: "var(--subtle)" }}>{offer.asset}</div>
                <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{offer.network}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-mono font-bold" style={{ color: GREEN }}>
                {fmtFiat(offer.ratePerUnit, offer.fiatCurrency)}
              </div>
              <div className="text-[10px]" style={{ color: "var(--subtle)" }}>per {offer.asset}</div>
            </div>
          </div>

          {/* Fiat amount input */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--subtle)" }}>
              You receive ({offer.fiatCurrency})
            </label>
            <div className="flex rounded-xl overflow-hidden border"
              style={{ borderColor: rangeErr ? "#f87171" : BORDER }}>
              <input
                type="number" value={fiatAmt} onChange={e => setFiatAmt(e.target.value)}
                placeholder={`${offer.minFiat} – ${offer.maxFiat}`}
                className="flex-1 bg-transparent px-3.5 py-2.5 text-sm font-mono outline-none"
                style={{ color: "var(--ink)" }} />
              <div className="flex items-center px-3 text-sm font-semibold border-l"
                style={{ borderColor: BORDER, background: CARD_H, color: "var(--subtle)" }}>
                {offer.fiatCurrency}
              </div>
            </div>
            {rangeErr && <p className="text-[11px] mt-1" style={{ color: "#f87171" }}>{rangeErr}</p>}
          </div>

          {/* Breakdown */}
          {fiatNum > 0 && (
            <div className="space-y-1.5 p-3 rounded-xl" style={{ background: CARD_H }}>
              <div className="flex justify-between text-xs">
                <span style={{ color: "#64748b" }}>You send</span>
                <span className="font-mono font-semibold" style={{ color: "var(--ink)" }}>
                  {fmtCrypto(cryptoAmt, offer.asset)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "#64748b" }}>Gross payout</span>
                <span className="font-mono" style={{ color: "var(--ink)" }}>
                  {fmtFiat(fiatNum, offer.fiatCurrency)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "#64748b" }}>Fee ({offer.feePct}%)</span>
                <span className="font-mono" style={{ color: "#f87171" }}>
                  − {fmtFiat(fiatFee, offer.fiatCurrency)}
                </span>
              </div>
              <div className="flex justify-between text-xs pt-1 border-t" style={{ borderColor: BORDER_S }}>
                <span className="font-semibold" style={{ color: "var(--subtle)" }}>Net payout</span>
                <span className="font-mono font-bold" style={{ color: GREEN }}>
                  {fmtFiat(fiatNet, offer.fiatCurrency)}
                </span>
              </div>
            </div>
          )}

          {/* Payment method */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--subtle)" }}>Payment method</label>
            <div className="flex flex-wrap gap-1.5">
              {offer.payMethods.map(m => (
                <button key={m} onClick={() => setPayMethod(m)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: payMethod === m ? "rgba(59,130,246,0.2)" : CARD_H,
                    color: payMethod === m ? BLUE : "#64748b",
                    border: `1px solid ${payMethod === m ? BORDER : BORDER_S}`,
                  }}>
                  {m.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient details */}
          <div className="space-y-2">
            <label className="text-xs font-medium block" style={{ color: "var(--subtle)" }}>
              Your account details (payout destination)
            </label>
            <input
              value={recipientName} onChange={e => setName(e.target.value)}
              placeholder="Account / wallet name"
              className="w-full bg-transparent px-3.5 py-2.5 rounded-xl text-sm outline-none"
              style={{ color: "var(--ink)", border: `1px solid ${BORDER_S}` }} />
            <input
              value={recipientAccount} onChange={e => setAcct(e.target.value)}
              placeholder="Account number / wallet address"
              className="w-full bg-transparent px-3.5 py-2.5 rounded-xl text-sm outline-none font-mono"
              style={{ color: "var(--ink)", border: `1px solid ${BORDER_S}` }} />
            <p className="text-[10px]" style={{ color: "var(--subtle)" }}>
              Account details are used solely for payout. They are never stored in AI logs or shared with other users.
            </p>
          </div>

          {/* Escrow security note */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl"
            style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
            <Lock size={13} className="text-green-400 mt-0.5 shrink-0" />
            <p className="text-[11px]" style={{ color: "#64748b" }}>
              <strong style={{ color: "var(--ink)" }}>Escrow protected.</strong> Merchant funds are verified and locked
              before this trade is created. Payout only occurs after blockchain and payment verification.
              This system does not release funds based on screenshots or unconfirmed claims.
            </p>
          </div>

          {/* Terms */}
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              className="w-3.5 h-3.5 accent-green-500 shrink-0 mt-0.5" />
            <span className="text-xs" style={{ color: "#64748b" }}>
              I agree to the Element Settlement trading terms and confirm the payout details above are correct
            </span>
          </label>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl"
              style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}>
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
            </div>
          )}

          <button onClick={() => void handleAccept()} disabled={!isValid}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: isValid ? `linear-gradient(135deg,${GREEN},#16a34a)` : "rgba(100,116,139,0.12)", color: isValid ? "#fff" : "#475569" }}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading ? "Reserving escrow…" : "Confirm — Accept Offer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Trade Status Tracker ─────────────────────────────────────────────────────

function TradeStatusTracker({ tradeId, onClose }: { tradeId: string; onClose: () => void }) {
  const [trade, setTrade] = useState<EscrowTrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick nowMs every second for expiry comparisons
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000); // eslint-disable-line react-compiler/react-compiler
    return () => clearInterval(t);
  }, []);

  const fetchTrade = useCallback(async () => {
    try {
      const res = await fetch(`/api/merchant-escrow/trade/${tradeId}`);
      const data = await res.json() as EscrowTrade;
      setTrade(data);
      setLoading(false);
      if (TERMINAL.includes(data.status)) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    } catch { /* keep polling */ }
  }, [tradeId]);

  useEffect(() => { // eslint-disable-line react-compiler/react-compiler
    void fetchTrade();
    pollRef.current = setInterval(() => { void fetchTrade(); }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchTrade]);

  if (loading) return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.8)" }}>
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={32} className="animate-spin text-blue-400" />
        <p className="text-sm" style={{ color: "var(--subtle)" }}>Loading trade…</p>
      </div>
    </div>
  );

  if (!trade) return null;

  const cfg = STATUS_CFG[trade.status];
  const step = stepIndex(trade.status);
  const rateLockStr = useMemo(() =>
    trade ? String(new Date(trade.rateLockExpiresAt).toLocaleTimeString()) : "",
  [trade]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: `1px solid ${BORDER}` }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: cfg.bg, color: cfg.color }}>
              {cfg.icon}
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>{cfg.label}</div>
              <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                Trade #{trade.id.split("-").pop()} · {fmtAgo(trade.createdAt)}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/5">
            <X size={16} style={{ color: "#64748b" }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Progress stepper */}
          <div className="flex items-center justify-between relative">
            {["Accepted", "Reserved", "Verifying", "Processing", "Done"].map((label, i) => {
              const done   = i < step;
              const active = i === step && !["under_review","failed","cancelled"].includes(trade.status);
              const err    = i === step && ["under_review","failed"].includes(trade.status);
              const color  = err ? "#f87171" : done || active ? GREEN : "#334155";
              return (
                <div key={label} className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${active ? "animate-pulse" : ""}`}
                    style={{ background: err ? "rgba(248,113,113,0.2)" : done || active ? "rgba(34,197,94,0.2)" : "rgba(51,65,85,0.5)", color }}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span className="text-[9px] text-center" style={{ color: done || active ? "#94a3b8" : "#334155" }}>
                    {label}
                  </span>
                  {i < 4 && (
                    <div className="absolute top-3 left-0 right-0 flex" style={{ zIndex: -1 }}>
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div key={j} className="flex-1 h-px mx-3" style={{ background: j < step ? GREEN : "#1e293b" }} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Trade summary */}
          <div className="space-y-2 p-3.5 rounded-xl" style={{ background: CARD_H }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: "#64748b" }}>Asset</span>
              <span className="font-semibold flex items-center gap-1" style={{ color: "var(--ink)" }}>
                <CryptoIcon symbol={trade.asset} size={14} />
                {fmtCrypto(trade.cryptoAmt, trade.asset)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "#64748b" }}>Rate</span>
              <span className="font-mono" style={{ color: "var(--ink)" }}>
                {fmtFiat(trade.rateUsed, trade.fiatCurrency)} / {trade.asset}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "#64748b" }}>Gross payout</span>
              <span className="font-mono" style={{ color: "var(--ink)" }}>{fmtFiat(trade.fiatGross, trade.fiatCurrency)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: "#64748b" }}>Fee</span>
              <span className="font-mono" style={{ color: "#f87171" }}>− {fmtFiat(trade.fiatFee, trade.fiatCurrency)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t" style={{ borderColor: BORDER_S }}>
              <span className="font-semibold" style={{ color: "var(--subtle)" }}>Net payout</span>
              <span className="font-mono font-bold" style={{ color: GREEN }}>{fmtFiat(trade.fiatNet, trade.fiatCurrency)}</span>
            </div>
          </div>

          {/* Rate lock expiry */}
          {nowMs < trade.rateLockExpiresAt && !TERMINAL.includes(trade.status) && (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: AMBER }}>
              <Clock size={12} />
              Rate locked until {rateLockStr}
            </div>
          )}

          {/* Payout reference */}
          {trade.payoutRef && (
            <div className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
              <div>
                <div className="text-[10px] font-semibold mb-0.5" style={{ color: "#4ade80" }}>Payout Reference</div>
                <div className="text-xs font-mono" style={{ color: "var(--ink)" }}>{trade.payoutRef}</div>
              </div>
              <button onClick={() => {
                void navigator.clipboard.writeText(trade.payoutRef!).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }} className="p-1.5 rounded-lg hover:bg-white/5">
                <Copy size={13} style={{ color: copied ? "#4ade80" : "#475569" }} />
              </button>
            </div>
          )}

          {/* Failure reason */}
          {trade.failReason && (
            <div className="flex items-start gap-2 p-3 rounded-xl"
              style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
              <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-semibold mb-0.5" style={{ color: "#f87171" }}>Error</div>
                <div className="text-[11px]" style={{ color: "#fca5a5" }}>{trade.failReason}</div>
              </div>
            </div>
          )}

          {/* Under review notice */}
          {trade.status === "under_review" && (
            <div className="flex items-start gap-2 p-3 rounded-xl"
              style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)" }}>
              <Info size={13} className="text-orange-400 mt-0.5 shrink-0" />
              <p className="text-[11px]" style={{ color: "#fdba74" }}>
                This trade has been flagged for manual review. Our team will investigate within 24 hours.
                No funds have been released. Contact support with trade ID #{trade.id.split("-").pop()}.
              </p>
            </div>
          )}

          {/* Audit trail */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#334155" }}>
              Audit trail
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {[...trade.audit].reverse().map((e, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: BLUE }} />
                  <div>
                    <div className="text-[10px] font-medium" style={{ color: "var(--subtle)" }}>
                      {e.event.replace(/_/g, " ")}
                      {" "}<span style={{ color: "#334155" }}>· {fmtAgo(e.ts)}</span>
                    </div>
                    {e.detail && <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{e.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Close button */}
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: CARD_H, color: "var(--subtle)", border: `1px solid ${BORDER_S}` }}>
            {TERMINAL.includes(trade.status) ? "Close" : "Minimize"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main exported component ──────────────────────────────────────────────────

export function TopOffersMerchantSection({ takerId }: { takerId: string }) {
  const [merchants, setMerchants]         = useState<MerchantOffer[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState("");
  const [selectedOffer, setSelectedOffer] = useState<MerchantOffer | null>(null);
  const [activeTrade, setActiveTrade]     = useState<EscrowTrade | null>(null);
  const [filterAsset, setFilterAsset]     = useState<string>("all");

  const fetchMerchants = useCallback(async () => {
    try {
      const res = await fetch("/api/merchant-escrow/merchants");
      const data = await res.json() as MerchantOffer[];
      setMerchants(Array.isArray(data) ? data : []);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchMerchants(); }, [fetchMerchants]); // eslint-disable-line react-compiler/react-compiler

  const assets = ["all", ...Array.from(new Set(merchants.map(m => m.asset)))];
  const visible = filterAsset === "all" ? merchants : merchants.filter(m => m.asset === filterAsset);

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Star size={14} className="text-yellow-400 fill-yellow-400" />
            <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>Top Offer Merchants</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: "rgba(251,191,36,0.15)", color: AMBER }}>
              {merchants.length} active
            </span>
          </div>
          <div className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: "var(--subtle)" }}>
            <Lock size={10} />
            All offers backed by verified escrow deposits
          </div>
        </div>
        <button onClick={() => void fetchMerchants()} className="p-1.5 rounded-xl hover:bg-white/5">
          <RefreshCw size={14} style={{ color: "var(--subtle)" }} />
        </button>
      </div>

      {/* Asset filter pills */}
      {assets.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {assets.map(a => (
            <button key={a} onClick={() => setFilterAsset(a)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-all"
              style={{
                background: filterAsset === a ? "rgba(59,130,246,0.2)" : CARD_H,
                border: `1px solid ${filterAsset === a ? BORDER : BORDER_S}`,
                color: filterAsset === a ? BLUE : "#475569",
              }}>
              {a !== "all" && <CryptoIcon symbol={a} size={12} />}
              {a === "all" ? "All" : a}
            </button>
          ))}
        </div>
      )}

      {/* Trust badges */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {[
          { icon: <Shield size={10} />,       label: "Verified Escrow" },
          { icon: <Lock size={10} />,         label: "Atomic Reserve"  },
          { icon: <TrendingUp size={10} />,   label: "Live Rates"      },
          { icon: <ExternalLink size={10} />, label: "On-Chain Proof"  },
        ].map(b => (
          <div key={b.label} className="flex items-center gap-1 px-2 py-0.5 rounded-full shrink-0 text-[10px] font-medium"
            style={{ background: "rgba(34,197,94,0.08)", color: GREEN, border: "1px solid rgba(34,197,94,0.15)" }}>
            {b.icon}{b.label}
          </div>
        ))}
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin" style={{ color: BLUE }} />
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl flex items-center gap-2"
          style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}>
          <AlertTriangle size={13} className="text-red-400 shrink-0" />
          <span className="text-xs" style={{ color: "#f87171" }}>Could not load merchants: {error}</span>
        </div>
      )}
      {!loading && !error && visible.length === 0 && (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: "var(--subtle)" }}>No active merchant offers for {filterAsset}</p>
        </div>
      )}
      {visible.map(offer => (
        <MerchantOfferCard key={offer.merchantId} offer={offer} onAccept={setSelectedOffer} />
      ))}

      {/* Accept modal */}
      {selectedOffer && !activeTrade && (
        <AcceptOfferModal
          offer={selectedOffer}
          takerId={takerId}
          onClose={() => setSelectedOffer(null)}
          onTradeCreated={t => { setActiveTrade(t); setSelectedOffer(null); }}
        />
      )}

      {/* Trade tracker */}
      {activeTrade && (
        <TradeStatusTracker
          tradeId={activeTrade.id}
          onClose={() => setActiveTrade(null)}
        />
      )}
    </div>
  );
}
