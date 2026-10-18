/**
 * PERPX World-Class P2P Panel
 * Full crypto↔fiat marketplace: escrow state machine, 28 fiat currencies,
 * 30+ payment methods, live FX rates, merchant rankings.
 */
import { useState, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";
import {
  Search, Shield, Zap, Clock, CheckCircle2, AlertTriangle,
  X, Bell, Lock, TrendingUp, Star, Plus,
} from "lucide-react";
import { useP2PStore, PAY_METHODS, FIAT_CURRENCIES } from "@/store/p2pStore";
import type {
  P2PAdvertisement, P2PTrade, P2PPayMethod,
  P2POrderSide, P2POrderStatus, P2PMerchant, P2PAsset,
} from "@/store/p2pStore";
import { usePriceStore } from "@/store/priceStore";
import { useWalletStore } from "@/store/walletStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtAgo(ts: number, now = Date.now()): string {
  const s = Math.floor((now - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function fmtFiat(n: number, cur: string) {
  try { return n.toLocaleString("en-US", { style: "currency", currency: cur, maximumFractionDigits: 0 }); }
  catch { return `${cur} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`; }
}
function fmtCrypto(n: number, asset: string) {
  const d = asset === "BTC" ? 6 : asset === "ETH" ? 4 : 2;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d })} ${asset}`;
}

// ─── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG: Record<P2POrderStatus, { label: string; color: string; bg: string }> = {
  open:       { label: "Open",       color: "#22c55e", bg: "rgba(34,197,94,0.1)"    },
  matched:    { label: "Matched",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)"   },
  escrowed:   { label: "Escrowed",   color: "#fbbf24", bg: "rgba(251,191,36,0.1)"   },
  paid:       { label: "Paid",       color: "#a78bfa", bg: "rgba(167,139,250,0.1)"  },
  verifying:  { label: "Verifying",  color: "#fb923c", bg: "rgba(251,146,60,0.1)"   },
  released:   { label: "Released",   color: "#4ade80", bg: "rgba(74,222,128,0.1)"   },
  completed:  { label: "Completed",  color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
  cancelled:  { label: "Cancelled",  color: "#f87171", bg: "rgba(248,113,113,0.08)" },
  expired:    { label: "Expired",    color: "#94a3b8", bg: "rgba(148,163,184,0.08)" },
  disputed:   { label: "Disputed",   color: "#fb923c", bg: "rgba(251,146,60,0.1)"   },
};

function StatusBadge({ status }: { status: P2POrderStatus }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.open;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: c.bg, color: c.color }}>{c.label}</span>
  );
}

function PayBadge({ method }: { method: P2PPayMethod }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ background: `${method.color}18`, color: method.color, border: `1px solid ${method.color}28` }}>
      {method.icon} {method.label}
    </span>
  );
}

function MerchantInfo({ merchant, nowMs, size = "sm" }: { merchant: P2PMerchant; nowMs: number; size?: "sm" | "md" }) {
  const isOnline = nowMs - merchant.onlineAt < 600000;
  return (
    <div className={`flex items-center gap-${size === "md" ? "2" : "1.5"}`}>
      <div className="relative shrink-0">
        <div className={`${size === "md" ? "w-8 h-8 text-sm" : "w-6 h-6 text-xs"} rounded-full flex items-center justify-center font-bold`}
          style={{ background: "var(--surface-high)", color: "var(--ink)" }}>
          {merchant.avatar}
        </div>
        <span className={`absolute -bottom-0.5 -right-0.5 ${isOnline ? "bg-green-500" : "bg-gray-500"} rounded-full ${size === "md" ? "w-2.5 h-2.5" : "w-2 h-2"} border border-[var(--surface)]`} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className={`${size === "md" ? "text-xs" : "text-[11px]"} font-semibold truncate`} style={{ color: "var(--ink)" }}>
            {merchant.name}
          </span>
          {merchant.verified && <Shield size={size === "md" ? 11 : 9} className="text-blue-400 shrink-0" />}
        </div>
        <div className="text-[10px] flex items-center gap-1" style={{ color: "var(--ink-dim)" }}>
          <Star size={8} className="fill-yellow-400 text-yellow-400 shrink-0" />
          {merchant.positive.toFixed(1)}% · {merchant.completedTrades.toLocaleString()} trades
        </div>
      </div>
    </div>
  );
}

// ─── Ad Row ────────────────────────────────────────────────────────────────────
function AdRow({ ad, merchantMap, nowMs, onSelect }: {
  ad: P2PAdvertisement;
  merchantMap: Record<string, P2PMerchant>;
  nowMs: number;
  onSelect: (ad: P2PAdvertisement) => void;
}) {
  const merchant = merchantMap[ad.merchantId];
  if (!merchant) return null;
  const fiat = FIAT_CURRENCIES.find(f => f.code === ad.fiatCurrency);
  return (
    <div
      className="grid items-center gap-3 px-4 py-3 border-b cursor-pointer transition-colors hover:bg-[var(--surface-high)]"
      style={{ borderColor: "var(--border)", gridTemplateColumns: "2fr 1.5fr 1.5fr 2fr auto" }}
      onClick={() => onSelect(ad)}>
      <MerchantInfo merchant={merchant} nowMs={nowMs} />
      <div>
        <div className="text-sm font-mono font-bold" style={{ color: ad.side === "sell" ? "#22c55e" : "#f87171" }}>
          {fiat?.symbol}{ad.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        </div>
        <div className="text-[10px]" style={{ color: "var(--ink-dim)" }}>
          {ad.premiumPct >= 0 ? "+" : ""}{ad.premiumPct.toFixed(2)}% market
        </div>
      </div>
      <div>
        <div className="text-xs font-mono" style={{ color: "var(--ink)" }}>
          {fmtFiat(ad.minFiat, ad.fiatCurrency)} – {fmtFiat(ad.maxFiat, ad.fiatCurrency)}
        </div>
        <div className="text-[10px]" style={{ color: "var(--ink-dim)" }}>
          {ad.availableAmt.toLocaleString()} {ad.asset} avail.
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {ad.payMethods.slice(0, 2).map(m => <PayBadge key={m.id} method={m} />)}
        {ad.payMethods.length > 2 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface-high)", color: "var(--ink-dim)" }}>
            +{ad.payMethods.length - 2}
          </span>
        )}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onSelect(ad); }}
        className="px-3 py-1.5 rounded text-xs font-bold transition-all active:scale-95 whitespace-nowrap"
        style={{ background: ad.side === "sell" ? "#22c55e" : "#f87171", color: "#000" }}>
        {ad.side === "sell" ? "Buy" : "Sell"}
      </button>
    </div>
  );
}

// ─── Order Modal ───────────────────────────────────────────────────────────────
function OrderModal({ ad, merchantMap, nowMs, onClose }: {
  ad: P2PAdvertisement;
  merchantMap: Record<string, P2PMerchant>;
  nowMs: number;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const createTrade = useP2PStore(s => s.createTrade);
  const debit  = useWalletStore(s => s.debit);
  const credit = useWalletStore(s => s.credit);
  const merchant = merchantMap[ad.merchantId];
  const fiat = FIAT_CURRENCIES.find(f => f.code === ad.fiatCurrency);

  const [fiatAmt, setFiatAmt] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<P2PPayMethod>(ad.payMethods[0]);
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<"form" | "pending" | "escrowed">("form");

  const cryptoAmt = useMemo(() => {
    const f = parseFloat(fiatAmt);
    return f && ad.price ? f / ad.price : 0;
  }, [fiatAmt, ad.price]);

  const fiatNum = parseFloat(fiatAmt) || 0;
  const rangeErr = fiatNum > 0 && (fiatNum < ad.minFiat || fiatNum > ad.maxFiat)
    ? `${fmtFiat(ad.minFiat, ad.fiatCurrency)} – ${fmtFiat(ad.maxFiat, ad.fiatCurrency)}`
    : "";
  const isValid = fiatNum >= ad.minFiat && fiatNum <= ad.maxFiat && agreed && !!address;

  function handleConfirm() {
    if (!address || !isValid) return;
    setStep("pending");
    setTimeout(() => {
      createTrade(ad.id, cryptoAmt, selectedMethod.id, address);
      // If buying crypto: lock seller's escrow (debit USDC as collateral)
      // If selling crypto: debit the asset from wallet into escrow
      if (ad.side === "sell") {
        // User is buying — debit USDC as collateral for escrow
        debit("USDC", fiatNum, {
          type: "escrow_lock",
          note: `P2P escrow — buy ${ad.asset}`,
        });
      } else {
        // User is selling — debit the crypto from wallet into escrow
        debit(ad.asset, cryptoAmt, {
          type: "escrow_lock",
          note: `P2P escrow — sell ${ad.asset}`,
        });
      }
      setStep("escrowed");
    }, 900);
  }

  // credit is used when trade releases escrow — exported via verifyAndRelease in store
  void credit;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: ad.side === "sell" ? "#22c55e" : "#f87171" }} />
            <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>
              {ad.side === "sell" ? "Buy" : "Sell"} {ad.asset} · {fiat?.flag} {ad.fiatCurrency}
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg transition-colors hover:bg-[var(--surface-high)]">
            <X size={16} style={{ color: "var(--ink-dim)" }} />
          </button>
        </div>

        {step === "form" && merchant && (
          <div className="p-5 space-y-4">
            {/* Merchant + price */}
            <div className="flex items-center justify-between p-3.5 rounded-xl" style={{ background: "var(--surface-high)" }}>
              <MerchantInfo merchant={merchant} nowMs={nowMs} size="md" />
              <div className="text-right">
                <div className="text-lg font-mono font-bold" style={{ color: ad.side === "sell" ? "#22c55e" : "#f87171" }}>
                  {fiat?.symbol}{ad.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10px]" style={{ color: "var(--ink-dim)" }}>per {ad.asset}</div>
              </div>
            </div>

            {/* Fiat input */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--ink-dim)" }}>
                {ad.side === "sell" ? "I want to pay" : "I want to receive"}
              </label>
              <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: rangeErr ? "#f87171" : "var(--border)" }}>
                <input type="number" value={fiatAmt} onChange={e => setFiatAmt(e.target.value)}
                  placeholder={`${ad.minFiat}–${ad.maxFiat}`}
                  className="flex-1 bg-transparent px-3.5 py-2.5 text-sm font-mono outline-none"
                  style={{ color: "var(--ink)" }} />
                <div className="flex items-center px-3 text-sm font-semibold border-l"
                  style={{ borderColor: "var(--border)", background: "var(--surface-high)", color: "var(--ink)" }}>
                  {fiat?.flag} {ad.fiatCurrency}
                </div>
              </div>
              {rangeErr && <p className="text-[11px] mt-1 text-red-400">Limits: {rangeErr}</p>}
            </div>

            {/* Crypto preview */}
            {cryptoAmt > 0 && (
              <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "var(--surface-high)" }}>
                <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  {ad.side === "sell" ? "You receive" : "You send"}
                </span>
                <span className="text-sm font-mono font-bold" style={{ color: "var(--ink)" }}>
                  {fmtCrypto(cryptoAmt, ad.asset)}
                </span>
              </div>
            )}

            {/* Payment method */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--ink-dim)" }}>Payment method</label>
              <div className="flex flex-wrap gap-1.5">
                {ad.payMethods.map(m => (
                  <button key={m.id} onClick={() => setSelectedMethod(m)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: selectedMethod.id === m.id ? `${m.color}20` : "var(--surface-high)",
                      color: selectedMethod.id === m.id ? m.color : "var(--ink-dim)",
                      border: `1px solid ${selectedMethod.id === m.id ? m.color : "var(--border)"}`,
                    }}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Terms */}
            {ad.terms && (
              <div className="p-3 rounded-xl text-xs" style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
                <span className="font-semibold text-yellow-400">Merchant terms: </span>
                <span style={{ color: "var(--ink-dim)" }}>{ad.terms}</span>
              </div>
            )}

            {/* Escrow badge */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl"
              style={{ background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.15)" }}>
              <Lock size={13} className="text-green-400 mt-0.5 shrink-0" />
              <p className="text-[11px]" style={{ color: "var(--ink-dim)" }}>
                Seller's crypto will be <strong style={{ color: "var(--ink)" }}>locked in escrow</strong> when you confirm.
                Funds release only after payment verification. Never pay outside this platform.
              </p>
            </div>

            {/* Agree + CTA */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                className="w-3.5 h-3.5 accent-green-500 shrink-0" />
              <span className="text-xs" style={{ color: "var(--ink-dim)" }}>
                I agree to P2P trading terms and will complete payment within the time limit
              </span>
            </label>
            {!address
              ? <div className="flex justify-center pt-1"><ConnectKitButton /></div>
              : (
                <button onClick={handleConfirm} disabled={!isValid}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                  style={{ background: ad.side === "sell" ? "#22c55e" : "#f87171", color: "#000" }}>
                  Confirm {ad.side === "sell" ? "Buy" : "Sell"} Order
                </button>
              )}
          </div>
        )}

        {step === "pending" && (
          <div className="p-10 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Locking escrow…</p>
            <p className="text-xs text-center max-w-xs" style={{ color: "var(--ink-dim)" }}>
              Seller's {ad.asset} is being secured in the escrow contract.
            </p>
          </div>
        )}

        {step === "escrowed" && (
          <div className="p-7 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(34,197,94,0.1)" }}>
              <Lock size={30} className="text-green-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-bold mb-1" style={{ color: "var(--ink)" }}>Escrow Locked ✓</p>
              <p className="text-sm" style={{ color: "var(--ink-dim)" }}>
                {fmtCrypto(cryptoAmt, ad.asset)} secured in escrow
              </p>
            </div>
            <div className="w-full p-3.5 rounded-xl" style={{ background: "var(--surface-high)" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--ink)" }}>Next step</p>
              <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
                Send <strong style={{ color: "var(--ink)" }}>{fmtFiat(fiatNum, ad.fiatCurrency)}</strong> via{" "}
                <strong style={{ color: "var(--ink)" }}>{selectedMethod.label}</strong> to the merchant,
                then tap "I've Paid" in My Orders.
              </p>
            </div>
            <button onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-bold"
              style={{ background: "#22c55e", color: "#000" }}>
              View My Orders
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Trade Card ────────────────────────────────────────────────────────────────
function TradeCard({ trade, nowMs, onMarkPaid, onCancel, onRelease, onDispute }: {
  trade: P2PTrade;
  nowMs: number;
  onMarkPaid: (id: string) => void;
  onCancel:   (id: string) => void;
  onRelease:  (id: string) => void;
  onDispute:  (id: string) => void;
}) {
  const fiat = FIAT_CURRENCIES.find(f => f.code === trade.fiatCurrency);
  const remaining = Math.max(0, trade.expiresAt - nowMs);
  const remMin = Math.floor(remaining / 60000);
  const remSec = Math.floor((remaining % 60000) / 1000);
  const urgent  = remaining > 0 && remaining < 300000;

  return (
    <div className="rounded-xl overflow-hidden border mb-3"
      style={{ borderColor: "var(--border)", background: "var(--surface-high)" }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono" style={{ color: "var(--ink-dim)" }}>
            #{trade.id.slice(-6).toUpperCase()}
          </span>
          <StatusBadge status={trade.status} />
          <span className={`text-xs font-bold ${trade.side === "buy" ? "text-green-400" : "text-red-400"}`}>
            {trade.side === "buy" ? "BUY" : "SELL"} {trade.asset}
          </span>
        </div>
        {(trade.status === "escrowed" || trade.status === "matched") && remaining > 0 && (
          <span className={`text-xs font-mono font-bold ${urgent ? "text-red-400 animate-pulse" : ""}`}
            style={{ color: urgent ? undefined : "var(--ink-dim)" }}>
            ⏱ {remMin}:{remSec.toString().padStart(2, "0")}
          </span>
        )}
      </div>
      <div className="px-4 py-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <div style={{ color: "var(--ink-dim)" }}>Crypto</div>
          <div className="font-mono font-semibold mt-0.5" style={{ color: "var(--ink)" }}>
            {fmtCrypto(trade.cryptoAmt, trade.asset)}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--ink-dim)" }}>Fiat</div>
          <div className="font-mono font-semibold mt-0.5" style={{ color: "var(--ink)" }}>
            {fiat?.flag} {fmtFiat(trade.fiatAmt, trade.fiatCurrency)}
          </div>
        </div>
        <div>
          <div style={{ color: "var(--ink-dim)" }}>Via</div>
          <div className="font-semibold mt-0.5" style={{ color: "var(--ink)" }}>
            {trade.payMethod.icon} {trade.payMethod.label}
          </div>
        </div>
      </div>
      {(trade.status === "escrowed" || trade.status === "paid") && (
        <div className="px-4 pb-3 flex gap-2">
          {trade.status === "escrowed" && <>
            <button onClick={() => onMarkPaid(trade.id)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: "#22c55e", color: "#000" }}>✓ I've Paid</button>
            <button onClick={() => onCancel(trade.id)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-dim)" }}>
              Cancel
            </button>
          </>}
          {trade.status === "paid" && <>
            <button onClick={() => onRelease(trade.id)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: "#22c55e", color: "#000" }}>Release Crypto</button>
            <button onClick={() => onDispute(trade.id)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold"
              style={{ background: "var(--surface)", border: "1px solid #f87171", color: "#f87171" }}>
              Dispute
            </button>
          </>}
        </div>
      )}
      {trade.status === "disputed" && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 p-2 rounded-lg text-xs"
            style={{ background: "rgba(251,146,60,0.1)" }}>
            <AlertTriangle size={11} className="text-orange-400 shrink-0" />
            <span style={{ color: "#fb923c" }}>Under review — team will respond within 24h</span>
          </div>
        </div>
      )}
      {trade.status === "completed" && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 p-2 rounded-lg text-xs"
            style={{ background: "rgba(34,197,94,0.1)" }}>
            <CheckCircle2 size={11} className="text-green-400 shrink-0" />
            <span style={{ color: "#22c55e" }}>
              Completed {fmtAgo(trade.completedAt ?? trade.createdAt)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function P2PPanel() {
  const { address } = useAccount();
  const tickers = usePriceStore(s => s.tickers);

  const ads             = useP2PStore(s => s.ads);
  const merchants       = useP2PStore(s => s.merchants);
  const trades          = useP2PStore(s => s.trades);
  const notifications   = useP2PStore(s => s.notifications);
  const fxRates         = useP2PStore(s => s.fxRates);
  const selectedAsset   = useP2PStore(s => s.selectedAsset);
  const selectedFiat    = useP2PStore(s => s.selectedFiat);
  const selectedSide    = useP2PStore(s => s.selectedSide);
  const setSelectedAsset = useP2PStore(s => s.setSelectedAsset);
  const setSelectedFiat  = useP2PStore(s => s.setSelectedFiat);
  const setSelectedSide  = useP2PStore(s => s.setSelectedSide);
  const confirmPayment   = useP2PStore(s => s.confirmPayment);
  const verifyAndRelease = useP2PStore(s => s.verifyAndRelease);
  const cancelTrade      = useP2PStore(s => s.cancelTrade);
  const openDispute      = useP2PStore(s => s.openDispute);
  const markNotifsRead   = useP2PStore(s => s.markNotifsRead);

  const [search, setSearch]             = useState("");
  const [filterMethod, setFilterMethod] = useState("all");
  const [activeTab, setActiveTab]       = useState<"offers" | "myOrders" | "post">("offers");
  const [selectedAd, setSelectedAd]     = useState<P2PAdvertisement | null>(null);
  const [showNotifs, setShowNotifs]     = useState(false);
  const [nowMs, setNowMs]               = useState(() => Date.now());

  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

  // Timer tick for countdowns + fmtAgo
  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // Filtered ads
  const filteredAds = useMemo(() => {
    // "sell" side means user wants to BUY crypto → show merchant SELL ads
    const merchantSide: P2POrderSide = selectedSide === "sell" ? "buy" : "sell";
    return ads.filter(ad => {
      if (ad.status !== "active") return false;
      if (ad.side !== merchantSide) return false;
      if (ad.asset !== selectedAsset) return false;
      if (ad.fiatCurrency !== selectedFiat) return false;
      if (filterMethod !== "all" && !ad.payMethods.find(m => m.id === filterMethod)) return false;
      if (search) {
        const m = merchants[ad.merchantId];
        if (!m?.name.toLowerCase().includes(search.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => b.score - a.score);
  }, [ads, merchants, selectedSide, selectedAsset, selectedFiat, filterMethod, search]);

  // My trades
  const myTrades = useMemo(() =>
    trades.filter(t => t.takerId === (address ?? "") || t.merchantId === (address ?? ""))
      .sort((a, b) => b.createdAt - a.createdAt),
    [trades, address]);

  const activeTrades  = myTrades.filter(t => !["completed", "cancelled", "expired"].includes(t.status));
  const historyTrades = myTrades.filter(t =>  ["completed", "cancelled", "expired"].includes(t.status));

  const availPayMethods = useMemo(() => {
    const fi = FIAT_CURRENCIES.find(f => f.code === selectedFiat);
    return PAY_METHODS.filter(m => !m.country || m.country === fi?.country || m.country === "EU");
  }, [selectedFiat]);

  const btcPrice = tickers["BTC-USD"]?.lastPrice ?? 97000;
  const ASSETS: P2PAsset[] = ["USDT", "USDC", "BTC", "ETH", "SOL", "BNB", "XRP"];
  const TOP_FIATS = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR", "INR", "AED", "BRL"];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Buy / Sell toggle */}
          <div className="flex rounded-lg overflow-hidden border text-xs" style={{ borderColor: "var(--border)" }}>
            {(["sell", "buy"] as P2POrderSide[]).map(s => (
              <button key={s} onClick={() => setSelectedSide(s)}
                className="px-3 py-1.5 font-semibold transition-colors"
                style={{
                  background: selectedSide === s
                    ? (s === "sell" ? "#22c55e" : "#f87171")
                    : "var(--surface-high)",
                  color: selectedSide === s ? "#000" : "var(--ink-dim)",
                }}>
                {s === "sell" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
          {/* Asset tabs */}
          <div className="flex gap-1">
            {ASSETS.map(a => (
              <button key={a} onClick={() => setSelectedAsset(a)}
                className="px-2 py-1 rounded text-xs font-semibold transition-colors"
                style={{
                  background: selectedAsset === a ? "var(--accent)" : "var(--surface-high)",
                  color: selectedAsset === a ? "#fff" : "var(--ink-dim)",
                }}>
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="relative p-1.5 rounded-lg" style={{ background: "var(--surface-high)" }}
            onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) markNotifsRead(); }}>
            <Bell size={14} style={{ color: "var(--ink-dim)" }} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                style={{ background: "#f87171", color: "#fff" }}>{unreadCount}</span>
            )}
          </button>
          <button onClick={() => setActiveTab("post")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "var(--accent)", color: "#fff" }}>
            <Plus size={11} /> Post Ad
          </button>
        </div>
      </div>

      {/* Notifications dropdown */}
      {showNotifs && (
        <div className="absolute right-4 z-50 w-72 rounded-xl shadow-2xl overflow-hidden"
          style={{ top: "80px", background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>Notifications</span>
            <button onClick={() => setShowNotifs(false)}><X size={14} style={{ color: "var(--ink-dim)" }} /></button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.slice(0, 8).map(n => (
              <div key={n.id} className={`px-4 py-3 border-b ${!n.read ? "bg-[rgba(99,102,241,0.04)]" : ""}`}
                style={{ borderColor: "var(--border)" }}>
                <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{n.title}</div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--ink-dim)" }}>{n.body}</div>
                <div className="text-[10px] mt-1" style={{ color: "var(--ink-dim)" }}>{fmtAgo(n.ts)}</div>
              </div>
            ))}
            {notifications.length === 0 && (
              <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--ink-dim)" }}>No notifications</div>
            )}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b px-4 gap-0 shrink-0" style={{ borderColor: "var(--border)" }}>
        {(["offers", "myOrders"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className="px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors"
            style={{
              borderColor: activeTab === t ? "var(--accent)" : "transparent",
              color: activeTab === t ? "var(--accent)" : "var(--ink-dim)",
            }}>
            {t === "offers" ? "Offers" : `My Orders${activeTrades.length > 0 ? ` (${activeTrades.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* ── Offers ─────────────────────────────────────────────────────────── */}
      {activeTab === "offers" && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Currency + filters */}
          <div className="flex items-center gap-2 px-4 py-2 border-b flex-wrap shrink-0"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <div className="flex gap-1 flex-wrap">
              {TOP_FIATS.map(code => {
                const f = FIAT_CURRENCIES.find(fc => fc.code === code);
                return (
                  <button key={code} onClick={() => setSelectedFiat(code)}
                    className="px-2 py-0.5 rounded text-xs font-semibold transition-colors"
                    style={{
                      background: selectedFiat === code ? "rgba(99,102,241,0.15)" : "var(--surface-high)",
                      color: selectedFiat === code ? "var(--accent)" : "var(--ink-dim)",
                      border: `1px solid ${selectedFiat === code ? "var(--accent)" : "var(--border)"}`,
                    }}>
                    {f?.flag} {code}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ml-auto"
              style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
              <Search size={11} style={{ color: "var(--ink-dim)" }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search merchant…"
                className="w-28 bg-transparent text-xs outline-none"
                style={{ color: "var(--ink)" }} />
            </div>
            <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)}
              className="px-2 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }}>
              <option value="all">All methods</option>
              {availPayMethods.map(m => <option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
            </select>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 px-4 py-1.5 border-b text-[11px] shrink-0"
            style={{ borderColor: "var(--border)", color: "var(--ink-dim)" }}>
            <span>BTC ${btcPrice.toLocaleString()}</span>
            <span>{filteredAds.length} offers</span>
            <span>1 USD = {(fxRates[selectedFiat] ?? 1).toLocaleString("en-US", { maximumFractionDigits: 2 })} {selectedFiat}</span>
            <span className="ml-auto text-green-400 flex items-center gap-1">
              <Zap size={10} /> Live
            </span>
          </div>

          {/* Column headers */}
          <div className="grid px-4 py-2 text-[10px] font-semibold uppercase tracking-wider border-b shrink-0"
            style={{ borderColor: "var(--border)", color: "var(--ink-dim)", gridTemplateColumns: "2fr 1.5fr 1.5fr 2fr auto" }}>
            <span>Merchant</span><span>Price</span><span>Limits</span><span>Payment</span><span>Action</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {filteredAds.length > 0
              ? filteredAds.map(ad => (
                  <AdRow key={ad.id} ad={ad} merchantMap={merchants} nowMs={nowMs} onSelect={setSelectedAd} />
                ))
              : (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <TrendingUp size={28} style={{ color: "var(--ink-dim)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>No offers found</p>
                  <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Try different currency, asset, or payment method</p>
                </div>
              )}
          </div>
        </div>
      )}

      {/* ── My Orders ──────────────────────────────────────────────────────── */}
      {activeTab === "myOrders" && (
        <div className="flex-1 overflow-y-auto p-4">
          {!address ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <p className="text-sm" style={{ color: "var(--ink-dim)" }}>Connect wallet to view orders</p>
              <ConnectKitButton />
            </div>
          ) : (
            <>
              {activeTrades.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: "var(--ink-dim)" }}>Active</h3>
                  {activeTrades.map(t => (
                    <TradeCard key={t.id} trade={t} nowMs={nowMs}
                      onMarkPaid={id => confirmPayment(id, `ref-${nowMs}`)}
                      onCancel={id => cancelTrade(id, "Cancelled by buyer")}
                      onRelease={id => verifyAndRelease(id)}
                      onDispute={id => openDispute(id, "Payment dispute")}
                    />
                  ))}
                </div>
              )}
              {historyTrades.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: "var(--ink-dim)" }}>History</h3>
                  {historyTrades.map(t => (
                    <TradeCard key={t.id} trade={t} nowMs={nowMs}
                      onMarkPaid={() => undefined}
                      onCancel={() => undefined}
                      onRelease={() => undefined}
                      onDispute={() => undefined}
                    />
                  ))}
                </div>
              )}
              {myTrades.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Clock size={28} style={{ color: "var(--ink-dim)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>No orders yet</p>
                  <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Your P2P trades will appear here</p>
                  <button onClick={() => setActiveTab("offers")}
                    className="px-4 py-2 rounded-lg text-xs font-semibold mt-2"
                    style={{ background: "var(--accent)", color: "#fff" }}>
                    Browse Offers
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Post Ad ──────────────────────────────────────────────────────── */}
      {activeTab === "post" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-md mx-auto space-y-4">
            <h3 className="text-sm font-bold" style={{ color: "var(--ink)" }}>Post Advertisement</h3>
            <div className="p-4 rounded-xl" style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-2 p-3 rounded-lg mb-4"
                style={{ background: "rgba(251,191,36,0.05)", border: "1px solid rgba(251,191,36,0.15)" }}>
                <AlertTriangle size={13} className="text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-xs" style={{ color: "var(--ink-dim)" }}>
                  Merchant account with Level 1 KYC and a security deposit are required to post ads.
                </p>
              </div>
              {!address
                ? <div className="flex flex-col items-center gap-3 py-2">
                    <p className="text-xs" style={{ color: "var(--ink-dim)" }}>Connect wallet to continue</p>
                    <ConnectKitButton />
                  </div>
                : <button className="w-full py-2.5 rounded-xl text-xs font-bold"
                    style={{ background: "var(--accent)", color: "#fff" }}>
                    Start KYC Verification →
                  </button>}
            </div>
          </div>
        </div>
      )}

      {/* Order Modal */}
      {selectedAd && (
        <OrderModal ad={selectedAd} merchantMap={merchants} nowMs={nowMs}
          onClose={() => { setSelectedAd(null); setActiveTab("myOrders"); }} />
      )}
    </div>
  );
}
