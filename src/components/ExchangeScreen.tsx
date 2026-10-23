/**
 * ExchangeScreen — Coming Soon preview for the crypto-to-fiat exchange feature.
 *
 * Standalone, completely independent from P2P.
 * No live trading, no fake balances, no fake rates.
 * Designed for future integration with an exchange / liquidity provider.
 */
import { useState } from "react";
import {
  X, ArrowUpDown, Zap, Clock, ShieldCheck,
  TrendingUp, Lock, ChevronDown, Info,
} from "lucide-react";
import { CryptoIcon } from "@/components/AssetIcons";

// ── Static preview data ───────────────────────────────────────────────────────
// These are illustrative pairs only — no live rates, no real transactions.

const CRYPTO_OPTIONS = [
  { symbol: "USDC",  name: "USD Coin",   color: "#2775ca" },
  { symbol: "BTC",   name: "Bitcoin",    color: "#f7931a" },
  { symbol: "ETH",   name: "Ethereum",   color: "#627eea" },
  { symbol: "USDT",  name: "Tether",     color: "#26a17b" },
  { symbol: "BNB",   name: "BNB",        color: "#f3ba2f" },
  { symbol: "SOL",   name: "Solana",     color: "#9945ff" },
];

const FIAT_OPTIONS = [
  { currency: "NGN", name: "Nigerian Naira",    symbol: "₦",  flag: "ng" },
  { currency: "GHS", name: "Ghanaian Cedi",     symbol: "₵",  flag: "gh" },
  { currency: "KES", name: "Kenyan Shilling",   symbol: "KSh",flag: "ke" },
  { currency: "ZAR", name: "South African Rand",symbol: "R",  flag: "za" },
  { currency: "GBP", name: "British Pound",     symbol: "£",  flag: "gb" },
  { currency: "EUR", name: "Euro",              symbol: "€",  flag: "eu" },
  { currency: "USD", name: "US Dollar",         symbol: "$",  flag: "us" },
];

const FEATURES = [
  { icon: <Zap size={15} />,       color: "#f59e0b", title: "Instant Conversion",   desc: "On-demand crypto-to-fiat at competitive rates" },
  { icon: <TrendingUp size={15} />, color: "#10b981", title: "Live Market Rates",    desc: "Rates sourced from deep liquidity providers" },
  { icon: <ShieldCheck size={15} />,color: "#6366f1", title: "Non-Custodial",        desc: "Funds never leave your wallet until you confirm" },
  { icon: <Clock size={15} />,      color: "#8b5cf6", title: "Settlement in Minutes",desc: "Fiat credited to your RushPay local wallet" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function FlagImg({ flag, size = 20 }: { flag: string; size?: number }) {
  return (
    <img
      src={`https://flagcdn.com/w40/${flag}.png`}
      width={size}
      height={size * 0.67}
      className="rounded-sm object-cover"
      style={{ minWidth: size }}
      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
    />
  );
}

function SelectChip({
  children, onClick,
}: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-opacity hover:opacity-75 active:opacity-50"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {children}
      <ChevronDown size={11} style={{ color: "var(--subtle)" }} />
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ExchangeScreen({ onClose }: { onClose: () => void }) {
  const [fromCrypto, setFromCrypto] = useState(CRYPTO_OPTIONS[0]);
  const [toFiat,     setToFiat]     = useState(FIAT_OPTIONS[0]);
  const [showCryptoPicker, setShowCryptoPicker] = useState(false);
  const [showFiatPicker,   setShowFiatPicker]   = useState(false);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col" style={{ background: "var(--bg)" }}>

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: "var(--surface-high)" }}
        >
          <X size={16} style={{ color: "var(--ink)" }} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>Exchange</span>
            {/* Coming soon badge */}
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}
            >
              Coming Soon
            </span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
            Crypto ↔ Local currency
          </div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Hero banner ── */}
        <div
          className="mx-4 mt-4 rounded-2xl p-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)" }}
        >
          {/* decorative circles */}
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full opacity-10"
            style={{ background: "white" }} />
          <div className="absolute -right-2 -bottom-4 w-16 h-16 rounded-full opacity-10"
            style={{ background: "white" }} />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpDown size={16} color="#a5b4fc" />
              <span className="text-xs font-semibold" style={{ color: "#a5b4fc" }}>
                Instant Crypto-to-Fiat Exchange
              </span>
            </div>
            <div className="text-lg font-bold text-white mb-1">
              Convert any crypto to local currency
            </div>
            <div className="text-xs" style={{ color: "#c7d2fe" }}>
              USDC, BTC, ETH and more — settled directly to your RushPay wallet
            </div>
          </div>
        </div>

        {/* ── Preview converter UI (disabled) ── */}
        <div className="mx-4 mt-4">
          <div
            className="text-[10px] font-semibold uppercase tracking-wide mb-2 flex items-center gap-1.5"
            style={{ color: "var(--subtle)" }}
          >
            <Info size={10} />
            Preview — trading not yet enabled
          </div>

          <div
            className="rounded-2xl p-4 opacity-70 pointer-events-none select-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            {/* From crypto row */}
            <div className="mb-3">
              <div className="text-[10px] mb-1.5" style={{ color: "var(--subtle)" }}>You send</div>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                <SelectChip>
                  <CryptoIcon symbol={fromCrypto.symbol} size={18} />
                  <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                    {fromCrypto.symbol}
                  </span>
                </SelectChip>
                <div className="flex-1 text-right">
                  <div className="text-xl font-bold mono" style={{ color: "var(--ink)" }}>0.00</div>
                  <div className="text-[10px]" style={{ color: "var(--subtle)" }}>≈ $0.00</div>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center my-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                <ArrowUpDown size={14} style={{ color: "var(--accent)" }} />
              </div>
            </div>

            {/* To fiat row */}
            <div className="mb-4">
              <div className="text-[10px] mb-1.5" style={{ color: "var(--subtle)" }}>You receive</div>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                <SelectChip>
                  <FlagImg flag={toFiat.flag} size={18} />
                  <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                    {toFiat.currency}
                  </span>
                </SelectChip>
                <div className="flex-1 text-right">
                  <div className="text-xl font-bold mono" style={{ color: "var(--buy)" }}>0.00</div>
                  <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                    {toFiat.symbol} — {toFiat.name}
                  </div>
                </div>
              </div>
            </div>

            {/* Rate row (illustrative) */}
            <div className="flex items-center justify-between px-1 mb-4">
              <span className="text-[10px]" style={{ color: "var(--subtle)" }}>Rate</span>
              <span className="text-[10px] font-semibold" style={{ color: "var(--subtle)" }}>
                Live rates available at launch
              </span>
            </div>

            {/* CTA (disabled) */}
            <button
              disabled
              className="w-full py-3 rounded-xl text-sm font-bold opacity-40 cursor-not-allowed"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Exchange {fromCrypto.symbol} → {toFiat.currency}
            </button>
          </div>
        </div>

        {/* ── Supported pairs preview ── */}
        <div className="mx-4 mt-5">
          <div className="text-xs font-bold mb-3" style={{ color: "var(--ink)" }}>
            Supported pairs at launch
          </div>
          <div className="flex flex-wrap gap-2">
            {CRYPTO_OPTIONS.map(c =>
              FIAT_OPTIONS.slice(0, 3).map(f => (
                <span
                  key={`${c.symbol}-${f.currency}`}
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: "var(--surface-high)", color: "var(--subtle)", border: "1px solid var(--border)" }}
                >
                  {c.symbol}/{f.currency}
                </span>
              ))
            )}
          </div>
        </div>

        {/* ── Feature cards ── */}
        <div className="mx-4 mt-5">
          <div className="text-xs font-bold mb-3" style={{ color: "var(--ink)" }}>
            What to expect
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="rounded-2xl p-3"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center mb-2"
                  style={{ background: `${f.color}22`, color: f.color }}
                >
                  {f.icon}
                </div>
                <div className="text-[11px] font-bold mb-0.5" style={{ color: "var(--ink)" }}>
                  {f.title}
                </div>
                <div className="text-[10px] leading-relaxed" style={{ color: "var(--subtle)" }}>
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Not available note ── */}
        <div className="mx-4 mt-5 mb-6">
          <div
            className="rounded-2xl p-4 flex gap-3"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            <Lock size={16} color="#f59e0b" className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold mb-0.5" style={{ color: "#f59e0b" }}>
                Trading not yet enabled
              </div>
              <div className="text-[10px] leading-relaxed" style={{ color: "var(--subtle)" }}>
                Exchange is in development. No transactions can be submitted and no funds
                will move until the feature is officially launched. All rates shown above
                are illustrative only.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Pickers (rendered as bottom sheets) ── */}
      {showCryptoPicker && (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowCryptoPicker(false)}>
          <div className="rounded-t-3xl p-4 pb-8" style={{ background: "var(--surface)" }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--border)" }} />
            <div className="text-sm font-bold mb-3" style={{ color: "var(--ink)" }}>Select crypto</div>
            <div className="flex flex-col gap-2">
              {CRYPTO_OPTIONS.map(c => (
                <button key={c.symbol}
                  onClick={() => { setFromCrypto(c); setShowCryptoPicker(false); }}
                  className="flex items-center gap-3 p-3 rounded-xl transition-opacity hover:opacity-75"
                  style={{ background: fromCrypto.symbol === c.symbol ? "var(--surface-high)" : "transparent", border: "1px solid var(--border)" }}>
                  <CryptoIcon symbol={c.symbol} size={28} />
                  <div className="text-left">
                    <div className="text-xs font-bold" style={{ color: "var(--ink)" }}>{c.symbol}</div>
                    <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{c.name}</div>
                  </div>
                  {fromCrypto.symbol === c.symbol && <div className="ml-auto w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showFiatPicker && (
        <div className="fixed inset-0 z-[80] flex flex-col justify-end" style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowFiatPicker(false)}>
          <div className="rounded-t-3xl p-4 pb-8" style={{ background: "var(--surface)" }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--border)" }} />
            <div className="text-sm font-bold mb-3" style={{ color: "var(--ink)" }}>Select local currency</div>
            <div className="flex flex-col gap-2">
              {FIAT_OPTIONS.map(f => (
                <button key={f.currency}
                  onClick={() => { setToFiat(f); setShowFiatPicker(false); }}
                  className="flex items-center gap-3 p-3 rounded-xl transition-opacity hover:opacity-75"
                  style={{ background: toFiat.currency === f.currency ? "var(--surface-high)" : "transparent", border: "1px solid var(--border)" }}>
                  <FlagImg flag={f.flag} size={28} />
                  <div className="text-left">
                    <div className="text-xs font-bold" style={{ color: "var(--ink)" }}>{f.currency}</div>
                    <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{f.name}</div>
                  </div>
                  {toFiat.currency === f.currency && <div className="ml-auto w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
