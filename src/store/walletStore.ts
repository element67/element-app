/**
 * PERPX Built-in Wallet Store
 *
 * Production requirements still needed:
 *  - Custodial crypto:  Circle developer-controlled wallets SDK
 *  - Fiat balances:     Licensed EMI partner (Flutterwave, Stripe Treasury, etc.)
 *  - Onchain tx:        User wallet signature or Circle wallets SDK
 *  - KYC/AML:           Persona / Sumsub
 *
 * This store handles all in-app balance accounting with:
 *  - Idempotency keys on every mutation (no double-credit on retry)
 *  - Live price sync (refreshPrices called every 3s from App.tsx)
 *  - Atomic swap (debit + credit in one set() call)
 *  - Overdraft protection on every debit path
 *  - Immutable tx audit trail (capped at 500 records, persisted top-100)
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { COUNTRIES } from "@/store/marketplaceStore";

export interface WalletAsset {
  symbol:    string;
  name:      string;
  balance:   number;
  usdValue:  number;
  decimals:  number;
  color:     string;
  type:      "crypto" | "fiat" | "stablecoin";
  network?:  string;
  address?:  string;
  change24h: number;
}

export type TxType = "send" | "receive" | "swap" | "buy" | "sell" | "p2p" | "fee" | "deposit" | "withdraw" | "escrow_lock" | "escrow_release";
export type TxStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export interface TxRecord {
  id:           string;
  idempotencyKey?: string;  // caller-supplied; dedup on this if present
  type:         TxType;
  asset:        string;
  amount:       number;
  usdAmount:    number;
  fee:          number;
  status:       TxStatus;
  to?:          string;
  from?:        string;
  note?:        string;
  createdAt:    number;
  confirmedAt?: number;
  txHash?:      string;
  network?:     string;
  // For swaps
  toAsset?:     string;
  toAmount?:    number;
}

export interface Alert {
  id: string; msg: string;
  type: "info" | "success" | "warn" | "error";
  ts: number; read: boolean;
}

export interface WalletState {
  assets:         WalletAsset[];
  txHistory:      TxRecord[];
  totalUsd:       number;
  totalChange24h: number;
  primaryFiat:    string;
  /** ISO 3166-1 alpha-2 country code, e.g. "NG", "GB", "US" */
  userCountry:    string;
  /** True once the user explicitly confirms or changes their country in settings */
  countryConfirmed: boolean;
  hideBalances:   boolean;
  alerts:         Alert[];
  // Live price cache used by mutations
  _livePrices:    Record<string, number>;

  // ── Mutations ────────────────────────────────────────────────────────────
  /** Credit an asset. Returns tx id. Idempotent if idempotencyKey supplied. */
  credit: (asset: string, amount: number, opts?: { note?: string; type?: TxType; idempotencyKey?: string; fee?: number; txHash?: string }) => string | null;

  /** Debit an asset. Returns tx id or null if insufficient balance. Idempotent if key supplied. */
  debit:  (asset: string, amount: number, opts?: { note?: string; type?: TxType; idempotencyKey?: string; fee?: number; to?: string }) => string | null;

  /** Atomic swap — debit fromAsset, credit toAsset. Returns tx id or null. */
  swap:   (fromAsset: string, toAsset: string, fromAmt: number, toAmt: number, fee: number, idempotencyKey?: string) => string | null;

  /** Update a pending tx to completed/failed */
  updateTxStatus: (id: string, status: TxStatus, txHash?: string) => void;

  /** Called every 3s from App.tsx with live Binance prices */
  refreshPrices: (prices: Record<string, number>) => void;

  setPrimaryFiat:  (fiat: string) => void;
  /** Set country code and auto-update primaryFiat from COUNTRIES table */
  setUserCountry:  (code: string) => void;
  toggleHide:     () => void;
  addAlert:       (msg: string, type?: "info" | "success" | "warn" | "error") => void;
  markAlertsRead: () => void;
  /** Low-level tx append — use credit/debit/swap when possible */
  addTx: (tx: Omit<TxRecord, "id" | "createdAt">) => string;

  /** Set the real on-chain address for an asset (called after wallet init) */
  setAssetAddress: (symbol: string, address: string) => void;

  /** Update on-chain balance for an asset (called after RPC fetch) */
  updateAssetBalance: (symbol: string, balance: number) => void;

  /** Add a new asset to the wallet (no-op if already present) */
  addAsset: (asset: Omit<WalletAsset, "usdValue">) => void;

  /** Remove an asset from the wallet (only if balance is zero) */
  removeAsset: (symbol: string) => void;
}

// ── Seed balances (testnet / demo) ───────────────────────────────────────────
const SEED: Omit<WalletAsset, "usdValue">[] = [
  // addresses are populated at runtime from the native HD wallet — never hardcoded
  { symbol:"USDC", name:"USD Coin",  balance:0, decimals:6,  color:"#2775ca", type:"stablecoin", network:"Arc",      address:"", change24h:0    },
  { symbol:"USDT", name:"Tether",    balance:0, decimals:6,  color:"#26a17b", type:"stablecoin", network:"Ethereum", address:"", change24h:0    },
  { symbol:"ETH",  name:"Ethereum",  balance:0, decimals:18, color:"#627eea", type:"crypto",     network:"Ethereum", address:"", change24h:0    },
  { symbol:"BTC",  name:"Bitcoin",   balance:0, decimals:8,  color:"#f7931a", type:"crypto",     network:"Bitcoin",  address:"", change24h:0    },
  { symbol:"SOL",  name:"Solana",    balance:0, decimals:9,  color:"#9945ff", type:"crypto",     network:"Solana",   address:"", change24h:0    },
  { symbol:"BNB",  name:"BNB",       balance:0, decimals:18, color:"#f3ba2f", type:"crypto",     network:"BNB",      address:"", change24h:0    },
  { symbol:"ARB",  name:"Arbitrum",  balance:0, decimals:18, color:"#28a0f0", type:"crypto",     network:"Arbitrum", address:"", change24h:0    },
  { symbol:"ARC",  name:"Arc",       balance:0, decimals:18, color:"#2775ca", type:"stablecoin", network:"Arc",      address:"", change24h:0    },
];

const BASE_PRICES: Record<string, number> = {
  USDC:1, USDT:1, ETH:3480, BTC:67200, SOL:172, BNB:595, ARB:1.12, ARC:1,
};

function recompute(assets: WalletAsset[], prices: Record<string, number>) {
  return assets.reduce((s, a) => s + a.balance * (prices[a.symbol] ?? BASE_PRICES[a.symbol] ?? 1), 0);
}

function genId() { return `tx_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

// ---------------------------------------------------------------------------
// Country detection — runs once at store creation / rehydration
// Uses timezone and locale as signals; never overrides a user-explicit choice
// ---------------------------------------------------------------------------
const TZ_COUNTRY: Record<string, string> = {
  "Africa/Lagos": "NG", "Africa/Accra": "GH", "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA", "Africa/Dar_es_Salaam": "TZ",
  "Africa/Kampala": "UG", "Africa/Cairo": "EG", "Africa/Khartoum": "SD",
  "Africa/Addis_Ababa": "ET", "Africa/Douala": "CM",
  "Europe/London": "GB", "Europe/Paris": "FR", "Europe/Berlin": "DE",
  "Europe/Rome": "IT", "Europe/Madrid": "ES", "Europe/Amsterdam": "NL",
  "America/New_York": "US", "America/Chicago": "US", "America/Los_Angeles": "US",
  "America/Toronto": "CA", "America/Sao_Paulo": "BR", "America/Buenos_Aires": "AR",
  "Asia/Kolkata": "IN", "Asia/Tokyo": "JP", "Asia/Shanghai": "CN",
  "Asia/Singapore": "SG", "Asia/Dubai": "AE", "Asia/Karachi": "PK",
  "Australia/Sydney": "AU",
};
// Map ISO 3166-1 country code → fiat currency (subset; falls back to USD)
const COUNTRY_CURRENCY: Record<string, string> = {
  NG:"NGN", GH:"GHS", KE:"KES", ZA:"ZAR", TZ:"TZS", UG:"UGX", EG:"EGP",
  GB:"GBP", FR:"EUR", DE:"EUR", IT:"EUR", ES:"EUR", NL:"EUR",
  US:"USD", CA:"CAD", BR:"BRL", AR:"ARS", IN:"INR", JP:"JPY",
  CN:"CNY", SG:"SGD", AE:"AED", PK:"PKR", AU:"AUD", SD:"SDG", ET:"ETB", CM:"XAF",
};
function detectCountry(): { code: string; currency: string } | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const code = TZ_COUNTRY[tz];
    if (code) return { code, currency: COUNTRY_CURRENCY[code] ?? "USD" };
    // Fallback: parse locale region tag (e.g. "en-NG" → "NG")
    const locale = navigator.language ?? "";
    const region = locale.split("-")[1]?.toUpperCase();
    if (region && COUNTRY_CURRENCY[region]) return { code: region, currency: COUNTRY_CURRENCY[region] };
  } catch { /* non-browser env */ }
  return null;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      assets: SEED.map(a => ({ ...a, usdValue: a.balance * (BASE_PRICES[a.symbol] ?? 1) })),
      txHistory: [],
      totalUsd:       recompute(SEED.map(a => ({ ...a, usdValue:0 })), BASE_PRICES),
      totalChange24h: 1.4,
      primaryFiat:      "NGN",
      userCountry:      "NG",
      countryConfirmed: false,
      hideBalances:     false,
      alerts:         [],
      _livePrices:    { ...BASE_PRICES },

      credit: (asset, amount, opts = {}) => {
        // Idempotency check
        if (opts.idempotencyKey) {
          const exists = get().txHistory.find(t => t.idempotencyKey === opts.idempotencyKey);
          if (exists) return exists.id;
        }
        if (amount <= 0) return null;
        const id = genId();
        set(s => {
          const prices = s._livePrices;
          const usdPx = prices[asset] ?? BASE_PRICES[asset] ?? 1;
          const assets = s.assets.map(a =>
            a.symbol === asset
              ? { ...a, balance: a.balance + amount, usdValue: (a.balance + amount) * usdPx }
              : a
          );
          // If asset not in wallet yet, add it
          const found = assets.find(a => a.symbol === asset);
          if (!found) { /* skip unknown asset */ }
          const tx: TxRecord = {
            id, idempotencyKey: opts.idempotencyKey,
            type: opts.type ?? "receive", asset, amount,
            usdAmount: amount * usdPx, fee: opts.fee ?? 0,
            status: "completed", note: opts.note, txHash: opts.txHash,
            createdAt: Date.now(), confirmedAt: Date.now(),
          };
          return { assets, txHistory: [tx, ...s.txHistory].slice(0, 500), totalUsd: recompute(assets, prices) };
        });
        return id;
      },

      debit: (asset, amount, opts = {}) => {
        // Idempotency check
        if (opts.idempotencyKey) {
          const exists = get().txHistory.find(t => t.idempotencyKey === opts.idempotencyKey);
          if (exists) return exists.id;
        }
        if (amount <= 0) return null;
        const cur = get().assets.find(a => a.symbol === asset);
        if (!cur || cur.balance < amount + (opts.fee ?? 0)) return null; // insufficient
        const id = genId();
        set(s => {
          const prices = s._livePrices;
          const usdPx = prices[asset] ?? BASE_PRICES[asset] ?? 1;
          const total = amount + (opts.fee ?? 0);
          const assets = s.assets.map(a =>
            a.symbol === asset
              ? { ...a, balance: a.balance - total, usdValue: (a.balance - total) * usdPx }
              : a
          );
          const tx: TxRecord = {
            id, idempotencyKey: opts.idempotencyKey,
            type: opts.type ?? "send", asset, amount,
            usdAmount: amount * usdPx, fee: opts.fee ?? 0,
            status: "completed", to: opts.to, note: opts.note,
            createdAt: Date.now(), confirmedAt: Date.now(),
          };
          return { assets, txHistory: [tx, ...s.txHistory].slice(0, 500), totalUsd: recompute(assets, prices) };
        });
        return id;
      },

      swap: (fromAsset, toAsset, fromAmt, toAmt, fee, idempotencyKey) => {
        if (idempotencyKey) {
          const exists = get().txHistory.find(t => t.idempotencyKey === idempotencyKey);
          if (exists) return exists.id;
        }
        const from = get().assets.find(a => a.symbol === fromAsset);
        if (!from || from.balance < fromAmt + fee) return null;
        const id = genId();
        set(s => {
          const prices = s._livePrices;
          const fromPx = prices[fromAsset] ?? BASE_PRICES[fromAsset] ?? 1;
          const toPx   = prices[toAsset]   ?? BASE_PRICES[toAsset]   ?? 1;
          let toFound = false;
          const assets = s.assets.map(a => {
            if (a.symbol === fromAsset) return { ...a, balance: a.balance - fromAmt - fee, usdValue: (a.balance - fromAmt - fee) * fromPx };
            if (a.symbol === toAsset)   { toFound = true; return { ...a, balance: a.balance + toAmt, usdValue: (a.balance + toAmt) * toPx }; }
            return a;
          });
          // If toAsset not yet in wallet, append it
          if (!toFound) {
            const seed = SEED.find(a => a.symbol === toAsset);
            if (seed) assets.push({ ...seed, balance: toAmt, usdValue: toAmt * toPx });
          }
          const tx: TxRecord = {
            id, idempotencyKey,
            type: "swap", asset: `${fromAsset}→${toAsset}`,
            amount: fromAmt, usdAmount: fromAmt * fromPx, fee,
            status: "completed", toAsset, toAmount: toAmt,
            createdAt: Date.now(), confirmedAt: Date.now(),
          };
          return { assets, txHistory: [tx, ...s.txHistory].slice(0, 500), totalUsd: recompute(assets, prices) };
        });
        return id;
      },

      updateTxStatus: (id, status, txHash) => {
        set(s => ({
          txHistory: s.txHistory.map(t =>
            t.id === id ? { ...t, status, txHash, confirmedAt: status === "completed" ? Date.now() : t.confirmedAt } : t
          ),
        }));
      },

      refreshPrices: (prices) => {
        set(s => {
          const merged = { ...BASE_PRICES, ...prices };
          const assets = s.assets.map(a => ({
            ...a,
            usdValue: a.balance * (merged[a.symbol] ?? 1),
          }));
          return { assets, totalUsd: recompute(assets, merged), _livePrices: merged };
        });
      },

      setPrimaryFiat: (fiat) => set({ primaryFiat: fiat }),

      setUserCountry: (code) => {
        const country = COUNTRIES.find(c => c.code === code);
        // countryConfirmed = true prevents auto-detection from overriding this choice
        set({ userCountry: code, primaryFiat: country?.currency ?? "NGN", countryConfirmed: true });
      },

      toggleHide: () => set(s => ({ hideBalances: !s.hideBalances })),

      addAlert: (msg, type = "info") => set(s => ({
        alerts: [{ id: `al_${Date.now()}`, msg, type, ts: Date.now(), read: false }, ...s.alerts].slice(0, 50),
      })),

      markAlertsRead: () => set(s => ({
        alerts: s.alerts.map(a => ({ ...a, read: true })),
      })),

      addTx: (tx) => {
        const id = genId();
        set(s => ({ txHistory: [{ ...tx, id, createdAt: Date.now() }, ...s.txHistory].slice(0, 500) }));
        return id;
      },

      setAssetAddress: (symbol, address) => {
        set(s => ({
          assets: s.assets.map(a =>
            a.symbol === symbol ? { ...a, address } : a
          ),
        }));
      },

      updateAssetBalance: (symbol, balance) => {
        set(s => {
          const prices = s._livePrices;
          const usdPx = prices[symbol] ?? BASE_PRICES[symbol] ?? 1;
          const assets = s.assets.map(a =>
            a.symbol === symbol
              ? { ...a, balance, usdValue: balance * usdPx }
              : a
          );
          return { assets, totalUsd: recompute(assets, prices) };
        });
      },

      addAsset: (asset) => {
        set(s => {
          if (s.assets.find(a => a.symbol === asset.symbol && (!asset.network || a.network === asset.network))) return s;
          const prices = s._livePrices;
          const usdPx = prices[asset.symbol] ?? BASE_PRICES[asset.symbol] ?? 1;
          const newAsset: WalletAsset = { ...asset, usdValue: asset.balance * usdPx };
          const assets = [...s.assets, newAsset];
          return { assets, totalUsd: recompute(assets, prices) };
        });
      },

      removeAsset: (symbol) => {
        set(s => {
          const asset = s.assets.find(a => a.symbol === symbol);
          // Only remove if balance is zero — never destroy funds silently
          if (!asset || asset.balance > 0) return s;
          const assets = s.assets.filter(a => a.symbol !== symbol);
          return { assets, totalUsd: recompute(assets, s._livePrices) };
        });
      },
    }),
    {
      name: "perpx-wallet-v2",
      partialize: s => ({
        assets:           s.assets,
        txHistory:        s.txHistory.slice(0, 100),
        primaryFiat:      s.primaryFiat,
        userCountry:      s.userCountry,
        hideBalances:     s.hideBalances,
        countryConfirmed: s.countryConfirmed,
      }),
      // After rehydration: if country was never explicitly confirmed, run detection
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (state.countryConfirmed) return; // user made an explicit choice — respect it
        const detected = detectCountry();
        if (detected) {
          state.userCountry = detected.code;
          state.primaryFiat = detected.currency;
        }
      },
    }
  )
);
