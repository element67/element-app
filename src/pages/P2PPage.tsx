/**
 * P2P Marketplace — Quick Swap as hero, Top Offers as compact nav button.
 * Two-way crypto↔fiat swap, live rates from P2P offers + priceStore,
 * dynamic crypto selector and country-aware local currency selector.
 */
import { useState, useMemo, useCallback } from "react";
import {
  ArrowLeft, Settings, Bell, MoreHorizontal, Star, ChevronRight,
  RefreshCw, ArrowRightLeft, TrendingUp, Search, SlidersHorizontal,
  Shield, Lock, Users, CheckCircle2, CreditCard, Wallet, ChevronDown,
  AlertTriangle, Copy, ExternalLink, Loader2, Zap,
} from "lucide-react";
import { P2PPanel }      from "@/components/P2PPanel";
import { useP2PStore }   from "@/store/p2pStore";
import { usePriceStore } from "@/store/priceStore";
import { useCountry }    from "@/hooks/useCountry";
import { P2PRateBar }    from "@/components/P2PRateBar";
import { useSwapEngine }  from "@/hooks/useSwapEngine";
import { useWalletStore } from "@/store/walletStore";
import { CryptoIcon } from "@/components/AssetIcons";
import { SettlementStatusCard } from "@/components/SettlementStatusCard";
import { TopOffersMerchantSection } from "@/components/TopOffersMerchantCard";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BLUE    = "#2563eb";
const BLUE_D  = "#1d4ed8";
const GREEN   = "#22c55e";
const GREEN_D = "#16a34a";
const NAVY    = "var(--bg)";
const CARD    = "rgba(255,255,255,0.72)";
const CARD_H  = "rgba(255,255,255,0.55)";
const BORDER  = "rgba(255,255,255,0.72)";
const BORDER_S = "rgba(255,255,255,0.60)";
const GLASS   = { background: CARD, backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)", border: `1px solid ${BORDER}`, boxShadow: "0 4px 16px rgba(15,23,42,0.07), inset 0 1px 0 rgba(255,255,255,0.55)" } as const;
const GLASS_H = { background: "rgba(255,255,255,0.55)", backdropFilter: "blur(16px) saturate(140%)", WebkitBackdropFilter: "blur(16px) saturate(140%)", border: `1px solid ${BORDER_S}` } as const;

// ─── Asset config ─────────────────────────────────────────────────────────────
const CRYPTO_ASSETS = ["USDC","USDT","BTC","ETH","SOL","BNB","XRP","TRX","TON","DOGE"] as const;
type CryptoAsset = typeof CRYPTO_ASSETS[number];

const ASSET_COLORS: Record<string, string> = {
  USDC:"#2775CA", USDT:"#26A17B", BTC:"#F7931A", ETH:"#627EEA",
  SOL:"#9945FF",  BNB:"#F3BA2F",  XRP:"#00AAE4", TRX:"#FF0013",
  TON:"#0098EA",  DOGE:"#C2A633",
};

// Supported fiat currencies with flags and symbols
const FIAT_OPTIONS = [
  { code: "NGN", symbol: "₦",  flag: "🇳🇬", name: "Nigerian Naira"    },
  { code: "GHS", symbol: "GH₵",flag: "🇬🇭", name: "Ghanaian Cedi"     },
  { code: "KES", symbol: "KSh",flag: "🇰🇪", name: "Kenyan Shilling"   },
  { code: "ZAR", symbol: "R",  flag: "🇿🇦", name: "South African Rand"},
  { code: "USD", symbol: "$",  flag: "🇺🇸", name: "US Dollar"         },
  { code: "GBP", symbol: "£",  flag: "🇬🇧", name: "British Pound"     },
  { code: "EUR", symbol: "€",  flag: "🇪🇺", name: "Euro"              },
  { code: "TZS", symbol: "TSh",flag: "🇹🇿", name: "Tanzanian Shilling"},
  { code: "UGX", symbol: "USh",flag: "🇺🇬", name: "Ugandan Shilling"  },
  { code: "INR", symbol: "₹",  flag: "🇮🇳", name: "Indian Rupee"      },
  { code: "BRL", symbol: "R$", flag: "🇧🇷", name: "Brazilian Real"    },
  { code: "MXN", symbol: "MX$",flag: "🇲🇽", name: "Mexican Peso"      },
] as const;
type FiatCode = typeof FIAT_OPTIONS[number]["code"];

// ─── Sub-components ───────────────────────────────────────────────────────────

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: "rgba(34,197,94,0.15)", color: GREEN, border: `1px solid rgba(34,197,94,0.3)` }}>
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: GREEN }} />
      LIVE
    </span>
  );
}

function QuickBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all active:scale-95 shrink-0"
      style={{ ...GLASS_H, minWidth: 64 }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ background: `rgba(37,99,235,0.12)`, color: BLUE }}>
        {icon}
      </div>
      <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: "var(--subtle)" }}>{label}</span>
    </button>
  );
}

function AssetPill({ symbol, active, onClick }: { symbol: string; active: boolean; onClick: () => void }) {
  const color = ASSET_COLORS[symbol] ?? BLUE;
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all"
      style={{
        background: active ? `${color}18` : "rgba(255,255,255,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${active ? color : "rgba(255,255,255,0.60)"}`,
        color: active ? color : "var(--subtle)",
      }}>
      <CryptoIcon symbol={symbol} size={16} />
      {symbol}
    </button>
  );
}


/** Hero Quick Swap card — full crypto↔fiat, two-way, live rates */
function QuickSwapCard({ onOpenOffers: _onOpenOffers }: { onOpenOffers: () => void }) {
  const { country: countryInfo } = useCountry();
  const defaultFiat = countryInfo.currency as FiatCode;
  const tickers    = usePriceStore(s => s.tickers);
  const ads        = useP2PStore(s => s.ads);
  const walletAssets = useWalletStore(s => s.assets);

  /** Balance map: symbol → available balance (0 if not held) */
  const walletBalances = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of walletAssets) m[a.symbol] = a.balance;
    return m;
  }, [walletAssets]);

  /** Format a crypto balance for display */
  const fmtBal = (sym: string) => {
    const b = walletBalances[sym] ?? 0;
    if (b === 0) return "0";
    if (b < 0.0001) return b.toExponential(2);
    if (b < 1)      return b.toFixed(6);
    if (b < 1000)   return b.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return b.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Direction: true = crypto→fiat, false = fiat→crypto
  const [cryptoToFiat, setCryptoToFiat] = useState(true);
  const [crypto,   setCrypto]   = useState<CryptoAsset>("USDC");
  const [fiat,     setFiat]     = useState<FiatCode>((defaultFiat) ?? "NGN");
  const [amt,      setAmt]      = useState("");
  const [showCryptoMenu, setShowCryptoMenu] = useState(false);
  const [showFiatMenu,   setShowFiatMenu]   = useState(false);
  const [localErr, setLocalErr] = useState("");
  const engine = useSwapEngine();
  const [copied, setCopied]           = useState(false);
  const [txHashInput, setTxHashInput] = useState("");
  const [settlementId, setSettlementId] = useState<string | null>(null);

  const copyText = useCallback((text: string) => {
    void navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  // Live rate: prefer best P2P ad, fall back to marketPrice × fx seed
  const liveRate = useMemo(() => {
    const best = ads
      .filter(a => a.status === "active" && a.asset === crypto &&
        a.side === (cryptoToFiat ? "sell" : "buy") && a.fiatCurrency === fiat)
      .sort((a, b) => cryptoToFiat ? a.price - b.price : b.price - a.price)[0];
    if (best) return best.price;
    // Fallback: marketPrice × seed FX rates
    const marketUsd = tickers[`${crypto}-USD`]?.lastPrice ?? (crypto === "USDC" || crypto === "USDT" ? 1 : 0);
    const fxSeeds: Record<string, number> = {
      NGN: 1580, GHS: 14.5, KES: 130, ZAR: 18.5, USD: 1,
      GBP: 0.79, EUR: 0.92, TZS: 2600, UGX: 3700, INR: 83, BRL: 5.1, MXN: 17.2,
    };
    return marketUsd * (fxSeeds[fiat] ?? 1);
  }, [ads, crypto, fiat, cryptoToFiat, tickers]);

  const fiatInfo = FIAT_OPTIONS.find(f => f.code === fiat) ?? FIAT_OPTIONS[0];
  const cryptoColor = ASSET_COLORS[crypto] ?? BLUE;

  const estimated = useMemo(() => {
    const n = parseFloat(amt);
    if (!n || isNaN(n) || n <= 0) return "";
    if (cryptoToFiat) {
      return (n * liveRate).toLocaleString("en-US", { maximumFractionDigits: 0 });
    } else {
      return (n / liveRate).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    }
  }, [amt, liveRate, cryptoToFiat]);

  const fee = useMemo(() => {
    const n = parseFloat(amt);
    if (!n || isNaN(n)) return null;
    const feeRate = 0.001; // 0.1%
    if (cryptoToFiat) return { label: `${(n * feeRate).toFixed(4)} ${crypto}`, usd: n * feeRate };
    return { label: `${fiatInfo.symbol}${(n * feeRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, usd: (n / liveRate) * feeRate };
  }, [amt, cryptoToFiat, crypto, fiatInfo, liveRate]);

  function flip() {
    setCryptoToFiat(p => !p);
    setAmt(estimated);
    setLocalErr("");
    engine.reset();
  }

  async function handleGetQuote() {
    const n = parseFloat(amt);
    if (!n || isNaN(n) || n <= 0) { setLocalErr("Enter a valid amount"); return; }
    // Balance check when sending crypto
    if (cryptoToFiat) {
      const avail = walletBalances[crypto] ?? 0;
      if (n > avail) {
        setLocalErr(`Insufficient ${crypto} balance. Available: ${fmtBal(crypto)} ${crypto}`);
        return;
      }
    }
    setLocalErr("");
    await engine.getQuote({
      direction:   cryptoToFiat ? "crypto_to_fiat" : "fiat_to_crypto",
      crypto,
      network:     "base", // default to Base — lowest fees for USDC
      fiat,
      cryptoAmount: cryptoToFiat ? amt : undefined,
      fiatAmount:   cryptoToFiat ? undefined : amt,
    });
  }

  async function handleConfirm() {
    await engine.initiate({ customerAddress: undefined });
  }

  /** After payment proof submitted, create an Element Settlement record linked to the swap */
  async function createSettlementRecord(swapId: string) {
    try {
      const q = engine.quote;
      if (!q) return;
      const res = await fetch("/api/settlement/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId:    swapId,
          asset:      q.crypto,
          network:    q.network,
          cryptoAmount: q.cryptoAmount,
          fiatCurrency: q.fiat,
          fiatAmount:   q.fiatAmount,
          rate:         String(q.rate),
          depositAddress: q.vaultAddress ?? undefined,
          txHash:     txHashInput || undefined,
          userId:     "quickswap",
        }),
      });
      if (res.ok) {
        const data = await res.json() as { settlement?: { id: string } };
        if (data.settlement?.id) setSettlementId(data.settlement.id);
      }
    } catch { /* settlement tracking is best-effort */ }
  }

  const fromLabel = cryptoToFiat ? crypto : `${fiatInfo.flag} ${fiat}`;
  const toLabel   = cryptoToFiat ? `${fiatInfo.flag} ${fiat}` : crypto;
  const fromColor = cryptoToFiat ? cryptoColor : "var(--subtle)";
  const toColor   = cryptoToFiat ? "var(--subtle)" : cryptoColor;

  // ── Engine-driven confirmation screens ───────────────────────────────────────
  if (engine.phase === "confirming" && engine.quote) {
    const q = engine.quote;
    return (
      <div className="rounded-2xl p-3 flex flex-col gap-3"
        style={{ ...GLASS }}>
        <div className="flex items-center gap-2 mb-0.5">
          <button onClick={() => engine.reset()} style={{ color: "var(--subtle)" }}><ArrowLeft size={16} /></button>
          <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>Review Quote</span>
          <span className="ml-auto text-xs" style={{ color: engine.expiresIn < 30 ? "#ef4444" : "#22c55e" }}>
            Expires in {engine.expiresIn}s
          </span>
        </div>
        <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER_S}` }}>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--subtle)" }}>You send</span>
            <span className="font-bold" style={{ color: "var(--ink)" }}>{q.cryptoAmount} {q.crypto}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--subtle)" }}>You receive</span>
            <span className="font-bold" style={{ color: GREEN }}>
              {fiatInfo.symbol}{parseFloat(q.fiatAmount).toLocaleString("en-US",{maximumFractionDigits:0})} {q.fiat}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--subtle)" }}>Rate</span>
            <span style={{ color: "var(--ink)" }}>{fiatInfo.symbol}{q.rate.toLocaleString("en-US",{maximumFractionDigits:0})} / {q.crypto}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--subtle)" }}>Fee (0.5%)</span>
            <span style={{ color: "var(--subtle)" }}>{q.fee} {cryptoToFiat ? q.crypto : q.fiat}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--subtle)" }}>Network</span>
            <span style={{ color: "var(--ink)" }}>Base (USDC)</span>
          </div>
        </div>
        {engine.error && <div className="text-xs py-2 px-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{engine.error}</div>}
        <div className="flex gap-2">
          <button onClick={() => engine.reset()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER_S}`, color: "var(--subtle)" }}>
            Cancel
          </button>
          <button onClick={() => void handleConfirm()} disabled={engine.isLoading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(135deg,${GREEN},${GREEN_D})`, color: "#fff", opacity: engine.isLoading ? 0.7 : 1 }}>
            {engine.isLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Confirm Swap
          </button>
        </div>
      </div>
    );
  }

  // ── Awaiting payment screen ──────────────────────────────────────────────────
  if (engine.phase === "awaiting_payment" && engine.quote) {
    const q = engine.quote;
    return (
      <div className="rounded-2xl p-5 flex flex-col gap-4"
        style={{ ...GLASS }}>
        <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>
          {cryptoToFiat ? "Send your crypto to the vault" : "Pay by bank transfer"}
        </div>

        {cryptoToFiat && q.vaultAddress ? (
          <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER_S}` }}>
            <div className="text-xs font-medium" style={{ color: "var(--subtle)" }}>Send exactly {q.cryptoAmount} {q.crypto} to:</div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs flex-1 truncate" style={{ color: "var(--ink)" }}>{q.vaultAddress}</span>
              <button onClick={() => copyText(q.vaultAddress!)} style={{ color: copied ? GREEN : "var(--subtle)" }}>
                <Copy size={14} />
              </button>
            </div>
            <div className="text-xs" style={{ color: "var(--subtle)" }}>Network: {q.network} · Only send {q.crypto} on {q.network}</div>
          </div>
        ) : !cryptoToFiat && q.bankInstructions ? (
          <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER_S}` }}>
            {q.bankInstructions.provider === "unavailable" ? (
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} style={{ color: "#f59e0b" }} className="mt-0.5 shrink-0" />
                <div className="text-xs" style={{ color: "#f59e0b" }}>
                  Bank deposits not yet configured. Set FLUTTERWAVE_SECRET_KEY or PAYSTACK_SECRET_KEY and VAULT_BANK_ACCOUNT in .env to enable fiat-to-crypto swaps.
                </div>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-xs"><span style={{ color: "var(--subtle)" }}>Bank</span><span style={{ color: "var(--ink)" }}>{q.bankInstructions.bankName}</span></div>
                <div className="flex justify-between text-xs"><span style={{ color: "var(--subtle)" }}>Account No.</span>
                  <span className="flex items-center gap-1" style={{ color: "var(--ink)" }}>
                    {q.bankInstructions.accountNumber}
                    <button onClick={() => copyText(q.bankInstructions!.accountNumber)} style={{ color: "var(--subtle)" }}><Copy size={11} /></button>
                  </span>
                </div>
                <div className="flex justify-between text-xs"><span style={{ color: "var(--subtle)" }}>Name</span><span style={{ color: "var(--ink)" }}>{q.bankInstructions.accountName}</span></div>
                <div className="flex justify-between text-xs"><span style={{ color: "var(--subtle)" }}>Amount</span><span style={{ color: GREEN }}>{fiatInfo.symbol}{parseFloat(q.fiatAmount).toLocaleString()}</span></div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--subtle)" }}>Reference (must include)</span>
                  <span className="flex items-center gap-1 font-mono" style={{ color: "#f59e0b" }}>
                    {q.bankInstructions.reference}
                    <button onClick={() => copyText(q.bankInstructions!.reference)} style={{ color: "var(--subtle)" }}><Copy size={11} /></button>
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="text-xs" style={{ color: "var(--subtle)" }}>Payment details not available. Check server configuration.</div>
        )}

        {/* Tx hash input for crypto→fiat */}
        {cryptoToFiat && (
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--subtle)" }}>
              Transaction hash <span style={{ color: "var(--subtle)" }}>(paste after sending)</span>
            </label>
            <input
              value={txHashInput}
              onChange={e => setTxHashInput(e.target.value.trim())}
              placeholder="0x..."
              className="w-full bg-transparent px-3 py-2.5 rounded-xl text-xs font-mono outline-none"
              style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${txHashInput.startsWith("0x") ? BLUE : BORDER_S}`, color: "var(--ink)" }}
            />
            {txHashInput && !txHashInput.match(/^0x[0-9a-fA-F]{64}$/) && (
              <p className="text-[11px] mt-1" style={{ color: "#f59e0b" }}>
                Paste the full 66-character 0x… transaction hash from your wallet
              </p>
            )}
          </div>
        )}

        {engine.error && <div className="text-xs py-2 px-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{engine.error}</div>}
        <div className="flex gap-2">
          <button onClick={() => void engine.cancel()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER_S}`, color: "var(--subtle)" }}>Cancel</button>
          <button
            disabled={
              engine.isLoading ||
              (!q.vaultAddress && q.bankInstructions?.provider === "unavailable") ||
              (cryptoToFiat && !!txHashInput && !txHashInput.match(/^0x[0-9a-fA-F]{64}$/))
            }
            onClick={async () => {
              await engine.submitPayment({ txHash: txHashInput || undefined, paymentRef: q.bankInstructions?.reference });
              if (engine.quote?.id) await createSettlementRecord(engine.quote.id);
            }}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(135deg,${BLUE},${BLUE_D})`, color: "#fff",
              opacity: (!q.vaultAddress && q.bankInstructions?.provider === "unavailable") ? 0.4 : 1,
            }}>
            {engine.isLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Submit — Element Verify
          </button>
        </div>
      </div>
    );
  }

  // ── Verifying / completed / failed screens ───────────────────────────────────
  if (["submitted","completed","failed","fraud_hold"].includes(engine.phase)) {
    const q = engine.quote;
    const isCompleted = engine.phase === "completed";
    const isFailed    = engine.phase === "failed";
    const isFraud     = engine.phase === "fraud_hold";
    return (
      <div className="rounded-2xl flex flex-col gap-3"
        style={{ ...GLASS }}>

        {/* Element Settlement Status Card — full 10-state tracker */}
        {settlementId ? (
          <SettlementStatusCard
            settlementId={settlementId}
            onClose={() => { engine.reset(); setAmt(""); setSettlementId(null); setTxHashInput(""); }}
          />
        ) : (
          <div className="p-5 flex flex-col gap-4">
            <div className="text-center flex flex-col items-center gap-2">
              {isCompleted && <CheckCircle2 size={36} style={{ color: GREEN }} />}
              {isFailed    && <AlertTriangle size={36} style={{ color: "#ef4444" }} />}
              {isFraud     && <Shield size={36} style={{ color: "#f59e0b" }} />}
              {!isCompleted && !isFailed && !isFraud && <Loader2 size={36} className="animate-spin" style={{ color: BLUE }} />}
              <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                {isCompleted ? "Swap Complete!" : isFailed ? "Swap Failed" : isFraud ? "Under Review" : "Verifying with Element…"}
              </div>
              {q && <div className="text-xs" style={{ color: "var(--subtle)" }}>{q.cryptoAmount} {q.crypto} ↔ {fiatInfo.symbol}{parseFloat(q.fiatAmount).toLocaleString()} {q.fiat}</div>}
              {isCompleted && q?.payoutTxHash && (
                <a href={`https://basescan.org/tx/${q.payoutTxHash}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs" style={{ color: BLUE }}>
                  View Payout <ExternalLink size={10} />
                </a>
              )}
              {engine.error && <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>{engine.error}</div>}
              {isFraud && <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>Your swap is under fraud review. Funds are safe. Contact support with ref: {q?.id}</div>}
            </div>
            {(isCompleted || isFailed) && (
              <button onClick={() => { engine.reset(); setAmt(""); setTxHashInput(""); }} className="w-full py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER_S}`, color: "var(--subtle)" }}>
                New Swap
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: CARD, border: `1px solid ${BORDER}` }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={16} style={{ color: BLUE }} />
          <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>Quick Swap</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: "var(--subtle)" }}>
            {fiatInfo.flag} {fiatInfo.symbol}{liveRate.toLocaleString("en-US",{maximumFractionDigits:0})} / {crypto}
          </span>
          <LiveBadge />
        </div>
      </div>

      {/* FROM field */}
      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER_S}` }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium" style={{ color: "var(--subtle)" }}>From</span>
          {/* Selector */}
          <div className="relative">
            <button onClick={() => { if (cryptoToFiat) { setShowFiatMenu(false); setShowCryptoMenu(p => !p); } else { setShowCryptoMenu(false); setShowFiatMenu(p => !p); } }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
              style={{ background: `${fromColor}18`, border: `1px solid ${fromColor}44`, color: fromColor }}>
              {fromLabel}
              <ChevronDown size={11} />
            </button>
            {/* Crypto dropdown */}
            {showCryptoMenu && cryptoToFiat && (
              <div className="absolute right-0 top-8 z-50 rounded-xl shadow-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", border: `1px solid rgba(255,255,255,0.72)`, minWidth: 160 }}>
                {CRYPTO_ASSETS.map(a => {
                  const bal = walletBalances[a] ?? 0;
                  const hasBalance = bal > 0;
                  return (
                    <button key={a} onClick={() => { setCrypto(a); setShowCryptoMenu(false); setAmt(""); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold hover:bg-white/5 transition-colors"
                      style={{ color: a === crypto ? ASSET_COLORS[a] ?? BLUE : "var(--subtle)" }}>
                      <CryptoIcon symbol={a} size={20} />
                      <span className="flex-1 text-left">{a}</span>
                      <span className="text-[10px] font-normal" style={{ color: "var(--subtle)" }}>
                        {fmtBal(a)}
                      </span>
                      {a === crypto && <CheckCircle2 size={10} className="shrink-0" style={{ color: ASSET_COLORS[a] ?? BLUE }} />}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Fiat dropdown */}
            {showFiatMenu && !cryptoToFiat && (
              <div className="absolute right-0 top-8 z-50 rounded-xl shadow-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", border: `1px solid rgba(255,255,255,0.72)`, minWidth: 200 }}>
                {FIAT_OPTIONS.map(f => (
                  <button key={f.code} onClick={() => { setFiat(f.code); setShowFiatMenu(false); setAmt(""); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold hover:bg-white/5 transition-colors"
                    style={{ color: f.code === fiat ? BLUE : "var(--subtle)" }}>
                    <span className="text-base">{f.flag}</span>
                    <span>{f.code}</span>
                    <span className="ml-auto text-[10px]" style={{ color: "var(--subtle)" }}>{f.symbol}</span>
                    {f.code === fiat && <CheckCircle2 size={10} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <input
          type="number"
          placeholder="0.00"
          value={amt}
          onChange={e => { setAmt(e.target.value); setLocalErr(""); }}
          className="w-full bg-transparent text-2xl font-bold outline-none"
          style={{ color: "var(--ink)" }}
        />
        <div className="flex items-center justify-between mt-1">
          {cryptoToFiat
            ? <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                {crypto === "USDC" || crypto === "USDT" ? "≈ $" + (parseFloat(amt)||0).toFixed(2) + " USD" : ""}
              </div>
            : <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                {fiatInfo.symbol}{(parseFloat(amt)||0).toLocaleString("en-US",{maximumFractionDigits:0})} {fiat}
              </div>
          }
          {cryptoToFiat && (
            <div className="flex items-center gap-2">
              <span className="text-[10px]" style={{ color: "var(--subtle)" }}>
                Bal: <span style={{ color: "var(--subtle)" }}>
                  {fmtBal(crypto)} {crypto}
                </span>
              </span>
              {(walletBalances[crypto] ?? 0) > 0 && (
                <button onClick={() => setAmt(String(walletBalances[crypto]))}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: `${BLUE}22`, color: BLUE }}>
                  MAX
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Flip button */}
      <div className="flex justify-center -my-1">
        <button onClick={flip}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 active:rotate-180"
          style={{ background: `${BLUE}22`, border: `1px solid ${BLUE}44`, color: BLUE }}>
          <ArrowRightLeft size={16} />
        </button>
      </div>

      {/* TO field */}
      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER_S}` }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium" style={{ color: "var(--subtle)" }}>To</span>
          {/* To selector */}
          <div className="relative">
            <button onClick={() => { if (cryptoToFiat) { setShowCryptoMenu(false); setShowFiatMenu(p => !p); } else { setShowFiatMenu(false); setShowCryptoMenu(p => !p); } }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all"
              style={{ background: `${toColor}18`, border: `1px solid ${toColor}44`, color: toColor }}>
              {toLabel}
              <ChevronDown size={11} />
            </button>
            {/* Fiat dropdown (crypto→fiat direction) */}
            {showFiatMenu && cryptoToFiat && (
              <div className="absolute right-0 top-8 z-50 rounded-xl shadow-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", border: `1px solid rgba(255,255,255,0.72)`, minWidth: 200 }}>
                {FIAT_OPTIONS.map(f => (
                  <button key={f.code} onClick={() => { setFiat(f.code); setShowFiatMenu(false); setAmt(""); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold hover:bg-white/5 transition-colors"
                    style={{ color: f.code === fiat ? BLUE : "var(--subtle)" }}>
                    <span className="text-base">{f.flag}</span>
                    <span>{f.code}</span>
                    <span className="ml-auto text-[10px]" style={{ color: "var(--subtle)" }}>{f.symbol}</span>
                    {f.code === fiat && <CheckCircle2 size={10} />}
                  </button>
                ))}
              </div>
            )}
            {/* Crypto dropdown (fiat→crypto direction) */}
            {showCryptoMenu && !cryptoToFiat && (
              <div className="absolute right-0 top-8 z-50 rounded-xl shadow-2xl overflow-hidden"
                style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", border: `1px solid rgba(255,255,255,0.72)`, minWidth: 160 }}>
                {CRYPTO_ASSETS.map(a => {
                  const bal = walletBalances[a] ?? 0;
                  const hasBalance = bal > 0;
                  return (
                    <button key={a} onClick={() => { setCrypto(a); setShowCryptoMenu(false); setAmt(""); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold hover:bg-white/5 transition-colors"
                      style={{ color: a === crypto ? ASSET_COLORS[a] ?? BLUE : "var(--subtle)" }}>
                      <CryptoIcon symbol={a} size={20} />
                      <span className="flex-1 text-left">{a}</span>
                      <span className="text-[10px] font-normal" style={{ color: "var(--subtle)" }}>
                        {fmtBal(a)}
                      </span>
                      {a === crypto && <CheckCircle2 size={10} className="shrink-0" style={{ color: ASSET_COLORS[a] ?? BLUE }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="text-2xl font-bold" style={{ color: estimated ? GREEN : "var(--ink)" }}>
          {estimated
            ? (cryptoToFiat
                ? `${fiatInfo.symbol}${estimated}`
                : `${estimated} ${crypto}`)
            : "0.00"}
        </div>
        {estimated && fee && (
          <div className="text-[10px] mt-1" style={{ color: "var(--subtle)" }}>
            Fee ~{fee.label} · Net after fee
          </div>
        )}
      </div>

      {/* Rate info */}
      {liveRate > 0 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px]" style={{ color: "var(--subtle)" }}>
            1 {crypto} = {fiatInfo.symbol}{liveRate.toLocaleString("en-US",{maximumFractionDigits:0})} {fiat}
          </span>
          <span className="text-[10px]" style={{ color: GREEN }}>
            ⚡ Live P2P rate
          </span>
        </div>
      )}

      {(localErr || engine.error) && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}>
          {localErr || engine.error}
        </div>
      )}

      <button
        onClick={() => void handleGetQuote()}
        disabled={!amt || !estimated || engine.isLoading || engine.phase === "quoting"}
        className="w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{ background: `linear-gradient(135deg,${BLUE},${BLUE_D})`, color: "#fff" }}>
        {engine.phase === "quoting" ? <><Loader2 size={14} className="animate-spin" /> Getting Quote…</> : cryptoToFiat ? `Get Quote: ${crypto} → ${fiat}` : `Get Quote: ${fiat} → ${crypto}`}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type P2PTab = "topOffers" | "offers" | "myOrders";

interface P2PPageProps {
  onNavigate?: (page: string) => void;
  onVaultDashboard?: () => void;
}

export function P2PPage({ onNavigate, onVaultDashboard }: P2PPageProps) {
  const [activeTab,      setActiveTab]      = useState<P2PTab>("topOffers");
  const [activeAsset,    setActiveAsset]    = useState<string>("USDC");
  const [activeCountry,  setActiveCountry]  = useState<FiatCode>("NGN");
  const [searchQ,        setSearchQ]        = useState("");
  const [buySell,        setBuySell]        = useState<"buy"|"sell">("buy");
  const [showAssetDrop,  setShowAssetDrop]  = useState(false);
  const [showCountryDrop,setShowCountryDrop]= useState(false);

  const ads    = useP2PStore(s => s.ads);
  const trades = useP2PStore(s => s.trades);

  const stats = useMemo(() => ({
    activeAds:   ads.filter(a => a.status === "active").length,
    completedTx: trades.filter(t => t.status === "completed").length,
    countries:   195,
  }), [ads, trades]);

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: NAVY }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 pt-2 pb-2"
        style={{ background: "var(--bg)", borderBottom: `1px solid ${BORDER}` }}>

        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            {onNavigate && (
              <button onClick={() => onNavigate("wallet")}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(59,130,246,0.1)", color: BLUE }}>
                <ArrowLeft size={14} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold" style={{ color: "var(--ink)" }}>P2P Marketplace</span>
              <LiveBadge />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(59,130,246,0.1)", color: BLUE }}>
              <Bell size={13} />
            </button>
            <button onClick={() => onVaultDashboard?.()}
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(59,130,246,0.1)", color: BLUE }}
              title="Vault Dashboard">
              <Settings size={13} />
            </button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(59,130,246,0.1)", color: BLUE }}>
              <MoreHorizontal size={13} />
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
          {[
            { label: "Active Offers", value: stats.activeAds.toLocaleString(),   icon: <TrendingUp size={12} /> },
            { label: "Completed",     value: stats.completedTx.toLocaleString(), icon: <CheckCircle2 size={12} /> },
            { label: "Countries",     value: `${stats.countries}`,               icon: <Users size={12} /> },
            { label: "Escrow",        value: "Protected",                         icon: <Shield size={12} /> },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 shrink-0">
              <span style={{ color: BLUE }}>{s.icon}</span>
              <span className="text-[11px]" style={{ color: "var(--subtle)" }}>
                <span className="font-semibold" style={{ color: "var(--ink)" }}>{s.value}</span>
                {" "}{s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">

        {/* Top Offers + Quick Swap tab */}
        {activeTab === "topOffers" && (
          <div className="px-4 py-2 flex flex-col gap-2.5">

            {/* Live rate bar */}
            <P2PRateBar />

            {/* Quick Swap — HERO */}
            <QuickSwapCard onOpenOffers={() => setActiveTab("offers")} />

            {/* Top Offer Merchants — escrow-backed, one-tap */}
            <TopOffersMerchantSection
              takerId={typeof localStorage !== "undefined"
                ? (localStorage.getItem("rushpay-wallet-id") ?? "guest")
                : "guest"}
            />

            {/* Quick actions */}
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--subtle)" }}>QUICK ACTIONS</div>
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                <QuickBtn icon={<ArrowRightLeft size={16} />} label="Swap"       onClick={() => setActiveTab("offers")} />
                <QuickBtn icon={<TrendingUp    size={16} />} label="Buy Crypto"  onClick={() => { setBuySell("buy");  setActiveTab("offers"); }} />
                <QuickBtn icon={<RefreshCw     size={16} />} label="Sell Crypto" onClick={() => { setBuySell("sell"); setActiveTab("offers"); }} />
                <QuickBtn icon={<Wallet        size={16} />} label="Send" />
                <QuickBtn icon={<CreditCard    size={16} />} label="Receive" />
                <QuickBtn icon={<Lock          size={16} />} label="Escrow" />
              </div>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-2">
              {[
                { icon: <Shield size={11} />,       label: "Escrow Protected"  },
                { icon: <CheckCircle2 size={11} />, label: "KYC Merchants"     },
                { icon: <Lock size={11} />,         label: "Dispute Resolution"},
                { icon: <Star size={11} />,         label: "Merchant Ratings"  },
              ].map(b => (
                <div key={b.label}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{ background: "rgba(34,197,94,0.08)", color: GREEN, border: `1px solid rgba(34,197,94,0.2)` }}>
                  {b.icon}{b.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Offers / My Orders — P2PPanel */}
        {(activeTab === "offers" || activeTab === "myOrders") && (
          <div className="flex flex-col h-full">

            {/* ── Row 1: Asset + Country dropdowns ── */}
            <div className="px-4 pt-3 pb-2 flex gap-2 shrink-0">
              {/* Crypto dropdown */}
              <div className="relative flex-1">
                <button onClick={() => { setShowAssetDrop(p => !p); setShowCountryDrop(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER}`, color: "var(--ink)" }}>
                  <CryptoIcon symbol={activeAsset} size={16} />
                  <span className="flex-1 text-left">{activeAsset}</span>
                  <ChevronDown size={12} style={{ color: "var(--subtle)" }} />
                </button>
                {showAssetDrop && (
                  <div className="absolute left-0 top-10 z-50 rounded-xl shadow-2xl overflow-hidden w-48"
                    style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", border: `1px solid rgba(255,255,255,0.72)` }}>
                    {CRYPTO_ASSETS.map(a => (
                      <button key={a} onClick={() => { setActiveAsset(a); setShowAssetDrop(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold hover:bg-white/5"
                        style={{ color: a === activeAsset ? (ASSET_COLORS[a] ?? BLUE) : "var(--subtle)" }}>
                        <CryptoIcon symbol={a} size={16} />
                        <span className="flex-1 text-left">{a}</span>
                        {a === activeAsset && <CheckCircle2 size={10} style={{ color: ASSET_COLORS[a] ?? BLUE }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Country dropdown */}
              <div className="relative flex-1">
                {(() => {
                  const c = FIAT_OPTIONS.find(f => f.code === activeCountry) ?? FIAT_OPTIONS[0];
                  return (
                    <button onClick={() => { setShowCountryDrop(p => !p); setShowAssetDrop(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER}`, color: "var(--ink)" }}>
                      <span className="text-base leading-none">{c.flag}</span>
                      <span className="flex-1 text-left">{c.code}</span>
                      <ChevronDown size={12} style={{ color: "var(--subtle)" }} />
                    </button>
                  );
                })()}
                {showCountryDrop && (
                  <div className="absolute right-0 top-10 z-50 rounded-xl shadow-2xl overflow-hidden w-52 max-h-64 overflow-y-auto"
                    style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", border: `1px solid rgba(255,255,255,0.72)` }}>
                    {FIAT_OPTIONS.map(f => (
                      <button key={f.code} onClick={() => { setActiveCountry(f.code); setShowCountryDrop(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-white/5"
                        style={{ color: f.code === activeCountry ? BLUE : "var(--subtle)" }}>
                        <span className="text-base leading-none">{f.flag}</span>
                        <span className="flex-1 text-left">{f.name}</span>
                        <span style={{ color: "var(--subtle)" }}>{f.symbol}</span>
                        {f.code === activeCountry && <CheckCircle2 size={10} style={{ color: BLUE }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Row 2: Search + filter ── */}
            <div className="px-4 pb-2 flex gap-2 shrink-0">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
                style={{ ...GLASS_H }}>
                <Search size={12} style={{ color: "var(--subtle)" }} />
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
                  placeholder="Search merchants..."
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: "var(--ink)" }} />
              </div>
              <button className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium"
                style={{ background: "rgba(255,255,255,0.55)", border: `1px solid ${BORDER_S}`, color: "var(--subtle)" }}>
                <SlidersHorizontal size={12} /> Filter
              </button>
            </div>

            {/* ── Row 3: Large Buy / Sell buttons ── */}
            <div className="px-4 pb-3 flex gap-2 shrink-0">
              <button onClick={() => setBuySell("buy")}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{
                  background: buySell === "buy" ? `linear-gradient(135deg,${GREEN},${GREEN_D})` : "rgba(255,255,255,0.55)",
                  color: buySell === "buy" ? "#fff" : "#64748b",
                  border: `1px solid ${buySell === "buy" ? GREEN : BORDER_S}`,
                }}>
                Buy {activeAsset}
              </button>
              <button onClick={() => setBuySell("sell")}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{
                  background: buySell === "sell" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.55)",
                  color: buySell === "sell" ? "#f87171" : "#64748b",
                  border: `1px solid ${buySell === "sell" ? "#f87171" : BORDER_S}`,
                }}>
                Sell {activeAsset}
              </button>
            </div>

            {/* P2PPanel — real offers + order flow, controlled by parent */}
            <div className="flex-1 overflow-hidden">
              <P2PPanel
                side={buySell}
                asset={activeAsset}
                fiat={activeCountry}
                searchQ={searchQ}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center border-t relative"
        style={{ background: CARD, borderColor: BORDER }}>
        {([
          { id: "topOffers", label: "Swap",      icon: <ArrowRightLeft size={16} /> },
          { id: "offers",    label: "Offers",    icon: <TrendingUp size={16} />     },
          { id: "myOrders",  label: "My Orders", icon: <CheckCircle2 size={16} />   },
        ] as { id: P2PTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-all"
            style={{ color: activeTab === t.id ? BLUE : "var(--subtle)" }}>
            {t.icon}
            <span className="text-[10px] font-semibold">{t.label}</span>
            {activeTab === t.id && (
              <span className="absolute bottom-0 w-8 h-0.5 rounded-t-full" style={{ background: BLUE }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
