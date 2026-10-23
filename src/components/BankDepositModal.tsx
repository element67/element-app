/**
 * BankDepositModal — country-aware local bank deposit flow.
 *
 * Flow:
 *  1. User picks their country / currency
 *  2. User enters amount
 *  3. App shows virtual account details (or provider info when not yet live)
 *  4. User pays from their bank app
 *  5. "I've paid" → deposit marked pending
 *  6. In demo mode, a 3s timer confirms it (production: webhook from Flutterwave/Paystack)
 *
 * All integrations are clearly labelled as "coming soon" until API keys are configured.
 * Never credits balance based on user claim alone in production mode.
 */
import { useState } from "react";
import {
  X, Building2, AlertCircle, CheckCircle2, Clock,
  Copy, ChevronDown, Banknote, Info, ExternalLink,
} from "lucide-react";
import {
  useFiatStore, FIAT_COUNTRIES, type FiatDeposit,
} from "@/store/fiatStore";
import { useWalletStore } from "@/store/walletStore";
import { useFxDisplay } from "@/hooks/useFxDisplay";

interface Props {
  defaultCurrency?: string;
  onClose: () => void;
}

// Demo virtual account details (production: Flutterwave createVirtualAccount)
const DEMO_VA: Record<string, { accountNumber: string; bankName: string; accountName: string }> = {
  NGN: { accountNumber: "0123456789", bankName: "Wema Bank (Flutterwave)", accountName: "RushPay / Your Name" },
  GHS: { accountNumber: "GH-00-12345678", bankName: "Ecobank Ghana (Flutterwave)", accountName: "RushPay / Your Name" },
  KES: { accountNumber: "254700000001", bankName: "M-Pesa (Safaricom)", accountName: "RushPay Agent" },
  ZAR: { accountNumber: "9876543210", bankName: "FNB (Flutterwave)", accountName: "RushPay / Your Name" },
};

type Step = "country" | "amount" | "pay" | "pending" | "confirmed";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
      <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "var(--subtle)" }}>{label}</div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold mono" style={{ color: "var(--ink)" }}>{value}</span>
        <button onClick={copy} className="shrink-0">
          {copied
            ? <CheckCircle2 size={13} style={{ color: "var(--buy)" }} />
            : <Copy size={13} style={{ color: "var(--subtle)" }} />}
        </button>
      </div>
    </div>
  );
}

export function BankDepositModal({ defaultCurrency, onClose }: Props) {
  const initiateDeposit = useFiatStore(s => s.initiateDeposit);
  const confirmDeposit  = useFiatStore(s => s.confirmDeposit);
  const addAlert        = useWalletStore(s => s.addAlert);
  const fx = useFxDisplay();

  const [step,        setStep]        = useState<Step>(defaultCurrency ? "amount" : "country");
  const [currency,    setCurrency]    = useState(defaultCurrency ?? "NGN");
  const [amount,      setAmount]      = useState("");
  const [deposit,     setDeposit]     = useState<FiatDeposit | null>(null);
  const [confirming,  setConfirming]  = useState(false);

  const countryConfig = FIAT_COUNTRIES.find(c => c.currency === currency)
    ?? FIAT_COUNTRIES[0];
  const provider = countryConfig.providers[0];
  const va = DEMO_VA[currency];

  const numAmt = parseFloat(amount) || 0;
  const feeBps = provider?.feeBps ?? 150;
  const fee    = Math.round(numAmt * feeBps) / 10000;
  const net    = numAmt - fee;

  function handleSelectCurrency(c: string) {
    setCurrency(c);
    setStep("amount");
  }

  function handleConfirmAmount() {
    if (numAmt < (countryConfig.minDeposit ?? 0)) return;
    const dep = initiateDeposit({
      currency,
      amount: numAmt,
      provider: provider?.id ?? "manual",
      feeBps,
      accountName:   va?.accountName,
      accountNumber: va?.accountNumber,
      bankName:      va?.bankName,
    });
    setDeposit(dep);
    setStep("pay");
  }

  function handleIPaid() {
    if (!deposit) return;
    setStep("pending");
    setConfirming(true);
    // Demo: simulate 3s provider webhook
    setTimeout(() => {
      confirmDeposit(deposit.id, `DEMO_${deposit.id}`);
      addAlert(`${countryConfig.symbol}${numAmt.toLocaleString()} ${currency} deposit confirmed`, "success");
      setConfirming(false);
      setStep("confirmed");
    }, 3000);
  }

  const isComingSoon = countryConfig.depositStatus !== "live";

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)", maxHeight: "92vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <Building2 size={16} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>Bank Deposit</span>
          </div>
          <button onClick={onClose}><X size={18} style={{ color: "var(--subtle)" }} /></button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── STEP: Country selector ──────────────────────────────────────── */}
          {step === "country" && (
            <div>
              <div className="text-xs font-semibold mb-3" style={{ color: "var(--ink)" }}>Select your country</div>
              <div className="space-y-2">
                {FIAT_COUNTRIES.map(c => (
                  <button key={c.countryCode}
                    onClick={() => handleSelectCurrency(c.currency)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-opacity hover:opacity-80"
                    style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://flagcdn.com/w20/${c.countryCode.toLowerCase()}.png`}
                        srcSet={`https://flagcdn.com/w40/${c.countryCode.toLowerCase()}.png 2x`}
                        alt={c.countryName}
                        className="w-5 h-3.5 rounded-sm object-cover"
                        onError={e => { (e.currentTarget).style.display = "none"; }}
                      />
                      <div className="text-left">
                        <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{c.countryName}</div>
                        <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{c.currency} · {c.providers.map(p => p.name).join(", ") || "Manual"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.depositStatus === "coming_soon" && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>Soon</span>
                      )}
                      <ChevronDown size={12} style={{ color: "var(--subtle)", transform: "rotate(-90deg)" }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: Amount entry ──────────────────────────────────────────── */}
          {step === "amount" && (
            <div>
              {/* Coming soon banner */}
              {isComingSoon && (
                <div className="flex gap-2 px-3 py-2.5 rounded-xl mb-4"
                  style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                  <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
                  <div>
                    <div className="text-[10px] font-semibold" style={{ color: "#fbbf24" }}>Integration coming soon</div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>
                      {provider?.name ?? "Local bank"} deposits via RushPay require API configuration.
                      This demo flow shows the UX — real funds require credentials.
                      {" "}
                      <a href="https://flutterwave.com/ng/developers" target="_blank" rel="noopener noreferrer"
                        className="underline inline-flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                        Flutterwave docs <ExternalLink size={9} />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Country chip */}
              <button onClick={() => setStep("country")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-xs"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)", color: "var(--ink)" }}>
                <img
                  src={`https://flagcdn.com/w20/${countryConfig.countryCode.toLowerCase()}.png`}
                  alt="" className="w-4 h-3 rounded-sm object-cover"
                  onError={e => { (e.currentTarget).style.display = "none"; }}
                />
                {countryConfig.countryName} · {countryConfig.currency}
                <ChevronDown size={11} style={{ color: "var(--subtle)" }} />
              </button>

              {/* Amount input */}
              <div className="rounded-xl px-4 py-4" style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>Amount ({currency})</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-bold" style={{ color: "var(--subtle)" }}>{countryConfig.symbol}</span>
                  <input
                    value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0"
                    placeholder="0"
                    className="flex-1 text-2xl font-bold bg-transparent outline-none"
                    style={{ color: "var(--ink)" }}
                  />
                </div>
                {numAmt > 0 && (
                  <div className="text-[10px] mt-2" style={{ color: "var(--subtle)" }}>
                    Fee: {countryConfig.symbol}{fee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    {" · "}You receive: {countryConfig.symbol}{net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                )}
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2 flex-wrap mt-2">
                {[1000, 5000, 10000, 50000].map(v => (
                  <button key={v} onClick={() => setAmount(String(v))}
                    className="px-3 py-1 rounded-full text-[10px] font-semibold"
                    style={{ background: "var(--surface-high)", border: "1px solid var(--border)", color: "var(--accent)" }}>
                    {countryConfig.symbol}{v.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Provider info */}
              {provider && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl mt-2"
                  style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                  <Banknote size={13} style={{ color: "var(--accent)" }} />
                  <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                    Powered by <span style={{ color: "var(--ink)", fontWeight: 600 }}>{provider.name}</span>
                    {" · "}{(feeBps / 100).toFixed(2)}% fee
                    {" · "}Min {countryConfig.symbol}{countryConfig.minDeposit.toLocaleString()}
                  </div>
                </div>
              )}

              <button
                onClick={handleConfirmAmount}
                disabled={numAmt < (countryConfig.minDeposit ?? 0)}
                className="w-full py-3 rounded-xl text-xs font-bold mt-4 disabled:opacity-40"
                style={{ background: "var(--accent)", color: "#fff" }}>
                Continue →
              </button>
            </div>
          )}

          {/* ── STEP: Payment instructions ──────────────────────────────────── */}
          {step === "pay" && deposit && (
            <div>
              <div className="text-xs font-semibold mb-3" style={{ color: "var(--ink)" }}>
                Transfer {countryConfig.symbol}{numAmt.toLocaleString()} to this account
              </div>

              {va ? (
                <div className="space-y-2 mb-4">
                  <CopyField label="Bank" value={va.bankName} />
                  <CopyField label="Account number" value={va.accountNumber} />
                  <CopyField label="Account name" value={va.accountName} />
                  <CopyField label="Amount" value={`${countryConfig.symbol}${numAmt.toLocaleString()}`} />
                  <CopyField label="Reference" value={deposit.id} />
                </div>
              ) : (
                <div className="px-3 py-3 rounded-xl mb-4 text-xs"
                  style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>
                  Virtual account generation requires Flutterwave API credentials.
                  Contact support to complete this deposit.
                </div>
              )}

              <div className="flex gap-2 px-3 py-2.5 rounded-xl mb-4"
                style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                <Info size={13} className="shrink-0 mt-0.5" style={{ color: "#60a5fa" }} />
                <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                  This is a demo flow. In production, RushPay verifies your payment
                  via a provider webhook before crediting your balance.
                  Never send real funds to these demo account numbers.
                </div>
              </div>

              {isComingSoon && (
                <div className="flex gap-2 px-3 py-2.5 rounded-xl mb-4"
                  style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                  <AlertCircle size={13} className="shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
                  <div className="text-[10px]" style={{ color: "#fbbf24" }}>
                    Bank deposits are not yet live. Clicking "I've paid" will simulate a confirmed deposit for demo purposes only.
                  </div>
                </div>
              )}

              <button onClick={handleIPaid}
                className="w-full py-3 rounded-xl text-xs font-bold"
                style={{ background: "var(--buy)", color: "#fff" }}>
                I've paid — confirm deposit
              </button>
            </div>
          )}

          {/* ── STEP: Pending confirmation ──────────────────────────────────── */}
          {step === "pending" && (
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4 animate-pulse"
                style={{ background: "rgba(251,191,36,0.12)", border: "2px solid rgba(251,191,36,0.3)" }}>
                <Clock size={24} style={{ color: "#fbbf24" }} />
              </div>
              <div className="text-sm font-bold mb-1" style={{ color: "var(--ink)" }}>Waiting for confirmation</div>
              <div className="text-xs" style={{ color: "var(--subtle)" }}>
                {isComingSoon
                  ? "Simulating provider confirmation…"
                  : `${provider?.name ?? "Provider"} is verifying your payment`}
              </div>
              {confirming && (
                <div className="mt-4 text-[10px]" style={{ color: "var(--subtle)" }}>This usually takes a few seconds in demo mode.</div>
              )}
            </div>
          )}

          {/* ── STEP: Confirmed ─────────────────────────────────────────────── */}
          {step === "confirmed" && (
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4"
                style={{ background: "rgba(74,222,128,0.12)", border: "2px solid rgba(74,222,128,0.3)" }}>
                <CheckCircle2 size={24} style={{ color: "var(--buy)" }} />
              </div>
              <div className="text-sm font-bold mb-1" style={{ color: "var(--ink)" }}>Deposit confirmed!</div>
              <div className="text-2xl font-bold mb-1" style={{ color: "var(--buy)" }}>
                {countryConfig.symbol}{net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs mb-1" style={{ color: "var(--subtle)" }}>{currency} added to your wallet</div>
              <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                ≈ {fx.fmt(net / (FIAT_RATE[currency] ?? 1))}
              </div>
              <button onClick={onClose}
                className="mt-6 w-full py-2.5 rounded-xl text-xs font-bold"
                style={{ background: "var(--accent)", color: "#fff" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Approximate USD conversion for display only (real rates from marketplaceStore)
const FIAT_RATE: Record<string, number> = {
  NGN: 1650, GHS: 15.5, KES: 130, ZAR: 18.5,
  GBP: 0.79, EUR: 0.92, USD: 1, TZS: 2650, UGX: 3750,
};
