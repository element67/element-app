/**
 * fiatStore — local-currency fiat wallet balances and bank deposit ledger.
 *
 * Architecture:
 *  - Each user can hold multiple fiat currency balances (NGN, GHS, KES, etc.)
 *  - Deposits come from local bank transfers via a payment provider
 *    (Flutterwave for NG/GH/KE/ZA, not yet for others)
 *  - Virtual account numbers are static per user per currency in demo mode;
 *    production requires Flutterwave/Paystack createVirtualAccount API call
 *  - Every credit/debit is idempotent via a provider reference ID
 *  - Balances and ledger are persisted to localStorage
 *
 * Production requirements (not yet configured — show as "coming soon"):
 *  - FLUTTERWAVE_SECRET_KEY  — for virtual account creation and webhook verification
 *  - PAYSTACK_SECRET_KEY     — Nigeria virtual accounts (alternative)
 *  - Webhook endpoint        — /api/fiat/deposit-webhook  (backend needed)
 *  - KYC/AML                 — Persona or Sumsub for fiat on/off-ramp
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Country → payment provider config ────────────────────────────────────────

export interface FiatCountryConfig {
  countryCode: string;
  countryName: string;
  currency:    string;
  symbol:      string;
  decimals:    number;
  /** Is bank deposit live (provider configured) or in preview? */
  depositStatus: "live" | "coming_soon" | "manual_only";
  providers:   FiatProvider[];
  /** Minimum single deposit */
  minDeposit:  number;
  maxDeposit:  number;
  /** Withdrawal supported */
  withdrawEnabled: boolean;
}

export interface FiatProvider {
  id:        string;
  name:      string;
  logo?:     string;
  methods:   string[];   // "bank_transfer" | "mobile_money" | "card"
  countries: string[];
  /** Fee as basis points, e.g. 150 = 1.5% */
  feeBps:    number;
  minAmount: number;
  maxAmount: number;
}

export const FIAT_PROVIDERS: FiatProvider[] = [
  {
    id: "flutterwave", name: "Flutterwave", methods: ["bank_transfer", "mobile_money", "card"],
    countries: ["NG","GH","KE","ZA","TZ","UG","RW"],
    feeBps: 150, minAmount: 100, maxAmount: 10_000_000,
  },
  {
    id: "paystack", name: "Paystack", methods: ["bank_transfer", "card"],
    countries: ["NG","GH","KE","ZA"],
    feeBps: 150, minAmount: 100, maxAmount: 5_000_000,
  },
  {
    id: "momo", name: "MTN Mobile Money", methods: ["mobile_money"],
    countries: ["GH","UG","RW","CM","CI","BJ"],
    feeBps: 200, minAmount: 50, maxAmount: 500_000,
  },
  {
    id: "mpesa", name: "M-Pesa", methods: ["mobile_money"],
    countries: ["KE","TZ","UG","MZ","GH"],
    feeBps: 150, minAmount: 10, maxAmount: 150_000,
  },
  {
    id: "stripe", name: "Stripe / Bank Transfer", methods: ["bank_transfer", "card"],
    countries: ["US","GB","EU","CA","AU"],
    feeBps: 80, minAmount: 5, maxAmount: 500_000,
  },
];

export const FIAT_COUNTRIES: FiatCountryConfig[] = [
  { countryCode:"NG", countryName:"Nigeria",      currency:"NGN", symbol:"₦",    decimals:2, depositStatus:"coming_soon", providers:["flutterwave","paystack"].map(id => FIAT_PROVIDERS.find(p=>p.id===id)!), minDeposit:1000,  maxDeposit:10_000_000, withdrawEnabled:true },
  { countryCode:"GH", countryName:"Ghana",        currency:"GHS", symbol:"GH₵",  decimals:2, depositStatus:"coming_soon", providers:["flutterwave","momo"].map(id => FIAT_PROVIDERS.find(p=>p.id===id)!),        minDeposit:50,    maxDeposit:50_000,     withdrawEnabled:true },
  { countryCode:"KE", countryName:"Kenya",        currency:"KES", symbol:"KSh",  decimals:2, depositStatus:"coming_soon", providers:["flutterwave","mpesa"].map(id => FIAT_PROVIDERS.find(p=>p.id===id)!),        minDeposit:100,   maxDeposit:150_000,    withdrawEnabled:true },
  { countryCode:"ZA", countryName:"South Africa", currency:"ZAR", symbol:"R",    decimals:2, depositStatus:"coming_soon", providers:["flutterwave","paystack"].map(id => FIAT_PROVIDERS.find(p=>p.id===id)!), minDeposit:50,    maxDeposit:100_000,    withdrawEnabled:true },
  { countryCode:"GB", countryName:"United Kingdom",currency:"GBP", symbol:"£",   decimals:2, depositStatus:"coming_soon", providers:["stripe"].map(id => FIAT_PROVIDERS.find(p=>p.id===id)!),                       minDeposit:10,    maxDeposit:50_000,     withdrawEnabled:false },
  { countryCode:"US", countryName:"United States",currency:"USD", symbol:"$",    decimals:2, depositStatus:"coming_soon", providers:["stripe"].map(id => FIAT_PROVIDERS.find(p=>p.id===id)!),                       minDeposit:10,    maxDeposit:50_000,     withdrawEnabled:false },
  { countryCode:"EU", countryName:"Euro area",    currency:"EUR", symbol:"€",    decimals:2, depositStatus:"coming_soon", providers:["stripe"].map(id => FIAT_PROVIDERS.find(p=>p.id===id)!),                       minDeposit:10,    maxDeposit:50_000,     withdrawEnabled:false },
  { countryCode:"TZ", countryName:"Tanzania",     currency:"TZS", symbol:"TSh",  decimals:0, depositStatus:"coming_soon", providers:["flutterwave","mpesa"].map(id => FIAT_PROVIDERS.find(p=>p.id===id)!),        minDeposit:5000,  maxDeposit:5_000_000,  withdrawEnabled:false },
  { countryCode:"UG", countryName:"Uganda",       currency:"UGX", symbol:"USh",  decimals:0, depositStatus:"coming_soon", providers:["flutterwave","momo"].map(id => FIAT_PROVIDERS.find(p=>p.id===id)!),         minDeposit:10000, maxDeposit:10_000_000, withdrawEnabled:false },
  { countryCode:"IN", countryName:"India",        currency:"INR", symbol:"₹",    decimals:2, depositStatus:"coming_soon", providers:[],                                                                                minDeposit:100,   maxDeposit:1_000_000,  withdrawEnabled:false },
  { countryCode:"BR", countryName:"Brazil",       currency:"BRL", symbol:"R$",   decimals:2, depositStatus:"coming_soon", providers:[],                                                                                minDeposit:50,    maxDeposit:50_000,     withdrawEnabled:false },
];

// ── Deposit ledger entry ──────────────────────────────────────────────────────

export type DepositStatus = "initiated" | "pending" | "confirmed" | "failed" | "expired";

export interface FiatDeposit {
  id:             string;
  idempotencyKey: string;
  currency:       string;
  amount:         number;
  fee:            number;
  netAmount:      number;
  status:         DepositStatus;
  provider:       string;
  providerRef?:   string;   // Flutterwave/Paystack transaction reference
  accountName?:   string;
  accountNumber?: string;
  bankName?:      string;
  note?:          string;
  createdAt:      number;
  confirmedAt?:   number;
  expiresAt?:     number;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface FiatBalance {
  currency: string;
  symbol:   string;
  balance:  number;
  /** Balance locked in pending deposits / withdrawals */
  pending:  number;
}

export interface FiatState {
  balances:    FiatBalance[];
  deposits:    FiatDeposit[];
  /** Active country (ISO-2) for deposit flow */
  activeCountry: string;

  // ── Mutations ──────────────────────────────────────────────────────────────
  setActiveCountry: (code: string) => void;

  /** Initiate a deposit — creates a ledger entry with status "initiated" */
  initiateDeposit: (opts: {
    currency: string;
    amount:   number;
    provider: string;
    feeBps:   number;
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
  }) => FiatDeposit;

  /** Credit a confirmed deposit — idempotent via providerRef */
  confirmDeposit: (id: string, providerRef?: string) => void;

  /** Mark a deposit as failed */
  failDeposit: (id: string, reason?: string) => void;

  /** Debit fiat (for P2P / convert flows) */
  debitFiat: (currency: string, amount: number) => boolean;

  /** Credit fiat directly (internal settlement) */
  creditFiat: (currency: string, amount: number, note?: string) => void;
}

function genId() { return `fd_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }
function genKey() { return `idk_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

// Demo seed balances
const SEED_BALANCES: FiatBalance[] = [
  { currency: "NGN", symbol: "₦",   balance: 45_000, pending: 0 },
  { currency: "USD", symbol: "$",   balance: 0,       pending: 0 },
  { currency: "GBP", symbol: "£",   balance: 0,       pending: 0 },
];

export const useFiatStore = create<FiatState>()(
  persist(
    (set, get) => ({
      balances:      SEED_BALANCES,
      deposits:      [],
      activeCountry: "NG",

      setActiveCountry: (code) => set({ activeCountry: code }),

      initiateDeposit: ({ currency, amount, provider, feeBps, accountName, accountNumber, bankName }) => {
        const fee = Math.round(amount * feeBps) / 10000;
        const netAmount = amount - fee;
        const deposit: FiatDeposit = {
          id:             genId(),
          idempotencyKey: genKey(),
          currency, amount, fee, netAmount,
          status:    "initiated" as const,
          provider,
          accountName, accountNumber, bankName,
          createdAt: Date.now(),
          expiresAt: Date.now() + 30 * 60 * 1000, // 30 min virtual account TTL
        };
        set(s => ({ deposits: [deposit, ...s.deposits].slice(0, 200) }));
        return deposit;
      },

      confirmDeposit: (id, providerRef) => {
        set(s => {
          const dep = s.deposits.find(d => d.id === id);
          if (!dep || dep.status === "confirmed") return {};
          // Idempotency: if providerRef already credited, skip
          if (providerRef && s.deposits.some(d => d.providerRef === providerRef && d.status === "confirmed")) return {};

          const netAmount = dep.netAmount;
          const currency  = dep.currency;

          // Credit the fiat balance
          const existing = s.balances.find(b => b.currency === currency);
          const balances = existing
            ? s.balances.map(b => b.currency === currency
                ? { ...b, balance: b.balance + netAmount, pending: Math.max(0, b.pending - dep.amount) }
                : b)
            : [...s.balances, {
                currency,
                symbol: FIAT_COUNTRIES.find(c => c.currency === currency)?.symbol ?? currency,
                balance: netAmount,
                pending: 0,
              }];

          const deposits: FiatDeposit[] = s.deposits.map(d =>
            d.id === id
              ? ({ ...d, status: "confirmed" as DepositStatus, providerRef, confirmedAt: Date.now() } satisfies FiatDeposit)
              : d
          );
          return { deposits, balances };
        });
      },

      failDeposit: (id, reason) => {
        set(s => ({
          deposits: s.deposits.map(d =>
            d.id === id
              ? ({ ...d, status: "failed" as DepositStatus, note: reason ?? d.note } satisfies FiatDeposit)
              : d
          ),
        }));
      },

      debitFiat: (currency, amount) => {
        const bal = get().balances.find(b => b.currency === currency);
        if (!bal || bal.balance < amount) return false;
        set(s => ({
          balances: s.balances.map(b =>
            b.currency === currency ? { ...b, balance: b.balance - amount } : b
          ),
        }));
        return true;
      },

      creditFiat: (currency, amount) => {
        set(s => {
          const existing = s.balances.find(b => b.currency === currency);
          if (existing) {
            return { balances: s.balances.map(b => b.currency === currency ? { ...b, balance: b.balance + amount } : b) };
          }
          return {
            balances: [...s.balances, {
              currency,
              symbol: FIAT_COUNTRIES.find(c => c.currency === currency)?.symbol ?? currency,
              balance: amount, pending: 0,
            }],
          };
        });
      },
    }),
    {
      name: "financex-fiat-v1",
      partialize: s => ({ balances: s.balances, deposits: s.deposits.slice(0, 50), activeCountry: s.activeCountry }),
    }
  )
);
