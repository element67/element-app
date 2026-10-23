/**
 * Local-Currency Account Dashboard — full design-reference implementation.
 * Screens: Dashboard · Deposit · Send Money
 *
 * Backend: /api/fiat/register, /api/fiat/lookup, /api/fiat/send, /api/fiat/sync
 * Production requirements:
 *   FLUTTERWAVE_SECRET_KEY  — NGN/GHS/KES virtual accounts + webhooks
 *   PAYSTACK_SECRET_KEY     — alternative NGN virtual accounts
 *   STRIPE_SECRET_KEY       — USD/GBP/EUR bank transfers
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Eye, EyeOff, Download, Send, Upload, QrCode,
  ChevronRight, Copy, CheckCircle2, Clock, AlertCircle,
  X, Loader2, User, RefreshCw, Smartphone, Zap, Tv,
  ShoppingBag, Plane, MoreHorizontal, Building2, Wallet,
  ArrowRightLeft, Globe, Shield, Wifi, Droplets, GraduationCap,
  Lock, Fingerprint, ToggleRight, ChevronDown, Check, Banknote,
} from "lucide-react";
import { usePriceStore } from "@/store/priceStore";
import { useWalletStore } from "@/store/walletStore";
import { useFiatStore, FIAT_COUNTRIES } from "@/store/fiatStore";
import { useCountry } from "@/hooks/useCountry";
import { useSharedWallet as useNativeWallet } from "@/context/NativeWalletContext";

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, symbol: string, dec: number) {
  return symbol + n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtTs(ts: number) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60)    return "just now";
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Static USD rates (used only for display estimates)
const USD_RATE: Record<string, number> = {
  NGN: 1650, GHS: 15.5, KES: 130, ZAR: 18.5, GBP: 0.79, EUR: 0.92,
  USD: 1, TZS: 2650, UGX: 3750, INR: 84, BRL: 5.0, MXN: 17.5, CAD: 1.36,
};

type Screen = "dashboard" | "deposit" | "send" | "withdraw" | "receive" | "history" | "payments" | "exchange" | "country" | "security";

// ─── Deposit method data ──────────────────────────────────────────────────────
const DEPOSIT_METHODS = [
  {
    id: "bank_transfer",
    icon: Building2,
    name: "Bank Transfer",
    desc: "Transfer from your bank account",
    color: "#00a651",
    available: true,
  },
  {
    id: "opay",
    icon: Smartphone,
    name: "OPay",
    desc: "Fast and secure",
    color: "#2563eb",
    available: false,
    note: "Requires OPay API key",
  },
  {
    id: "card",
    icon: Wallet,
    name: "Card Payment",
    desc: "Visa / Mastercard / Verve",
    color: "#7c3aed",
    available: false,
    note: "Requires Stripe / Flutterwave key",
  },
  {
    id: "ussd",
    icon: Globe,
    name: "USSD",
    desc: "Dial code to fund your wallet",
    color: "#d97706",
    available: false,
    note: "Coming soon",
  },
];

// ─── Virtual account details per country (demo) ───────────────────────────────
const VIRTUAL_ACCOUNTS: Record<string, { bankName: string; accountName: string; accountNumber: string; sortRef?: string }> = {
  NG: { bankName: "Providus Bank", accountName: "RushPay / User", accountNumber: "0000000000", sortRef: "Reference: your username" },
  GH: { bankName: "Ecobank Ghana",  accountName: "RushPay / User", accountNumber: "0000000000", sortRef: "Reference: your username" },
  KE: { bankName: "Equity Bank",    accountName: "RushPay / User", accountNumber: "0000000000", sortRef: "Reference: your username" },
  ZA: { bankName: "Capitec Bank",   accountName: "RushPay / User", accountNumber: "0000000000", sortRef: "Branch: 470010" },
  GB: { bankName: "Barclays Bank",  accountName: "RushPay / User", accountNumber: "00000000",   sortRef: "Sort code: 20-00-00" },
  US: { bankName: "Chase Bank",     accountName: "RushPay / User", accountNumber: "000000000",  sortRef: "Routing: 021000021" },
  EU: { bankName: "Deutsche Bank",  accountName: "RushPay / User", accountNumber: "DE00000000000000000000", sortRef: "BIC: DEUTDEDB" },
};

// ─── Quick services ───────────────────────────────────────────────────────────
const QUICK_SERVICES = [
  { icon: Smartphone, label: "Airtime &\nData",  color: "#2563eb", available: true  },
  { icon: Zap,        label: "Bills",             color: "#d97706", available: true  },
  { icon: Tv,         label: "TV",                color: "#7c3aed", available: false },
  { icon: Shield,     label: "Electricity",       color: "#16a34a", available: true  },
  { icon: ShoppingBag,label: "Shopping",          color: "#db2777", available: false },
  { icon: Plane,      label: "Flights",           color: "#0891b2", available: false },
  { icon: MoreHorizontal, label: "More",          color: "#6b7280", available: true  },
];

// ─── StatusBadge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    completed:  { bg: "rgba(0,166,81,0.15)",  color: "#00a651", label: "Completed" },
    confirmed:  { bg: "rgba(0,166,81,0.15)",  color: "#00a651", label: "Completed" },
    pending:    { bg: "rgba(234,179,8,0.15)", color: "#ca8a04", label: "Pending"   },
    initiated:  { bg: "rgba(234,179,8,0.15)", color: "#ca8a04", label: "Pending"   },
    failed:     { bg: "rgba(239,68,68,0.15)", color: "#ef4444", label: "Failed"    },
  };
  const s = map[status] ?? map.pending;
  return (
    <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
      style={{ background: s.bg, color: s.color }}>{s.label}</span>
  );
}

// ─── DetailRow ────────────────────────────────────────────────────────────────
function DetailRow({ label, value, copyKey, copied, onCopy }: {
  label: string; value: string; copyKey: string;
  copied: string | null; onCopy: (val: string, key: string) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3"
      style={{ borderBottom: "1px solid rgba(0,166,81,0.12)" }}>
      <div>
        <div className="text-[10px] mb-0.5" style={{ color: "var(--subtle)" }}>{label}</div>
        <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{value}</div>
      </div>
      <button onClick={() => onCopy(value, copyKey)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium"
        style={{ background: "rgba(255,255,255,0.90)", color: "var(--ink)" }}>
        {copied === copyKey ? <CheckCircle2 size={12} /> : <Copy size={12} />}
        {copied === copyKey ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ─── BankTransferDeposit ──────────────────────────────────────────────────────
function BankTransferDeposit({ countryCode, currency, symbol, decimals, onClose, onInitiate }: {
  countryCode: string; currency: string; symbol: string; decimals: number;
  onClose: () => void;
  onInitiate: (amount: number) => void;
}) {
  const va = VIRTUAL_ACCOUNTS[countryCode] ?? VIRTUAL_ACCOUNTS["NG"];
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (val: string, key: string) => {
    void navigator.clipboard.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };



  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onClose} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
          <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
        </button>
        <div>
          <div className="text-base font-bold text-[var(--ink)]">Deposit</div>
          <div className="text-[11px]" style={{ color: "var(--subtle)" }}>Bank Transfer</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Balance pill */}
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl" style={{ background: "rgba(0,166,81,0.12)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg" style={{ background: "rgba(0,166,81,0.2)" }}>
            🇳🇬
          </div>
          <div>
            <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{currency} · Current Balance</div>
            <div className="text-sm font-bold text-[var(--ink)]">{symbol}368,450.00</div>
          </div>
        </div>

        {/* Bank details card */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: "rgba(0,166,81,0.08)", border: "1px solid rgba(0,166,81,0.2)" }}>
          <div className="text-sm font-bold mb-3 text-[var(--ink)]">Your Receiving Details</div>
          <DetailRow label="Bank Name"      value={va.bankName}      copyKey="bank" copied={copied} onCopy={copy} />
          <DetailRow label="Account Name"   value={va.accountName}   copyKey="name" copied={copied} onCopy={copy} />
          <DetailRow label="Account Number" value={va.accountNumber} copyKey="acct" copied={copied} onCopy={copy} />
          {va.sortRef && <DetailRow label="Reference" value={va.sortRef} copyKey="ref" copied={copied} onCopy={copy} />}
        </div>

        {/* Copy all */}
        <button
          onClick={() => copy(`Bank: ${va.bankName}\nAccount Name: ${va.accountName}\nAccount Number: ${va.accountNumber}${va.sortRef ? `\n${va.sortRef}` : ""}`, "all")}
          className="w-full py-3 rounded-xl text-sm font-semibold mb-4 flex items-center justify-center gap-2"
          style={{ background: "rgba(0,166,81,0.15)", color: "#00a651", border: "1px solid rgba(0,166,81,0.3)" }}>
          <Copy size={14} />
          {copied === "all" ? "Copied!" : "Copy All Details"}
        </button>

        {/* Amount input */}
        <div className="mb-4">
          <div className="text-[11px] mb-1.5 font-medium" style={{ color: "var(--subtle)" }}>
            I want to deposit ({currency})
          </div>
          <div className="flex items-center px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.80)", border: "1px solid rgba(255,255,255,0.90)" }}>
            <span className="text-[var(--ink)] text-sm mr-2">{symbol}</span>
            <input
              value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00"
              className="flex-1 bg-transparent outline-none text-base font-semibold text-[var(--ink)]"
            />
          </div>
        </div>

        {/* Demo notice */}
        <div className="p-3 rounded-xl mb-4" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
          <div className="flex items-start gap-2">
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: "#ca8a04" }} />
            <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
              Demo mode — account details are illustrative. Configure Flutterwave or Paystack to activate real virtual accounts and automatic balance updates.
            </div>
          </div>
        </div>

        <button
          onClick={() => { if (parseFloat(amount) > 0) onInitiate(parseFloat(amount)); }}
          disabled={!amount || parseFloat(amount) <= 0}
          className="w-full py-4 rounded-xl text-sm font-bold disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#00a651,#007a3d)", backdropFilter: "blur(12px)", color: "var(--ink)" }}>
          I've Made the Transfer
        </button>
      </div>
    </div>
  );
}

// ─── DepositScreen ────────────────────────────────────────────────────────────
function DepositScreen({ countryCode, currency, symbol, decimals, onBack, onInitiate }: {
  countryCode: string; currency: string; symbol: string; decimals: number;
  onBack: () => void;
  onInitiate: (amount: number) => void;
}) {
  const [showBankTransfer, setShowBankTransfer] = useState(false);

  if (showBankTransfer) {
    return (
      <BankTransferDeposit
        countryCode={countryCode} currency={currency} symbol={symbol} decimals={decimals}
        onClose={() => setShowBankTransfer(false)}
        onInitiate={amt => { onInitiate(amt); setShowBankTransfer(false); onBack(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
          <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
        </button>
        <div className="text-base font-bold text-[var(--ink)]">Deposit</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Balance pill */}
        <div className="flex items-center justify-between p-4 rounded-2xl mb-6" style={{ background: "rgba(0,166,81,0.1)", border: "1px solid rgba(0,166,81,0.2)" }}>
          <div className="flex items-center gap-3">
            <div className="text-2xl">🇳🇬</div>
            <div>
              <div className="text-sm font-bold text-[var(--ink)]">Naira ({currency})</div>
              <div className="text-[11px]" style={{ color: "var(--subtle)" }}>Current Balance</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-bold" style={{ color: "#00a651" }}>{symbol}368,450.00</div>
          </div>
        </div>

        <div className="text-sm font-semibold text-[var(--ink)] mb-3">Select Payment Method</div>

        {/* Methods */}
        {DEPOSIT_METHODS.map(m => {
          const Icon = m.icon;
          return (
            <button key={m.id}
              onClick={() => { if (m.available || m.id === "bank_transfer") setShowBankTransfer(true); }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl mb-3 text-left transition-opacity"
              style={{ background: "rgba(255,255,255,0.78)", border: "1px solid rgba(255,255,255,0.85)", opacity: m.available ? 1 : 0.6 }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${m.color}22` }}>
                <Icon size={20} style={{ color: m.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[var(--ink)]">{m.name}</div>
                <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
                  {m.available ? m.desc : (m.note ?? m.desc)}
                </div>
              </div>
              {m.available
                ? <ChevronRight size={16} style={{ color: "var(--subtle)" }} />
                : <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: "rgba(100,116,139,0.12)", color: "var(--subtle)" }}>Soon</span>
              }
            </button>
          );
        })}

        {/* Recent deposits */}
        <div className="flex items-center justify-between mt-6 mb-3">
          <div className="text-sm font-semibold text-[var(--ink)]">Recent Deposits</div>
          <button className="text-[11px]" style={{ color: "#00a651" }}>View all &gt;</button>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)" }}>
          <div className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(0,166,81,0.15)" }}>
              <Building2 size={16} style={{ color: "#00a651" }} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--ink)]">Bank Transfer</div>
              <div className="text-[11px]" style={{ color: "var(--subtle)" }}>Apr 21, 2025 · 10:24 AM</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold" style={{ color: "#00a651" }}>+{symbol}50,000</div>
              <StatusBadge status="completed" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SendScreen ───────────────────────────────────────────────────────────────
function SendScreen({ balance, currency, symbol, decimals, walletId, onBack }: {
  balance: number; currency: string; symbol: string; decimals: number;
  walletId: string; onBack: () => void;
}) {
  const lookupAccount = useFiatStore(s => s.lookupAccount);
  const sendFiat      = useFiatStore(s => s.sendFiat);

  const [tab,          setTab]          = useState<"user" | "bank">("user");
  const [recipient,    setRecipient]    = useState("");
  const [resolved,     setResolved]     = useState<{ accountNumber: string; displayName: string; currency: string } | null>(null);
  const [lookupErr,    setLookupErr]    = useState("");
  const [looking,      setLooking]      = useState(false);
  const [amount,       setAmount]       = useState("");
  const [note,         setNote]         = useState("");
  const [step,         setStep]         = useState<"input" | "confirm" | "done" | "error">("input");
  const [sending,      setSending]      = useState(false);
  const [sendErr,      setSendErr]      = useState("");
  const [txId,         setTxId]         = useState("");

  const amt = parseFloat(amount) || 0;
  const canContinue = resolved && amt >= 1 && amt <= balance;
  const fmtBal = (n: number) => fmt(n, symbol, decimals);

  const handleLookup = async () => {
    const q = recipient.trim();
    if (!q) return;
    setLookupErr(""); setLooking(true); setResolved(null);
    try {
      const acct = await lookupAccount(q.replace(/\D/g, ""));
      setResolved(acct);
    } catch (e) {
      setLookupErr(e instanceof Error ? e.message : "Recipient not found");
    } finally {
      setLooking(false);
    }
  };

  const handleSend = async () => {
    if (!resolved || !canContinue) return;
    setSending(true); setSendErr("");
    try {
      const r = await sendFiat({ fromWalletId: walletId, toAccountNumber: resolved.accountNumber, currency, amount: amt, note });
      setTxId(r.id);
      setStep("done");
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Transfer failed");
      setStep("error");
    } finally {
      setSending(false);
    }
  };

  if (step === "done") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: "rgba(0,166,81,0.15)" }}>
          <CheckCircle2 size={40} style={{ color: "#00a651" }} />
        </div>
        <div className="text-2xl font-bold text-[var(--ink)] mb-2">Payment Successful</div>
        <div className="text-3xl font-bold mb-1" style={{ color: "#00a651" }}>{fmtBal(amt)}</div>
        <div className="text-sm mb-1" style={{ color: "var(--subtle)" }}>Sent to {resolved?.displayName}</div>
        <div className="text-[10px] font-mono mb-8" style={{ color: "var(--subtle)" }}>{txId}</div>
        <button onClick={onBack}
          className="w-full max-w-xs py-4 rounded-2xl text-sm font-bold text-[var(--ink)] mb-3"
          style={{ background: "linear-gradient(135deg,#00a651,#007a3d)", backdropFilter: "blur(12px)" }}>
          View Receipt
        </button>
        <button onClick={onBack} className="text-sm" style={{ color: "var(--subtle)" }}>Back to Home</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
          <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
        </button>
        <div className="text-base font-bold text-[var(--ink)]">Send Money</div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Balance pill */}
        <div className="flex items-center justify-between p-4 rounded-2xl mb-5" style={{ background: "rgba(0,166,81,0.1)", border: "1px solid rgba(0,166,81,0.2)" }}>
          <div className="flex items-center gap-3">
            <div className="text-2xl">🇳🇬</div>
            <div>
              <div className="text-sm font-bold text-[var(--ink)]">Naira ({currency})</div>
              <div className="text-[11px]" style={{ color: "var(--subtle)" }}>Balance: {fmtBal(balance)}</div>
            </div>
          </div>
          <ChevronRight size={16} style={{ color: "var(--subtle)" }} />
        </div>

        {step === "input" && (
          <>
            {/* Tabs */}
            <div className="flex rounded-xl p-1 mb-5" style={{ background: "rgba(255,255,255,0.80)" }}>
              {(["user", "bank"] as const).map(t => (
                <button key={t} onClick={() => { setTab(t); setResolved(null); setLookupErr(""); }}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    background: tab === t ? "#00a651" : "transparent",
                    color: tab === t ? "#fff" : "rgba(255,255,255,0.5)",
                  }}>
                  {t === "user" ? "To User" : "To Bank"}
                </button>
              ))}
            </div>

            {tab === "user" ? (
              <>
                <div className="text-[11px] mb-1.5 font-medium" style={{ color: "var(--subtle)" }}>Recipient</div>
                <div className="flex gap-2 mb-1">
                  <input
                    value={recipient}
                    onChange={e => { setRecipient(e.target.value); setResolved(null); setLookupErr(""); }}
                    placeholder="Username or ARC account number"
                    className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                    style={{ background: "rgba(255,255,255,0.80)", color: "var(--ink)", border: "1px solid rgba(255,255,255,0.90)" }}
                  />
                  <button onClick={() => { void handleLookup(); }} disabled={looking || !recipient.trim()}
                    className="px-4 py-3 rounded-xl disabled:opacity-40"
                    style={{ background: "rgba(0,166,81,0.2)", color: "#00a651" }}>
                    {looking ? <Loader2 size={16} className="animate-spin" /> : <User size={16} />}
                  </button>
                </div>
                {lookupErr && <div className="text-[11px] mb-3" style={{ color: "#ef4444" }}>{lookupErr}</div>}

                {resolved && (
                  <div className="flex items-center gap-3 p-3 rounded-xl mb-4"
                    style={{ background: "rgba(0,166,81,0.08)", border: "1px solid rgba(0,166,81,0.3)" }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={{ background: "#00a651", color: "var(--ink)" }}>
                      {resolved.displayName[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-[var(--ink)]">{resolved.displayName}</div>
                      <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                        ARC #{resolved.accountNumber} · {resolved.currency}
                      </div>
                    </div>
                    <CheckCircle2 size={16} style={{ color: "#00a651" }} />
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-xl mb-4 text-center" style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)" }}>
                <Building2 size={24} className="mx-auto mb-2" style={{ color: "var(--subtle)" }} />
                <div className="text-sm text-[var(--ink)] mb-1">Bank Transfers</div>
                <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
                  Requires Flutterwave or Paystack credentials to send to external bank accounts.
                </div>
                <div className="mt-2 text-[10px] px-3 py-1.5 rounded-full inline-block"
                  style={{ background: "rgba(100,116,139,0.12)", color: "var(--subtle)" }}>Coming soon</div>
              </div>
            )}

            {/* Amount */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-medium" style={{ color: "var(--subtle)" }}>Amount</div>
                <button onClick={() => setAmount(String(balance))}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(0,166,81,0.15)", color: "#00a651" }}>MAX</button>
              </div>
              <div className="flex items-center px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.80)", border: "1px solid rgba(255,255,255,0.90)" }}>
                <span className="text-base font-bold mr-2" style={{ color: "var(--subtle)" }}>{symbol}</span>
                <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00"
                  className="flex-1 bg-transparent outline-none text-xl font-bold text-[var(--ink)]" />
              </div>
              {amt > 0 && amt > balance && (
                <div className="text-[11px] mt-1" style={{ color: "#ef4444" }}>Insufficient balance</div>
              )}
              <div className="text-[10px] mt-1" style={{ color: "var(--subtle)" }}>
                Available: {fmtBal(balance)} · Fee: Free
              </div>
            </div>

            {/* Note */}
            <div className="mb-6">
              <div className="text-[11px] mb-1.5 font-medium" style={{ color: "var(--subtle)" }}>Add a message (optional)</div>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Write something..."
                className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.80)", color: "var(--ink)", border: "1px solid rgba(255,255,255,0.90)" }} />
            </div>

            <button disabled={!canContinue} onClick={() => setStep("confirm")}
              className="w-full py-4 rounded-2xl text-sm font-bold disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#00a651,#007a3d)", backdropFilter: "blur(12px)", color: "var(--ink)" }}>
              Continue
            </button>
          </>
        )}

        {step === "confirm" && resolved && (
          <>
            <div className="p-4 rounded-2xl mb-4" style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)" }}>
              {[
                { label: "To",      value: resolved.displayName },
                { label: "Account", value: `ARC #${resolved.accountNumber}` },
                { label: "Amount",  value: fmtBal(amt) },
                { label: "Fee",     value: "Free" },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-sm py-2.5"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.80)" }}>
                  <span style={{ color: "var(--subtle)" }}>{row.label}</span>
                  <span className="font-semibold text-[var(--ink)]">{row.value}</span>
                </div>
              ))}
              {note && (
                <div className="mt-2 text-[11px] italic" style={{ color: "var(--subtle)" }}>"{note}"</div>
              )}
            </div>

            {sendErr && <div className="text-[11px] mb-3" style={{ color: "#ef4444" }}>{sendErr}</div>}

            <div className="flex gap-3">
              <button onClick={() => setStep("input")}
                className="flex-1 py-4 rounded-2xl text-sm font-medium"
                style={{ background: "rgba(255,255,255,0.80)", color: "var(--subtle)" }}>
                Back
              </button>
              <button onClick={() => { void handleSend(); }} disabled={sending}
                className="flex-1 py-4 rounded-2xl text-sm font-bold disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#00a651,#007a3d)", backdropFilter: "blur(12px)", color: "var(--ink)" }}>
                {sending ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Send Now"}
              </button>
            </div>
          </>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <AlertCircle size={40} style={{ color: "#ef4444" }} />
            <div className="text-lg font-bold text-[var(--ink)]">Transfer Failed</div>
            <div className="text-sm text-center" style={{ color: "var(--subtle)" }}>{sendErr}</div>
            <button onClick={() => setStep("confirm")}
              className="mt-4 px-8 py-3 rounded-2xl text-sm font-bold"
              style={{ background: "linear-gradient(135deg,#00a651,#007a3d)", backdropFilter: "blur(12px)", color: "var(--ink)" }}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WithdrawScreen ───────────────────────────────────────────────────────────
function WithdrawScreen({ currency, symbol, decimals, balance, onBack }: {
  currency: string; symbol: string; decimals: number; balance: number; onBack: () => void;
}) {
  const fmtBal = (n: number) => fmt(n, symbol, decimals);
  const METHODS = [
    { icon: Building2, name: "Bank Account",  desc: "Withdraw to your bank",          color: "#00a651", available: false, note: "Requires Flutterwave / Paystack" },
    { icon: Smartphone,name: "Mobile Money",  desc: "OPay, Palmpay and more",         color: "#2563eb", available: false, note: "Requires OPay / Palmpay key" },
    { icon: Wallet,    name: "Card Withdrawal",desc: "Visa / Mastercard",             color: "#7c3aed", available: false, note: "Requires Stripe key" },
    { icon: Banknote,  name: "Crypto (USDC)", desc: "Convert to USDC on Arc",         color: "#f59e0b", available: true,  note: "Available via Exchange" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
          <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
        </button>
        <div>
          <div className="text-base font-bold text-[var(--ink)]">Withdraw</div>
          <div className="text-[11px]" style={{ color: "var(--subtle)" }}>Balance: {fmtBal(balance)}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="text-sm font-semibold text-[var(--ink)] mb-4">Select Withdrawal Method</div>
        <div className="flex flex-col gap-3 mb-6">
          {METHODS.map(m => {
            const Icon = m.icon;
            return (
              <button key={m.name} disabled={!m.available}
                className="flex items-center gap-4 p-4 rounded-2xl text-left"
                style={{ background: "rgba(255,255,255,0.75)", border: `1px solid ${m.available ? "rgba(0,166,81,0.3)" : "rgba(255,255,255,0.85)"}`, opacity: m.available ? 1 : 0.7 }}>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${m.color}22` }}>
                  <Icon size={20} style={{ color: m.color }} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[var(--ink)]">{m.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--subtle)" }}>{m.desc}</div>
                </div>
                {m.available
                  ? <ChevronRight size={16} style={{ color: "var(--subtle)" }} />
                  : <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(100,116,139,0.12)", color: "var(--subtle)" }}>Soon</span>}
              </button>
            );
          })}
        </div>
        <div className="p-3 rounded-xl" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
          <div className="flex items-start gap-2">
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: "#ca8a04" }} />
            <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
              Bank and mobile money withdrawals require payment provider credentials. Use the Exchange screen to convert {currency} balance to USDC on Arc — available immediately.
            </div>
          </div>
        </div>
        <div className="mt-4 p-4 rounded-2xl" style={{ background: "var(--surface)", border: "1px solid rgba(255,255,255,0.80)" }}>
          <div className="text-[11px] font-semibold text-[var(--ink)] mb-2">Recent Withdrawals</div>
          <div className="text-center py-4" style={{ color: "var(--subtle)" }}>
            <div className="text-[11px]">No withdrawals yet</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ReceiveScreen ─────────────────────────────────────────────────────────────
function ReceiveScreen({ currency, countryCode, myAccount, onBack }: {
  currency: string; countryCode: string;
  myAccount: { accountNumber: string; displayName: string } | null;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"bank" | "qr">("bank");
  const [copied, setCopied] = useState(false);
  const qrText = myAccount ? `rushpay:${myAccount.accountNumber}` : "";

  const copy = () => {
    if (!myAccount) return;
    void navigator.clipboard.writeText(
      `Account Name: ${myAccount.displayName}\nAccount Number: ${myAccount.accountNumber}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
          <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
        </button>
        <div className="text-base font-bold text-[var(--ink)]">Receive</div>
      </div>
      {/* Currency pill */}
      <div className="flex items-center gap-3 mx-4 p-3 rounded-2xl mb-4" style={{ background: "rgba(0,166,81,0.1)", border: "1px solid rgba(0,166,81,0.2)" }}>
        <img src={`https://flagcdn.com/w40/${(countryCode || "ng").toLowerCase()}.png`} alt={countryCode}
          className="w-8 h-6 rounded object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
        <div className="flex-1">
          <div className="text-sm font-bold text-[var(--ink)]">{currency}</div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--subtle)" }} />
      </div>
      {/* Tab bar */}
      <div className="flex mx-4 mb-4 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.80)" }}>
        {(["bank", "qr"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-sm font-semibold transition-colors"
            style={{ background: tab === t ? "#00a651" : "transparent", color: tab === t ? "#fff" : "rgba(255,255,255,0.5)" }}>
            {t === "bank" ? "Bank Details" : "QR Code"}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {tab === "bank" ? (
          <>
            <div className="text-sm font-bold text-[var(--ink)] mb-4">Your Receiving Details</div>
            {myAccount ? (
              <div className="rounded-2xl p-4 mb-4" style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)" }}>
                {[
                  { label: "Account Name",   value: myAccount.displayName },
                  { label: "Account Number", value: myAccount.accountNumber },
                  { label: "Reference",      value: "Your username or ARC ID" },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-3"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.80)" }}>
                    <div className="text-[11px]" style={{ color: "var(--subtle)" }}>{row.label}</div>
                    <div className="text-sm font-semibold text-[var(--ink)]">{row.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8" style={{ color: "var(--subtle)" }}>
                <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                <div className="text-sm">Setting up your account...</div>
              </div>
            )}
            <button onClick={copy}
              className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{ background: "rgba(0,166,81,0.12)", color: "#00a651", border: "1px solid rgba(0,166,81,0.3)" }}>
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy Details"}
            </button>
            <div className="mt-3 p-3 rounded-xl" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
              <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                Share these details with the sender to receive funds. Bank-to-wallet deposits require Flutterwave or Paystack configuration.
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center py-8">
            <div className="p-4 rounded-2xl mb-6" style={{ background: "#fff" }}>
              {/* QR code via public API */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrText)}`}
                alt="QR Code" className="w-48 h-48"
              />
            </div>
            {myAccount && (
              <div className="text-center mb-6">
                <div className="text-lg font-bold text-[var(--ink)]">{myAccount.displayName}</div>
                <div className="text-sm mt-1" style={{ color: "var(--subtle)" }}>ARC #{myAccount.accountNumber}</div>
              </div>
            )}
            <div className="text-[11px] text-center px-8" style={{ color: "var(--subtle)" }}>
              Ask the sender to scan this QR code to send funds directly to your RushPay account.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PaymentsScreen ───────────────────────────────────────────────────────────
const PAYMENT_CATEGORIES = [
  { id: "all",      label: "All"         },
  { id: "telecom",  label: "Airtime & Data" },
  { id: "bills",    label: "Bills"       },
  { id: "lifestyle",label: "Lifestyle"   },
];
const PAYMENT_SERVICES = [
  { id: "airtime",   cat: "telecom",   icon: Smartphone,     label: "Airtime",    desc: "Buy airtime",      color: "#2563eb", available: true  },
  { id: "data",      cat: "telecom",   icon: Wifi,           label: "Data",       desc: "Buy data bundle",  color: "#0891b2", available: true  },
  { id: "electricity",cat:"bills",     icon: Zap,            label: "Electricity",desc: "Pay bill",         color: "#16a34a", available: true  },
  { id: "tv",        cat: "bills",     icon: Tv,             label: "TV",         desc: "DSTV / GoTV",      color: "#7c3aed", available: false },
  { id: "internet",  cat: "bills",     icon: Wifi,           label: "Internet",   desc: "Broadband",        color: "#0891b2", available: false },
  { id: "water",     cat: "bills",     icon: Droplets,       label: "Water",      desc: "Pay water bill",   color: "#06b6d4", available: false },
  { id: "education", cat: "lifestyle", icon: GraduationCap,  label: "Education",  desc: "School fees",      color: "#f59e0b", available: false },
  { id: "shopping",  cat: "lifestyle", icon: ShoppingBag,    label: "Shopping",   desc: "Online & stores",  color: "#db2777", available: false },
  { id: "flights",   cat: "lifestyle", icon: Plane,          label: "Flights",    desc: "Book flights",     color: "#0891b2", available: false },
];

function PaymentsScreen({ symbol, decimals, balance, onBack, onSuccess }: {
  symbol: string; decimals: number; balance: number; onBack: () => void;
  onSuccess: (label: string, amount: number) => void;
}) {
  const fmtBal = (n: number) => fmt(n, symbol, decimals);
  const [cat, setCat] = useState("all");
  const [active, setActive] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const visible = cat === "all" ? PAYMENT_SERVICES : PAYMENT_SERVICES.filter(s => s.cat === cat);
  const svc = PAYMENT_SERVICES.find(s => s.id === active);

  const handlePay = () => {
    if (!svc || loading) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSuccess(svc.label, parseFloat(amount) || 0);
    }, 1800);
  };

  if (active && svc) {
    const Icon = svc.icon;
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
        <div className="flex items-center gap-3 px-4 py-4">
          <button onClick={() => setActive(null)} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
            <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
          </button>
          <div className="text-base font-bold text-[var(--ink)]">{svc.label}</div>
        </div>
        <div className="flex-1 px-4 pb-8 overflow-y-auto">
          <div className="flex items-center gap-3 p-4 rounded-2xl mb-6"
            style={{ background: `${svc.color}11`, border: `1px solid ${svc.color}33` }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: `${svc.color}22` }}>
              <Icon size={22} style={{ color: svc.color }} />
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--ink)]">{svc.label}</div>
              <div className="text-[11px]" style={{ color: "var(--subtle)" }}>{svc.desc}</div>
            </div>
          </div>
          {svc.available ? (
            <>
              <div className="mb-4">
                <div className="text-[11px] mb-1.5 font-medium" style={{ color: "var(--subtle)" }}>
                  {svc.cat === "telecom" ? "Phone Number" : "Account / Meter Number"}
                </div>
                <input value={phone} onChange={e => setPhone(e.target.value)}
                  placeholder={svc.cat === "telecom" ? "08012345678" : "Enter number"}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.80)", color: "var(--ink)", border: "1px solid rgba(255,255,255,0.90)" }} />
              </div>
              <div className="mb-6">
                <div className="flex justify-between mb-1.5">
                  <div className="text-[11px] font-medium" style={{ color: "var(--subtle)" }}>Amount</div>
                  <button onClick={() => setAmount(String(balance))} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(0,166,81,0.15)", color: "#00a651" }}>MAX</button>
                </div>
                <div className="flex items-center px-4 py-3 rounded-xl" style={{ background: "rgba(255,255,255,0.80)", border: "1px solid rgba(255,255,255,0.90)" }}>
                  <span className="text-base font-bold mr-2" style={{ color: "var(--subtle)" }}>{symbol}</span>
                  <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00"
                    className="flex-1 bg-transparent outline-none text-xl font-bold text-[var(--ink)]" />
                </div>
                <div className="text-[10px] mt-1" style={{ color: "var(--subtle)" }}>Available: {fmtBal(balance)}</div>
              </div>
              <div className="p-3 rounded-xl mb-6" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)" }}>
                <div className="flex items-start gap-2">
                  <AlertCircle size={12} className="flex-shrink-0 mt-0.5" style={{ color: "#ca8a04" }} />
                  <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                    Test mode — configure Reloadly or Flutterwave credentials to process live payments.
                  </div>
                </div>
              </div>
              <button onClick={handlePay} disabled={!phone || !amount || loading}
                className="w-full py-4 rounded-2xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg,#00a651,#007a3d)", backdropFilter: "blur(12px)", color: "var(--ink)" }}>
                {loading ? <Loader2 size={16} className="animate-spin" /> : `Pay ${amount ? fmtBal(parseFloat(amount)) : ""}`}
              </button>
            </>
          ) : (
            <div className="text-center py-12">
              <div className="text-base font-bold text-[var(--ink)] mb-2">{svc.label} Coming Soon</div>
              <div className="text-sm mb-4" style={{ color: "var(--subtle)" }}>
                This service requires a provider integration. Configure the relevant API credentials to enable.
              </div>
              <span className="px-4 py-2 rounded-full text-sm" style={{ background: "rgba(100,116,139,0.12)", color: "var(--subtle)" }}>Not yet available</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
            <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
          </button>
          <div className="text-base font-bold text-[var(--ink)]">Payments</div>
        </div>
      </div>
      {/* Category chips */}
      <div className="flex gap-2 px-4 mb-4 overflow-x-auto pb-1">
        {PAYMENT_CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCat(c.id)}
            className="px-4 py-1.5 rounded-full text-[11px] font-semibold flex-shrink-0"
            style={{ background: cat === c.id ? "#00a651" : "rgba(255,255,255,0.80)", color: cat === c.id ? "#fff" : "rgba(255,255,255,0.5)" }}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="grid grid-cols-3 gap-3">
          {visible.map(s => {
            const Icon = s.icon;
            return (
              <button key={s.id} onClick={() => setActive(s.id)}
                className="flex flex-col items-center gap-2 py-4 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)", opacity: s.available ? 1 : 0.6 }}>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: `${s.color}22` }}>
                  <Icon size={22} style={{ color: s.color }} />
                </div>
                <div className="text-[11px] font-semibold text-center text-[var(--ink)] leading-tight">{s.label}</div>
                <div className="text-[9px] text-center" style={{ color: "var(--subtle)" }}>{s.desc}</div>
                {!s.available && <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: "rgba(100,116,139,0.12)", color: "var(--subtle)" }}>Soon</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── ExchangeScreen ───────────────────────────────────────────────────────────
function ExchangeScreen({ currency, symbol, decimals, fiatBalance, usdRate, onBack, onSuccess }: {
  currency: string; symbol: string; decimals: number; fiatBalance: number;
  usdRate: number; onBack: () => void;
  onSuccess: (label: string, amount: number) => void;
}) {
  const fmtBal = (n: number) => fmt(n, symbol, decimals);
  const tickers = usePriceStore(s => s.tickers);
  const assets  = useWalletStore(s => s.assets);
  const debit   = useWalletStore(s => s.debit);
  const credit  = useWalletStore(s => s.credit);
  const creditFiat = useFiatStore(s => s.creditFiat);
  const debitFiat  = useFiatStore(s => s.debitFiat);

  const [dir, setDir] = useState<"crypto2fiat" | "fiat2crypto">("crypto2fiat");
  const [fromAmt, setFromAmt] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshed, setRefreshed] = useState(false);

  const usdcPrice = tickers["USDCUSDT"]?.lastPrice ?? 1;
  const rate = usdRate * usdcPrice; // 1 USDC → local currency

  const cryptoAsset = assets.find(a => a.symbol === "USDC") ?? assets[0];
  const cryptoBal = cryptoAsset?.balance ?? 0;

  const fromAmt_n = parseFloat(fromAmt || "0");
  const toAmt_n = dir === "crypto2fiat"
    ? fromAmt_n * rate
    : fromAmt_n / rate;

  const insufficient = dir === "crypto2fiat"
    ? fromAmt_n > cryptoBal
    : fromAmt_n > fiatBalance;

  const handleExchange = () => {
    if (!fromAmt_n || insufficient || loading) return;
    setLoading(true);
    setTimeout(() => {
      if (dir === "crypto2fiat") {
        debit(cryptoAsset.symbol, fromAmt_n);
        creditFiat(currency, toAmt_n);
        onSuccess(`Converted ${fromAmt_n} USDC → ${fmtBal(toAmt_n)}`, toAmt_n);
      } else {
        debitFiat(currency, fromAmt_n);
        credit(cryptoAsset.symbol, toAmt_n);
        onSuccess(`Converted ${fmtBal(fromAmt_n)} → ${toAmt_n.toFixed(4)} USDC`, fromAmt_n);
      }
      setLoading(false);
      onBack();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
          <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
        </button>
        <div className="text-base font-bold text-[var(--ink)]">Exchange</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Live rate */}
        <div className="flex items-center justify-between p-4 rounded-2xl mb-6"
          style={{ background: "rgba(0,166,81,0.1)", border: "1px solid rgba(0,166,81,0.3)" }}>
          <div>
            <div className="text-[10px] mb-0.5" style={{ color: "var(--subtle)" }}>Live Rate</div>
            <div className="text-base font-bold text-[var(--ink)]">1 USDC = {fmtBal(rate)}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>Rate updates every 30 seconds</div>
          </div>
          <button onClick={() => { setRefreshed(true); setTimeout(() => setRefreshed(false), 1000); }}
            className="p-2 rounded-full" style={{ background: "rgba(0,166,81,0.15)" }}>
            <RefreshCw size={16} style={{ color: "#00a651", transition: "transform 0.5s", transform: refreshed ? "rotate(360deg)" : "none" }} />
          </button>
        </div>

        {/* From */}
        <div className="mb-3">
          <div className="text-[11px] mb-1.5 font-medium" style={{ color: "var(--subtle)" }}>From</div>
          <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.80)", border: "1px solid rgba(255,255,255,0.90)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-[var(--ink)] text-xs font-bold">
                {dir === "crypto2fiat" ? "₮" : symbol}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold text-[var(--ink)]">{dir === "crypto2fiat" ? "USDC" : currency}</div>
                <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                  Balance: {dir === "crypto2fiat" ? cryptoBal.toFixed(4) + " USDC" : fmtBal(fiatBalance)}
                </div>
              </div>
              <button onClick={() => setFromAmt(String(dir === "crypto2fiat" ? cryptoBal : fiatBalance))}
                className="text-[10px] px-2 py-0.5 rounded-full"
                style={{ background: "rgba(0,166,81,0.15)", color: "#00a651" }}>MAX</button>
            </div>
            <input value={fromAmt} onChange={e => setFromAmt(e.target.value)} type="number" placeholder="0.00"
              className="w-full bg-transparent outline-none text-2xl font-bold text-[var(--ink)]"
              style={{ borderTop: "1px solid rgba(255,255,255,0.80)", paddingTop: "12px" }} />
            {fromAmt_n > 0 && (
              <div className="text-[11px] mt-1" style={{ color: "var(--subtle)" }}>
                ≈ ${dir === "crypto2fiat" ? fromAmt_n.toFixed(2) : (fromAmt_n / usdRate).toFixed(2)} USD
              </div>
            )}
          </div>
        </div>

        {/* Swap direction */}
        <div className="flex justify-center mb-3">
          <button onClick={() => { setDir(d => d === "crypto2fiat" ? "fiat2crypto" : "crypto2fiat"); setFromAmt(""); }}
            className="p-3 rounded-full" style={{ background: "rgba(0,166,81,0.15)" }}>
            <ArrowRightLeft size={18} style={{ color: "#00a651" }} />
          </button>
        </div>

        {/* To */}
        <div className="mb-6">
          <div className="text-[11px] mb-1.5 font-medium" style={{ color: "var(--subtle)" }}>To</div>
          <div className="p-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)" }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--ink)] text-xs font-bold"
                style={{ background: dir === "crypto2fiat" ? "#00a651" : "#2563eb" }}>
                {dir === "crypto2fiat" ? symbol : "₮"}
              </div>
              <div className="text-sm font-bold text-[var(--ink)]">{dir === "crypto2fiat" ? currency : "USDC"}</div>
            </div>
            <div className="text-2xl font-bold text-[var(--ink)]" style={{ borderTop: "1px solid rgba(255,255,255,0.80)", paddingTop: "12px" }}>
              {fromAmt_n > 0 ? (dir === "crypto2fiat" ? fmtBal(toAmt_n) : toAmt_n.toFixed(4)) : "0.00"}
            </div>
          </div>
        </div>

        {insufficient && (
          <div className="text-[11px] mb-3 text-center" style={{ color: "#ef4444" }}>Insufficient balance</div>
        )}

        <button onClick={handleExchange} disabled={!fromAmt_n || insufficient || loading}
          className="w-full py-4 rounded-2xl text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg,#00a651,#007a3d)", backdropFilter: "blur(12px)", color: "var(--ink)" }}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : "Continue"}
        </button>
      </div>
    </div>
  );
}

// ─── CountryPickerScreen ──────────────────────────────────────────────────────
function CountryPickerScreen({ current, onSelect, onBack }: {
  current: string; onSelect: (code: string) => void; onBack: () => void;
}) {
  const { setCountry } = useCountry();
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
          <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
        </button>
        <div className="text-base font-bold text-[var(--ink)]">Country & Currency</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="text-sm font-semibold text-[var(--ink)] mb-4">Select Your Country</div>
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.85)" }}>
          {FIAT_COUNTRIES.filter(c => c && c.countryCode).map((c, i) => (
            <button key={c.countryCode} onClick={() => { setCountry(c.countryCode); onSelect(c.countryCode); onBack(); }}
              className="w-full flex items-center gap-4 px-4 py-4 text-left"
              style={{ background: "var(--surface)", borderBottom: i < FIAT_COUNTRIES.length - 1 ? "1px solid rgba(255,255,255,0.80)" : "none" }}>
              <img src={`https://flagcdn.com/w40/${c.countryCode.toLowerCase()}.png`} alt={c.countryCode}
                className="w-9 h-6 rounded object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />
              <div className="flex-1">
                <div className="text-sm font-semibold text-[var(--ink)]">{c.countryName} ({c.currency})</div>
                <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{c.symbol} · {c.currency}</div>
              </div>
              {current === c.countryCode
                ? <Check size={16} style={{ color: "#00a651" }} />
                : <ChevronRight size={14} style={{ color: "var(--subtle)" }} />}
            </button>
          ))}
        </div>
        <div className="mt-4 text-center text-[11px]" style={{ color: "var(--subtle)" }}>
          More countries coming soon...
        </div>
      </div>
    </div>
  );
}

// ─── SecurityScreen ───────────────────────────────────────────────────────────
function SecurityScreen({ onBack }: { onBack: () => void }) {
  const [pin,      setPin]      = useState(true);
  const [biometric,setBiometric]= useState(false);
  const [verification,setVerification] = useState(true);
  const [dupProtect, setDupProtect]    = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center gap-3 px-4 py-4">
        <button onClick={onBack} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
          <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
        </button>
        <div className="text-base font-bold text-[var(--ink)]">Security & Limits</div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="flex flex-col gap-3">
          {[
            { icon: Lock,        label: "Transaction PIN",     desc: "Secure your transactions",                  toggle: pin,          set: setPin         },
            { icon: Fingerprint, label: "Biometric Login",     desc: "Use Face ID or fingerprint",                toggle: biometric,    set: setBiometric   },
            { icon: Shield,      label: "Payment Verification",desc: "Enable for extra security",                 toggle: verification, set: setVerification},
            { icon: ToggleRight, label: "Duplicate Protection",desc: "Avoid double charges",                      toggle: dupProtect,   set: setDupProtect  },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-4 p-4 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)" }}>
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(0,166,81,0.15)" }}>
                  <Icon size={18} style={{ color: "#00a651" }} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[var(--ink)]">{item.label}</div>
                  <div className="text-[11px]" style={{ color: "var(--subtle)" }}>{item.desc}</div>
                </div>
                <button onClick={() => item.set(v => !v)}
                  className="w-12 h-6 rounded-full relative transition-colors"
                  style={{ background: item.toggle ? "#00a651" : "rgba(255,255,255,0.15)" }}>
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: item.toggle ? "calc(100% - 22px)" : "2px" }} />
                </button>
              </div>
            );
          })}
          {/* Daily limit */}
          <div className="flex items-center gap-4 p-4 rounded-2xl"
            style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)" }}>
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(0,166,81,0.15)" }}>
              <Shield size={18} style={{ color: "#00a651" }} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-[var(--ink)]">Daily Limit</div>
              <div className="text-[11px]" style={{ color: "var(--subtle)" }}>₦500,000</div>
            </div>
            <ChevronRight size={16} style={{ color: "var(--subtle)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SuccessModal ─────────────────────────────────────────────────────────────
function SuccessModal({ label, amount, symbol, decimals, dateStr, onClose }: {
  label: string; amount: number; symbol: string; decimals: number; dateStr: string; onClose: () => void;
}) {
  const fmtBal = (n: number) => fmt(n, symbol, decimals);
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="w-full max-w-sm rounded-3xl p-6 text-center"
        style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(0,166,81,0.3)" }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: "linear-gradient(135deg,#00a651,#007a3d)", backdropFilter: "blur(12px)" }}>
          <CheckCircle2 size={32} className="text-[var(--ink)]" />
        </div>
        <div className="text-xl font-bold text-[var(--ink)] mb-1">Payment Successful</div>
        <div className="text-3xl font-bold mb-1" style={{ color: "#00a651" }}>{fmtBal(amount)}</div>
        <div className="text-sm mb-6" style={{ color: "var(--subtle)" }}>{label}</div>
        <div className="text-[10px] mb-6" style={{ color: "var(--subtle)" }}>
          {dateStr}
        </div>
        <div className="flex gap-3">
          <button className="flex-1 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: "rgba(255,255,255,0.85)", color: "var(--subtle)" }}>
            View Receipt
          </button>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl text-sm font-bold"
            style={{ background: "linear-gradient(135deg,#00a651,#007a3d)", backdropFilter: "blur(12px)", color: "var(--ink)" }}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export interface NGNAccountPageProps {
  onBack: () => void;
  onNavigateP2P: () => void;
}

export function NGNAccountPage({ onBack }: NGNAccountPageProps) {
  const { country }  = useCountry();
  const currency     = country.currency;
  const symbol       = country.symbol;
  const decimals     = country.decimals;
  const countryCode  = country.code;
  const usdRate      = USD_RATE[currency] ?? 1;
  const fmtBal       = useCallback((n: number) => fmt(n, symbol, decimals), [symbol, decimals]);

  const nativeWallet = useNativeWallet();
  const walletId     = nativeWallet.walletId ?? "anon";

  const balances    = useFiatStore(s => s.balances);
  const deposits    = useFiatStore(s => s.deposits);
  const sends       = useFiatStore(s => s.sends);
  const myAccount   = useFiatStore(s => s.myAccount);
  const registerAccount = useFiatStore(s => s.registerAccount);
  const initiateDeposit = useFiatStore(s => s.initiateDeposit);

  const localBalance = useMemo(() => balances.find(b => b.currency === currency), [balances, currency]);
  const available    = localBalance?.balance ?? 0;
  const pending      = localBalance?.pending ?? 0;

  const [hideAmt,  setHideAmt]  = useState(false);
  const [screen,   setScreen]   = useState<Screen>("dashboard");
  const [successPayload, setSuccessPayload] = useState<{ label: string; amount: number; dateStr: string } | null>(null);

  // Auto-register
  const didReg = useRef(false);
  useEffect(() => {
    if (myAccount || !walletId || walletId === "anon" || didReg.current) return;
    didReg.current = true;
    void registerAccount(walletId, "RushPay User", currency).catch(() => {});
  }, [walletId, myAccount, registerAccount, currency]);

  // Sync server ledger
  useEffect(() => {
    if (!walletId || walletId === "anon") return;
    void fetch("/api/fiat/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId, currency, balance: available }),
    });
  }, [walletId, currency, available]);

  // Activity feed
  const activity = useMemo(() => {
    const deps = deposits
      .filter(d => d.currency === currency)
      .map(d => ({ id: d.id, type: "deposit" as const, label: d.provider === "bank_transfer" ? "Bank Transfer" : `Deposit · ${d.provider}`, amount: d.amount, status: d.status as string, ts: d.createdAt }));
    const snds = sends
      .filter(s => s.currency === currency)
      .map(s => ({ id: s.id, type: "send" as const, label: `Sent to ${s.toDisplayName}`, amount: -s.amount, status: s.status as string, ts: s.ts }));
    return [...deps, ...snds].sort((a, b) => b.ts - a.ts);
  }, [deposits, sends, currency]);

  // Exchange rate display
  const rate = usdRate;

  // Sub-screens
  if (screen === "country") {
    return (
      <CountryPickerScreen
        current={countryCode}
        onSelect={() => {}}
        onBack={() => setScreen("dashboard")}
      />
    );
  }
  if (screen === "withdraw") {
    return (
      <WithdrawScreen
        currency={currency} symbol={symbol} decimals={decimals} balance={available}
        onBack={() => setScreen("dashboard")}
      />
    );
  }
  if (screen === "receive") {
    return (
      <ReceiveScreen
        currency={currency} countryCode={countryCode} myAccount={myAccount}
        onBack={() => setScreen("dashboard")}
      />
    );
  }
  if (screen === "payments") {
    return (
      <PaymentsScreen
        symbol={symbol} decimals={decimals} balance={available}
        onBack={() => setScreen("dashboard")}
        onSuccess={(label, amount) => { setSuccessPayload({ label, amount, dateStr: new Date().toLocaleString() }); setScreen("dashboard"); }}
      />
    );
  }
  if (screen === "exchange") {
    return (
      <ExchangeScreen
        currency={currency} symbol={symbol} decimals={decimals}
        fiatBalance={available} usdRate={rate}
        onBack={() => setScreen("dashboard")}
        onSuccess={(label, amount) => { setSuccessPayload({ label, amount, dateStr: new Date().toLocaleString() }); setScreen("dashboard"); }}
      />
    );
  }
  if (screen === "security") {
    return <SecurityScreen onBack={() => setScreen("dashboard")} />;
  }
  if (screen === "deposit") {
    return (
      <DepositScreen
        countryCode={countryCode} currency={currency} symbol={symbol} decimals={decimals}
        onBack={() => setScreen("dashboard")}
        onInitiate={amt => {
          initiateDeposit({ currency, amount: amt, provider: "bank_transfer", feeBps: 0 });
          setScreen("dashboard");
        }}
      />
    );
  }
  if (screen === "send") {
    return (
      <SendScreen
        balance={available} currency={currency} symbol={symbol} decimals={decimals}
        walletId={walletId}
        onBack={() => setScreen("dashboard")}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <button onClick={onBack} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
          <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
        </button>
        <div className="text-base font-bold text-[var(--ink)]">Local Currency</div>
        <button onClick={() => setScreen("country")}
          className="text-sm font-medium px-3 py-1.5 rounded-full flex items-center gap-1"
          style={{ background: "rgba(0,166,81,0.15)", color: "#00a651" }}>
          <img src={`https://flagcdn.com/w20/${(countryCode || "ng").toLowerCase()}.png`} alt={countryCode}
            className="w-4 h-3 rounded-sm object-cover"
            onError={e => { e.currentTarget.style.display = "none"; }} />
          Switch Country
          <ChevronDown size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {/* Balance hero */}
        <div className="mx-4 rounded-3xl p-5 mb-5"
          style={{ background: "linear-gradient(135deg,#00a651 0%,#005c2e 100%)" }}>
          {/* Currency row */}
          <div className="flex items-center gap-2 mb-4">
            <img src={`https://flagcdn.com/w40/${(countryCode || "ng").toLowerCase()}.png`} alt={countryCode}
              className="w-7 h-5 rounded object-cover"
              onError={e => { e.currentTarget.style.display = "none"; }} />
            <span className="text-sm font-semibold text-[var(--ink)]">{country.name} ({currency})</span>
          </div>

          <div className="text-[11px] text-[var(--ink)]/60 mb-1">Available Balance</div>
          <div className="flex items-center gap-3 mb-1">
            <div className="text-3xl font-bold text-[var(--ink)]">
              {hideAmt ? `${symbol}••••••` : fmtBal(available)}
            </div>
            <button onClick={() => setHideAmt(h => !h)}>
              {hideAmt
                ? <Eye size={18} style={{ color: "var(--subtle)" }} />
                : <EyeOff size={18} style={{ color: "var(--subtle)" }} />}
            </button>
          </div>
          <div className="text-[11px] text-[var(--ink)]/50 mb-1">
            {hideAmt ? "••••••" : `≈ $${(available / rate).toFixed(2)} USD`}
            {pending > 0 && <span className="ml-3 text-yellow-300">· {fmtBal(pending)} pending</span>}
          </div>
          <div className="text-[11px] text-green-300">
            Today's change &nbsp;
            <span className="font-semibold">+2.5%</span>
          </div>

          {/* 5 action buttons */}
          <div className="grid grid-cols-5 gap-2 mt-5">
            {[
              { icon: Download,       label: "Deposit",  screen: "deposit"  as Screen },
              { icon: Send,           label: "Send",     screen: "send"     as Screen },
              { icon: Upload,         label: "Withdraw", screen: "withdraw" as Screen },
              { icon: QrCode,         label: "Receive",  screen: "receive"  as Screen },
              { icon: ArrowRightLeft, label: "Exchange", screen: "exchange" as Screen },
            ].map(a => {
              const Icon = a.icon;
              return (
                <button key={a.label}
                  onClick={() => setScreen(a.screen)}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-opacity"
                  style={{ background: "rgba(255,255,255,0.12)" }}>
                  <Icon size={20} className="text-[var(--ink)]" />
                  <div className="text-[11px] font-semibold text-[var(--ink)]">{a.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Services */}
        <div className="mx-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-[var(--ink)]">Quick Services</div>
            <button onClick={() => setScreen("payments")} className="text-[11px]" style={{ color: "#00a651" }}>View all &gt;</button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {QUICK_SERVICES.slice(0, 4).map(s => {
              const Icon = s.icon;
              return (
                <button key={s.label}
                  className="flex flex-col items-center gap-2 py-3 rounded-2xl"
                  style={{ background: "rgba(255,255,255,0.78)", border: "1px solid rgba(255,255,255,0.85)", opacity: s.available ? 1 : 0.6 }}>
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                    style={{ background: `${s.color}22` }}>
                    <Icon size={18} style={{ color: s.color }} />
                  </div>
                  <div className="text-[10px] text-center leading-tight text-[var(--ink)] whitespace-pre-line">{s.label}</div>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            {QUICK_SERVICES.slice(4).map(s => {
              const Icon = s.icon;
              return (
                <button key={s.label}
                  className="flex flex-col items-center gap-2 py-3 rounded-2xl"
                  style={{ background: "rgba(255,255,255,0.78)", border: "1px solid rgba(255,255,255,0.85)", opacity: s.available ? 1 : 0.6 }}>
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                    style={{ background: `${s.color}22` }}>
                    <Icon size={18} style={{ color: s.color }} />
                  </div>
                  <div className="text-[10px] text-center leading-tight text-[var(--ink)] whitespace-pre-line">{s.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live exchange rate */}
        <div className="mx-4 mb-5 p-4 rounded-2xl flex items-center justify-between"
          style={{ background: "rgba(0,166,81,0.08)", border: "1px solid rgba(0,166,81,0.2)" }}>
          <div>
            <div className="text-[10px] mb-0.5" style={{ color: "var(--subtle)" }}>Live Rate</div>
            <div className="text-base font-bold text-[var(--ink)]">1 USDC = {fmtBal(rate)}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>Rate updates every 30 seconds</div>
          </div>
          <button className="p-2 rounded-full" style={{ background: "rgba(0,166,81,0.15)" }}>
            <RefreshCw size={16} style={{ color: "#00a651" }} />
          </button>
        </div>

        {/* Recent transactions */}
        <div className="mx-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold text-[var(--ink)]">Recent Transactions</div>
            <button onClick={() => setScreen("history")} className="text-[11px]" style={{ color: "#00a651" }}>View all &gt;</button>
          </div>

          {activity.length === 0 ? (
            <div className="text-center py-10" style={{ color: "var(--subtle)" }}>
              <Clock size={28} className="mx-auto mb-2 opacity-40" />
              <div className="text-sm">No transactions yet</div>
              <div className="text-[11px] mt-1">Deposit {currency} to get started</div>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)" }}>
              {activity.slice(0, 5).map((tx, i) => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderBottom: i < Math.min(activity.length, 5) - 1 ? "1px solid rgba(255,255,255,0.80)" : "none" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: tx.amount > 0 ? "rgba(0,166,81,0.15)" : "rgba(239,68,68,0.1)",
                      color: tx.amount > 0 ? "#00a651" : "#ef4444",
                    }}>
                    {tx.type === "deposit" ? <Download size={14} /> : <Send size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--ink)] truncate">{tx.label}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px]" style={{ color: "var(--subtle)" }}>{fmtTs(tx.ts)}</span>
                      <StatusBadge status={tx.status} />
                    </div>
                  </div>
                  <div className="text-sm font-semibold flex-shrink-0"
                    style={{ color: tx.amount > 0 ? "#00a651" : "#ef4444" }}>
                    {tx.amount > 0 ? "+" : ""}{fmtBal(Math.abs(tx.amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* History screen */}



      {screen === "history" && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
          <div className="flex items-center gap-3 px-4 py-4">
            <button onClick={() => setScreen("dashboard")} className="p-2 rounded-full" style={{ background: "rgba(255,255,255,0.85)" }}>
              <ArrowLeft size={18} style={{ color: "var(--ink)" }} />
            </button>
            <div className="text-base font-bold text-[var(--ink)]">Transaction History</div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-8">
            {/* Filter chips */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {["All", "Deposits", "Withdrawals", "Payments"].map(f => (
                <button key={f}
                  className="px-4 py-1.5 rounded-full text-[11px] font-semibold flex-shrink-0"
                  style={{ background: f === "All" ? "#00a651" : "rgba(255,255,255,0.80)", color: f === "All" ? "#fff" : "rgba(255,255,255,0.5)" }}>
                  {f}
                </button>
              ))}
            </div>
            {activity.length === 0 ? (
              <div className="text-center py-16" style={{ color: "var(--subtle)" }}>
                <Clock size={32} className="mx-auto mb-3 opacity-30" />
                <div className="text-sm">No transactions yet</div>
              </div>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.85)" }}>
                {activity.map((tx, i) => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-4"
                    style={{ borderBottom: i < activity.length - 1 ? "1px solid rgba(255,255,255,0.80)" : "none" }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: tx.amount > 0 ? "rgba(0,166,81,0.15)" : "rgba(239,68,68,0.1)",
                        color: tx.amount > 0 ? "#00a651" : "#ef4444",
                      }}>
                      {tx.type === "deposit" ? <Download size={16} /> : <Send size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--ink)] truncate">{tx.label}</div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>{fmtDate(tx.ts)}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold mb-0.5"
                        style={{ color: tx.amount > 0 ? "#00a651" : "#ef4444" }}>
                        {tx.amount > 0 ? "+" : ""}{fmtBal(Math.abs(tx.amount))}
                      </div>
                      <StatusBadge status={tx.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success modal shown after payments / exchange */}
      {successPayload && (
        <SuccessModal
          label={successPayload.label}
          amount={successPayload.amount}
          symbol={symbol}
          decimals={decimals}
          dateStr={successPayload.dateStr}
          onClose={() => setSuccessPayload(null)}
        />
      )}
    </div>
  );
}
