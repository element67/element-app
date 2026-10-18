/**
 * NGN Account Dashboard — OPay/PalmPay/Chipper-style local currency account
 *
 * Actions: Deposit · Transfer · Buy Crypto · Bills
 * Explore: Airtime · Data · TV · Electricity · Internet · Shopping · Delivery · Flights
 *
 * Production requirements (currently in preview mode):
 *   FLUTTERWAVE_SECRET_KEY — virtual account creation + deposit webhooks
 *   PAYSTACK_SECRET_KEY    — alternative NGN virtual accounts
 *   VTPASS_API_KEY         — bills (airtime, data, TV, electricity)
 *   FLIGHTAWARE_API_KEY    — flight search (or Amadeus / Duffel)
 *   Webhook endpoint       — /api/fiat/deposit-webhook
 */
import { useState, useMemo } from "react";
import {
  ArrowLeft, Wallet, Send, Download, RefreshCw, ShoppingBag,
  Zap, Wifi, Tv, Smartphone, Plane, Truck, Copy, CheckCircle2,
  ChevronRight, Clock, AlertCircle, X, ChevronDown,
  CreditCard, Phone, Globe, Package,
} from "lucide-react";
import { useFiatStore } from "@/store/fiatStore";
import { BankDepositModal } from "@/components/BankDepositModal";
import { useCountry } from "@/hooks/useCountry";

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtLocal(n: number, symbol: string, decimals: number) {
  return symbol + n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}
function fmtTs(ts: number) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Approximate rates vs USD — production should use live FX from marketplaceStore
const APPROX_USD_RATE: Record<string, number> = {
  NGN: 1650, GHS: 15.5, KES: 130, ZAR: 18.5, GBP: 0.79, EUR: 0.92,
  USD: 1, TZS: 2650, UGX: 3750, INR: 84, BRL: 5.0, MXN: 17.5,
};

// ── Transfer store (in-memory, no backend) ───────────────────────────────────
// Production: replace with secure server-side ledger + authenticated API
interface TransferRecord {
  id: string;
  toUser: string;
  amount: number;
  note: string;
  ts: number;
  status: "completed" | "failed";
}

// Simulated user directory — replace with API lookup in production
const DEMO_USERS: Record<string, { name: string; avatar: string }> = {
  "@adaeze":    { name: "Adaeze Okonkwo",  avatar: "AO" },
  "@chukwudi":  { name: "Chukwudi Eze",    avatar: "CE" },
  "@tunde":     { name: "Tunde Balogun",   avatar: "TB" },
  "@fatima":    { name: "Fatima Musa",     avatar: "FM" },
  "@emeka":     { name: "Emeka Nwosu",     avatar: "EN" },
};

// ── Bill / Service catalog ────────────────────────────────────────────────────
interface BillProvider {
  id: string;
  name: string;
  logo: string;
  category: string;
  instruction: string;
  amounts?: number[];
  requiresPhone?: boolean;
  requiresAccount?: boolean;
  requiresMeter?: boolean;
  requiresSmartCard?: boolean;
  requiresDecoder?: boolean;
  requiresIUC?: boolean;
  status: "live" | "coming_soon";
}

const BILL_PROVIDERS: BillProvider[] = [
  // Airtime
  { id:"mtn_airtime",    name:"MTN Airtime",    logo:"🟡", category:"airtime", instruction:"Enter phone number",
    amounts:[100,200,500,1000,2000,5000], requiresPhone:true, status:"coming_soon" },
  { id:"airtel_airtime", name:"Airtel Airtime",  logo:"🔴", category:"airtime", instruction:"Enter phone number",
    amounts:[100,200,500,1000,2000,5000], requiresPhone:true, status:"coming_soon" },
  { id:"glo_airtime",    name:"Glo Airtime",     logo:"🟢", category:"airtime", instruction:"Enter phone number",
    amounts:[100,200,500,1000,2000,5000], requiresPhone:true, status:"coming_soon" },
  { id:"9mobile_airtime",name:"9Mobile Airtime", logo:"🟢", category:"airtime", instruction:"Enter phone number",
    amounts:[100,200,500,1000,2000,5000], requiresPhone:true, status:"coming_soon" },
  // Data
  { id:"mtn_data",    name:"MTN Data",    logo:"🟡", category:"data", instruction:"Enter phone number",
    amounts:[200,500,1000,2000,5000,10000], requiresPhone:true, status:"coming_soon" },
  { id:"airtel_data", name:"Airtel Data",  logo:"🔴", category:"data", instruction:"Enter phone number",
    amounts:[200,500,1000,2000,5000,10000], requiresPhone:true, status:"coming_soon" },
  { id:"glo_data",    name:"Glo Data",     logo:"🟢", category:"data", instruction:"Enter phone number",
    amounts:[200,500,1000,2000,5000,10000], requiresPhone:true, status:"coming_soon" },
  // TV
  { id:"dstv",  name:"DStv",  logo:"📡", category:"tv", instruction:"Enter smartcard number",
    requiresSmartCard:true, status:"coming_soon" },
  { id:"gotv",  name:"GOtv",  logo:"📺", category:"tv", instruction:"Enter IUC number",
    requiresIUC:true, status:"coming_soon" },
  { id:"startimes", name:"StarTimes", logo:"⭐", category:"tv", instruction:"Enter smartcard number",
    requiresSmartCard:true, status:"coming_soon" },
  // Electricity
  { id:"ekedc",  name:"EKEDC (Eko)",      logo:"⚡", category:"electricity", instruction:"Enter meter number",
    amounts:[1000,2000,5000,10000,20000,50000], requiresMeter:true, status:"coming_soon" },
  { id:"ikedc",  name:"IKEDC (Ikeja)",    logo:"⚡", category:"electricity", instruction:"Enter meter number",
    amounts:[1000,2000,5000,10000,20000,50000], requiresMeter:true, status:"coming_soon" },
  { id:"aedc",   name:"AEDC (Abuja)",     logo:"⚡", category:"electricity", instruction:"Enter meter number",
    amounts:[1000,2000,5000,10000,20000,50000], requiresMeter:true, status:"coming_soon" },
  { id:"phedc",  name:"PHEDC (Port Harcourt)", logo:"⚡", category:"electricity", instruction:"Enter meter number",
    amounts:[1000,2000,5000,10000,20000,50000], requiresMeter:true, status:"coming_soon" },
  // Internet
  { id:"spectranet", name:"Spectranet",    logo:"🌐", category:"internet", instruction:"Enter account number",
    requiresAccount:true, status:"coming_soon" },
  { id:"smile",      name:"Smile",         logo:"😊", category:"internet", instruction:"Enter account number",
    requiresAccount:true, status:"coming_soon" },
];

const CATEGORIES = [
  { id:"airtime",     label:"Airtime",     icon:<Phone size={18}/> },
  { id:"data",        label:"Data",        icon:<Smartphone size={18}/> },
  { id:"tv",          label:"TV",          icon:<Tv size={18}/> },
  { id:"electricity", label:"Electricity", icon:<Zap size={18}/> },
  { id:"internet",    label:"Internet",    icon:<Wifi size={18}/> },
];

const EXPLORE_SERVICES = [
  { id:"shopping",  label:"Shopping",  icon:<ShoppingBag size={22}/>, status:"coming_soon" as const },
  { id:"delivery",  label:"Delivery",  icon:<Truck size={22}/>,       status:"coming_soon" as const },
  { id:"airtime",   label:"Airtime",   icon:<Phone size={22}/>,       status:"coming_soon" as const },
  { id:"data",      label:"Data",      icon:<Smartphone size={22}/>,  status:"coming_soon" as const },
  { id:"tv",        label:"TV",        icon:<Tv size={22}/>,          status:"coming_soon" as const },
  { id:"flights",   label:"Flights",   icon:<Plane size={22}/>,       status:"coming_soon" as const },
  { id:"electricity",label:"Electricity",icon:<Zap size={22}/>,      status:"coming_soon" as const },
  { id:"internet",  label:"Internet",  icon:<Wifi size={22}/>,        status:"coming_soon" as const },
];

// ── Sub-panels ────────────────────────────────────────────────────────────────

// Transfer Panel
function TransferPanel({ balance, onClose, onSuccess }: {
  balance: number;
  onClose: () => void;
  onSuccess: (record: TransferRecord) => void;
}) {
  const { country }  = useCountry();
  const currency     = country.currency;
  const symbol       = country.symbol;
  const fmt          = (n: number) => fmtLocal(n, symbol, country.decimals);
  const debitFiat    = useFiatStore(s => s.debitFiat);
  const [username, setUsername] = useState("");
  const [resolvedUser, setResolvedUser] = useState<{ name: string; avatar: string } | null>(null);
  const [lookupErr, setLookupErr] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"input" | "confirm" | "done">("input");
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState("");

  const handleLookup = () => {
    setLookupErr("");
    const key = username.startsWith("@") ? username.toLowerCase() : `@${username.toLowerCase()}`;
    const user = DEMO_USERS[key];
    if (user) {
      setResolvedUser(user);
    } else {
      setLookupErr("User not found. Check the username and try again.");
      setResolvedUser(null);
    }
  };

  const amt = parseFloat(amount) || 0;
  const fee = 0; // internal transfers are free
  const canProceed = resolvedUser && amt >= 1 && amt <= balance;

  const handleConfirm = () => {
    if (pin !== "0000") { // demo PIN; replace with real auth
      setPinErr("Incorrect PIN. (Demo: use 0000)");
      return;
    }
    const ok = debitFiat(currency, amt);
    if (!ok) { setPinErr(`Insufficient ${currency} balance.`); return; }
    const record: TransferRecord = {
      id: `tr_${Date.now()}`,
      toUser: resolvedUser!.name,
      amount: amt,
      note,
      ts: Date.now(),
      status: "completed",
    };
    onSuccess(record);
    setStep("done");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-2xl p-5 pb-8" style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>Transfer {currency}</div>
          <button onClick={onClose}><X size={16} style={{ color: "var(--subtle)" }} /></button>
        </div>

        {step === "input" && (
          <>
            <div className="mb-3">
              <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>Recipient username or phone</div>
              <div className="flex gap-2">
                <input value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="@username or +234..." className="flex-1 px-3 py-2.5 rounded-xl text-xs outline-none"
                  style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }} />
                <button onClick={handleLookup}
                  className="px-3 py-2.5 rounded-xl text-xs font-semibold"
                  style={{ background: "var(--accent)", color: "#000" }}>Find</button>
              </div>
              {lookupErr && <div className="text-[10px] mt-1" style={{ color: "var(--sell)" }}>{lookupErr}</div>}
            </div>

            {resolvedUser && (
              <div className="flex items-center gap-3 p-3 rounded-xl mb-3"
                style={{ background: "var(--surface-high)", border: "1px solid var(--buy)" }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: "var(--accent)", color: "#000" }}>{resolvedUser.avatar}</div>
                <div>
                  <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{resolvedUser.name}</div>
                  <div className="text-[10px]" style={{ color: "var(--subtle)" }}>FinanceX user · verified</div>
                </div>
                <CheckCircle2 size={16} className="ml-auto" style={{ color: "var(--buy)" }} />
              </div>
            )}

            <div className="mb-3">
              <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>Amount ({currency})</div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--subtle)" }}>{symbol}</span>
                <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl text-xs outline-none"
                  style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }} />
              </div>
              {amt > balance && <div className="text-[10px] mt-1" style={{ color: "var(--sell)" }}>Insufficient balance</div>}
              <div className="text-[10px] mt-1" style={{ color: "var(--subtle)" }}>
                Available: {fmt(balance)} · Fee: Free
              </div>
            </div>

            <div className="mb-4">
              <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>Note (optional)</div>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="What's this for?"
                className="w-full px-3 py-2.5 rounded-xl text-xs outline-none"
                style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }} />
            </div>

            <button disabled={!canProceed} onClick={() => setStep("confirm")}
              className="w-full py-3 rounded-xl text-xs font-bold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#000" }}>
              Continue
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="p-4 rounded-xl mb-4" style={{ background: "var(--surface-high)" }}>
              <div className="flex justify-between text-xs mb-2">
                <span style={{ color: "var(--subtle)" }}>To</span>
                <span style={{ color: "var(--ink)" }}>{resolvedUser!.name}</span>
              </div>
              <div className="flex justify-between text-xs mb-2">
                <span style={{ color: "var(--subtle)" }}>Amount</span>
                <span style={{ color: "var(--ink)" }}>{fmt(amt)}</span>
              </div>
              <div className="flex justify-between text-xs mb-2">
                <span style={{ color: "var(--subtle)" }}>Fee</span>
                <span style={{ color: "var(--buy)" }}>Free</span>
              </div>
              <div className="flex justify-between text-xs font-bold">
                <span style={{ color: "var(--subtle)" }}>Total deducted</span>
                <span style={{ color: "var(--ink)" }}>{fmt(amt + fee)}</span>
              </div>
              {note && <div className="mt-2 text-[10px] italic" style={{ color: "var(--subtle)" }}>"{note}"</div>}
            </div>

            <div className="mb-4">
              <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>Enter PIN to authorize</div>
              <input value={pin} onChange={e => setPin(e.target.value)} type="password"
                maxLength={6} placeholder="••••••" className="w-full px-3 py-2.5 rounded-xl text-xs outline-none text-center tracking-widest"
                style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }} />
              {pinErr && <div className="text-[10px] mt-1" style={{ color: "var(--sell)" }}>{pinErr}</div>}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep("input")} className="flex-1 py-3 rounded-xl text-xs"
                style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Back</button>
              <button onClick={handleConfirm} className="flex-1 py-3 rounded-xl text-xs font-bold"
                style={{ background: "var(--accent)", color: "#000" }}>Confirm Transfer</button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 size={40} style={{ color: "var(--buy)" }} />
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Transfer Sent!</div>
            <div className="text-xs text-center" style={{ color: "var(--subtle)" }}>
              {fmt(amt)} sent to {resolvedUser!.name}
            </div>
            <button onClick={onClose} className="mt-2 px-8 py-3 rounded-xl text-xs font-bold"
              style={{ background: "var(--accent)", color: "#000" }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Bills Panel
function BillsPanel({ balance, onClose, onSuccess }: {
  balance: number;
  onClose: () => void;
  onSuccess: (amt: number, provider: string) => void;
}) {
  const { country }  = useCountry();
  const currency     = country.currency;
  const symbol       = country.symbol;
  const fmt          = (n: number) => fmtLocal(n, symbol, country.decimals);
  const debitFiat    = useFiatStore(s => s.debitFiat);
  const [cat, setCat] = useState("airtime");
  const [provider, setProvider] = useState<BillProvider | null>(null);
  const [phone, setPhone] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"cat" | "form" | "confirm" | "done">("cat");
  const [err, setErr] = useState("");

  const providers = BILL_PROVIDERS.filter(p => p.category === cat);
  const amt = parseFloat(amount) || 0;

  const handlePay = () => {
    if (amt > balance) { setErr(`Insufficient ${currency} balance.`); return; }
    if (provider?.status === "coming_soon") { setErr("Provider not yet configured. This is a preview."); return; }
    const ok = debitFiat(currency, amt);
    if (!ok) { setErr("Insufficient balance."); return; }
    onSuccess(amt, provider!.name);
    setStep("done");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md rounded-t-2xl p-5 pb-8" style={{ background: "var(--surface)" }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={step === "cat" ? onClose : () => { setStep("cat"); setProvider(null); setErr(""); }}>
            {step === "cat" ? <X size={16} style={{ color: "var(--subtle)" }} /> : <ArrowLeft size={16} style={{ color: "var(--subtle)" }} />}
          </button>
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            {step === "cat" ? "Pay Bills" : provider?.name ?? "Bills"}
          </div>
          <div className="w-4" />
        </div>

        {step === "cat" && (
          <>
            {/* Category tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setCat(c.id)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
                  style={{ background: cat === c.id ? "var(--accent)" : "var(--surface-high)",
                           color: cat === c.id ? "#000" : "var(--subtle)" }}>
                  {c.icon}{c.label}
                </button>
              ))}
            </div>
            {/* Provider grid */}
            <div className="grid grid-cols-2 gap-3">
              {providers.map(p => (
                <button key={p.id} onClick={() => { setProvider(p); setStep("form"); setErr(""); }}
                  className="flex items-center gap-3 p-3 rounded-xl text-left transition-opacity hover:opacity-80"
                  style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                  <span className="text-2xl">{p.logo}</span>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{p.name}</div>
                    {p.status === "coming_soon" && (
                      <div className="text-[9px]" style={{ color: "var(--subtle)" }}>Preview</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === "form" && provider && (
          <>
            {provider.status === "coming_soon" && (
              <div className="flex items-start gap-2 p-3 rounded-xl mb-4"
                style={{ background: "rgba(255,165,0,0.1)", border: "1px solid rgba(255,165,0,0.3)" }}>
                <AlertCircle size={14} style={{ color: "var(--warn, #f97316)" }} className="flex-shrink-0 mt-0.5" />
                <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                  <strong>{provider.name}</strong> integration is in preview. Transactions will not be processed until the provider API is configured.
                </div>
              </div>
            )}

            {provider.requiresPhone && (
              <div className="mb-3">
                <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>Phone number</div>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 xxx xxx xxxx"
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none"
                  style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }} />
              </div>
            )}
            {(provider.requiresAccount || provider.requiresMeter || provider.requiresSmartCard || provider.requiresIUC || provider.requiresDecoder) && (
              <div className="mb-3">
                <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                  {provider.requiresMeter ? "Meter number" : provider.requiresSmartCard ? "Smartcard number" :
                   provider.requiresIUC ? "IUC number" : "Account number"}
                </div>
                <input value={account} onChange={e => setAccount(e.target.value)}
                  placeholder={provider.requiresMeter ? "00000000000" : "Enter number"}
                  className="w-full px-3 py-2.5 rounded-xl text-xs outline-none"
                  style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }} />
              </div>
            )}

            <div className="mb-3">
              <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>Amount ({currency})</div>
              {provider.amounts ? (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {provider.amounts.map(a => (
                    <button key={a} onClick={() => setAmount(String(a))}
                      className="py-2 rounded-xl text-xs font-medium transition-colors"
                      style={{ background: amount === String(a) ? "var(--accent)" : "var(--surface-high)",
                               color: amount === String(a) ? "#000" : "var(--ink)" }}>
                      {fmt(a)}
                    </button>
                  ))}
                </div>
              ) : null}
              <input value={amount} onChange={e => setAmount(e.target.value)} type="number" placeholder="Enter amount"
                className="w-full px-3 py-2.5 rounded-xl text-xs outline-none"
                style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }} />
            </div>

            {err && <div className="text-[10px] mb-3" style={{ color: "var(--sell)" }}>{err}</div>}

            <button disabled={amt <= 0} onClick={() => { setErr(""); setStep("confirm"); }}
              className="w-full py-3 rounded-xl text-xs font-bold disabled:opacity-40"
              style={{ background: "var(--accent)", color: "#000" }}>Continue</button>
          </>
        )}

        {step === "confirm" && provider && (
          <>
            <div className="p-4 rounded-xl mb-4" style={{ background: "var(--surface-high)" }}>
              <div className="text-2xl text-center mb-1">{provider.logo}</div>
              <div className="text-center text-xs font-semibold mb-3" style={{ color: "var(--ink)" }}>{provider.name}</div>
              <div className="flex justify-between text-xs mb-2">
                <span style={{ color: "var(--subtle)" }}>Amount</span>
                <span style={{ color: "var(--ink)" }}>{fmt(amt)}</span>
              </div>
              <div className="flex justify-between text-xs mb-2">
                <span style={{ color: "var(--subtle)" }}>Fee</span>
                <span style={{ color: "var(--buy)" }}>{fmt(0)}</span>
              </div>
              {phone && <div className="flex justify-between text-xs mb-2">
                <span style={{ color: "var(--subtle)" }}>Phone</span>
                <span style={{ color: "var(--ink)" }}>{phone}</span>
              </div>}
              {account && <div className="flex justify-between text-xs">
                <span style={{ color: "var(--subtle)" }}>Account</span>
                <span style={{ color: "var(--ink)" }}>{account}</span>
              </div>}
            </div>
            {err && <div className="text-[10px] mb-3" style={{ color: "var(--sell)" }}>{err}</div>}
            <div className="flex gap-3">
              <button onClick={() => setStep("form")} className="flex-1 py-3 rounded-xl text-xs"
                style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Back</button>
              <button onClick={handlePay} className="flex-1 py-3 rounded-xl text-xs font-bold"
                style={{ background: "var(--accent)", color: "#000" }}>Pay Now</button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 size={40} style={{ color: "var(--buy)" }} />
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Payment Submitted!</div>
            <div className="text-xs text-center" style={{ color: "var(--subtle)" }}>
              {fmt(amt)} · {provider?.name}
            </div>
            {provider?.status === "coming_soon" && (
              <div className="text-[10px] text-center px-4" style={{ color: "var(--warn, #f97316)" }}>
                Preview mode: no real funds were debited. Configure the provider API to enable live payments.
              </div>
            )}
            <button onClick={onClose} className="mt-2 px-8 py-3 rounded-xl text-xs font-bold"
              style={{ background: "var(--accent)", color: "#000" }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main NGN Account Page ─────────────────────────────────────────────────────
export interface NGNAccountPageProps {
  onBack: () => void;
  onNavigateP2P: () => void;
}

export function NGNAccountPage({ onBack, onNavigateP2P }: NGNAccountPageProps) {
  const { country }     = useCountry();
  const currency        = country.currency;   // e.g. "NGN", "KES", "GHS"
  const symbol          = country.symbol;     // e.g. "₦", "KSh", "GH₵"
  const decimals        = country.decimals;
  const localUsdRate    = APPROX_USD_RATE[currency] ?? 1;

  const fmt = (n: number) => fmtLocal(n, symbol, decimals);

  const balances        = useFiatStore(s => s.balances);
  const deposits        = useFiatStore(s => s.deposits);

  const localBalance = useMemo(() => balances.find(b => b.currency === currency), [balances, currency]);
  const available    = localBalance?.balance ?? 0;
  const pending      = localBalance?.pending ?? 0;

  const [hideAmt, setHideAmt] = useState(false);
  const [showDeposit,  setShowDeposit]  = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showBills,    setShowBills]    = useState(false);

  // local transfer history (in-memory this session)
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [billPayments, setBillPayments] = useState<Array<{ id: string; provider: string; amount: number; ts: number }>>([]);

  // Virtual account display (demo)
  const virtualAccount = {
    bankName:      "Providus Bank",
    accountNumber: "2007319841",
    accountName:   "FinanceX / User Account",
    provider:      "Flutterwave (demo)",
  };

  // Combined activity feed
  const activity = useMemo(() => {
    const deps = deposits
      .filter(d => d.currency === currency)
      .map(d => ({ id: d.id, type: "deposit" as const, label: `Deposit · ${d.provider}`, amount: d.amount, status: d.status, ts: d.createdAt }));
    const trns = transfers.map(t => ({ id: t.id, type: "transfer" as const, label: `Transfer to ${t.toUser}`, amount: -t.amount, status: t.status, ts: t.ts }));
    const bills = billPayments.map(b => ({ id: b.id, type: "bill" as const, label: `Bill · ${b.provider}`, amount: -b.amount, status: "completed" as const, ts: b.ts }));
    return [...deps, ...trns, ...bills].sort((a, b) => b.ts - a.ts).slice(0, 50);
  }, [deposits, transfers, billPayments, currency]);

  const [copied, setCopied] = useState(false);
  const handleCopyAcct = () => {
    void navigator.clipboard.writeText(virtualAccount.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 sticky top-0 z-20"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <button onClick={onBack} className="p-1.5 rounded-lg" style={{ background: "var(--surface-high)" }}>
          <ArrowLeft size={16} style={{ color: "var(--ink)" }} />
        </button>
        <div className="flex-1">
          <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>{currency} Account</div>
          <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{country.name} · local currency wallet</div>
        </div>
        <button onClick={() => setHideAmt(h => !h)} className="p-1.5 rounded-lg"
          style={{ background: "var(--surface-high)" }}>
          <Wallet size={15} style={{ color: "var(--subtle)" }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {/* Balance hero card */}
        <div className="mx-4 mt-4 rounded-2xl p-5"
          style={{ background: "linear-gradient(135deg,#00a651 0%,#007a3d 100%)" }}>
          <div className="flex items-start justify-between mb-1">
            <div className="text-[11px] font-medium text-white/70">{currency} Balance</div>
            <img src={`https://flagcdn.com/w40/${country.code.toLowerCase()}.png`} alt={country.code}
              className="w-6 h-4 rounded-sm object-cover"
              onError={e => { e.currentTarget.style.display="none"; }} />
          </div>
          <div className="text-3xl font-bold text-white mb-0.5">
            {hideAmt ? `${symbol}••••••` : fmt(available)}
          </div>
          <div className="text-[11px] text-white/60">
            ≈ {hideAmt ? "$••••" : fmtUsd(available / localUsdRate)} USD
            {pending > 0 && <span className="ml-3 text-yellow-200">· {fmt(pending)} pending</span>}
          </div>

          {/* Main actions */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            {[
              { label:"Deposit",      icon:<Download size={16}/>,  action: () => setShowDeposit(true) },
              { label:"Transfer",     icon:<Send size={16}/>,       action: () => setShowTransfer(true) },
              { label:"Buy Crypto",   icon:<RefreshCw size={16}/>,  action: onNavigateP2P },
              { label:"Bills",        icon:<Zap size={16}/>,        action: () => setShowBills(true) },
            ].map(a => (
              <button key={a.label} onClick={a.action}
                className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl"
                style={{ background: "rgba(255,255,255,0.15)" }}>
                <div className="text-white">{a.icon}</div>
                <div className="text-[10px] font-medium text-white">{a.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Virtual account card */}
        <div className="mx-4 mt-4 p-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>Fund via Bank Transfer</div>
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>
              Demo
            </span>
          </div>
          <div className="text-[10px] mb-3" style={{ color: "var(--subtle)" }}>
            Transfer {currency} to this account to fund your wallet. Allow 1–5 minutes for confirmation.
          </div>
          <div className="p-3 rounded-xl mb-2" style={{ background: "var(--surface-high)" }}>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span style={{ color: "var(--subtle)" }}>Bank</span>
              <span style={{ color: "var(--ink)" }} className="font-medium">{virtualAccount.bankName}</span>
            </div>
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span style={{ color: "var(--subtle)" }}>Account Number</span>
              <div className="flex items-center gap-2">
                <span style={{ color: "var(--ink)" }} className="font-mono font-bold">{virtualAccount.accountNumber}</span>
                <button onClick={handleCopyAcct} className="p-1 rounded-lg" style={{ background: "var(--surface)" }}>
                  {copied ? <CheckCircle2 size={12} style={{ color: "var(--buy)" }} /> : <Copy size={12} style={{ color: "var(--subtle)" }} />}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span style={{ color: "var(--subtle)" }}>Account Name</span>
              <span style={{ color: "var(--ink)" }}>{virtualAccount.accountName}</span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <AlertCircle size={11} className="flex-shrink-0 mt-0.5" style={{ color: "var(--warn, #f97316)" }} />
            <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
              Demo account — production requires Flutterwave/Paystack integration. Deposit button below opens the deposit flow.
            </div>
          </div>
          <button onClick={() => setShowDeposit(true)}
            className="w-full mt-3 py-2.5 rounded-xl text-xs font-semibold"
            style={{ background: "var(--accent)", color: "#000" }}>
            Deposit NGN
          </button>
        </div>

        {/* Explore Services */}
        <div className="mx-4 mt-4">
          <div className="text-xs font-semibold mb-3" style={{ color: "var(--ink)" }}>Explore Services</div>
          <div className="grid grid-cols-4 gap-3">
            {EXPLORE_SERVICES.map(s => (
              <button key={s.id}
                onClick={s.id === "airtime" || s.id === "data" || s.id === "tv" || s.id === "electricity" || s.id === "internet"
                  ? () => setShowBills(true) : undefined}
                className="flex flex-col items-center gap-2 py-3 rounded-xl relative transition-opacity hover:opacity-80"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div style={{ color: "var(--accent)" }}>{s.icon}</div>
                <div className="text-[10px] font-medium" style={{ color: "var(--ink)" }}>{s.label}</div>
                {s.status === "coming_soon" && (
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-yellow-400" />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            <span className="text-[10px]" style={{ color: "var(--subtle)" }}>Coming soon — provider integration required</span>
          </div>
        </div>

        {/* Transaction History */}
        <div className="mx-4 mt-4">
          <div className="text-xs font-semibold mb-3" style={{ color: "var(--ink)" }}>Recent Activity</div>
          {activity.length === 0 ? (
            <div className="text-center py-8" style={{ color: "var(--subtle)" }}>
              <Clock size={24} className="mx-auto mb-2 opacity-40" />
              <div className="text-xs">No transactions yet</div>
              <div className="text-[10px] mt-1">Deposit NGN to get started</div>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {activity.map((tx, i) => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: i < activity.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: tx.amount > 0 ? "rgba(0,166,81,0.15)" : "rgba(239,68,68,0.15)",
                             color: tx.amount > 0 ? "var(--buy)" : "var(--sell)" }}>
                    {tx.type === "deposit" ? <Download size={14} /> :
                     tx.type === "transfer" ? <Send size={14} /> : <Zap size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: "var(--ink)" }}>{tx.label}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px]" style={{ color: "var(--subtle)" }}>{fmtTs(tx.ts)}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{ background: tx.status === "completed" ? "rgba(0,166,81,0.15)" : tx.status === "pending" ? "rgba(234,179,8,0.15)" : "rgba(239,68,68,0.15)",
                                 color: tx.status === "completed" ? "var(--buy)" : tx.status === "pending" ? "#ca8a04" : "var(--sell)" }}>
                        {tx.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs font-semibold flex-shrink-0"
                    style={{ color: tx.amount > 0 ? "var(--buy)" : "var(--sell)" }}>
                    {tx.amount > 0 ? "+" : ""}{fmt(Math.abs(tx.amount))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showDeposit && (
        <BankDepositModal
          defaultCurrency={currency}
          onClose={() => setShowDeposit(false)}
        />
      )}
      {showTransfer && (
        <TransferPanel
          balance={available}
          onClose={() => setShowTransfer(false)}
          onSuccess={r => setTransfers(prev => [r, ...prev])}
        />
      )}
      {showBills && (
        <BillsPanel
          balance={available}
          onClose={() => setShowBills(false)}
          onSuccess={(amt, provider) =>
            setBillPayments(prev => [{ id: `bp_${Date.now()}`, provider, amount: amt, ts: Date.now() }, ...prev])
          }
        />
      )}
    </div>
  );
}
