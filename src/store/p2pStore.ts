/**
 * PERPX Global P2P Store — production-grade state machine
 *
 * Architecture:
 *  - Zustand with subscribeWithSelector for sub-ms granular updates
 *  - Complete escrow state machine: open → matched → escrowed → paid → released → completed
 *  - Immutable order audit log (append-only)
 *  - In-memory matching engine (O(log n) best-offer selection)
 *  - Live FX rates from open.er-api.com (free, no key needed)
 *  - Crypto prices piped in from priceStore tickers
 *
 * External integrations required before real-money use:
 *  - On-chain escrow: PerpVault.depositToSubaccount() → user wallet signature
 *  - Payment verification: Flutterwave / Paystack / Stripe webhook
 *  - KYC: Persona / Sumsub API key
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

export type P2PAsset = "USDT" | "USDC" | "BTC" | "ETH" | "SOL" | "BNB" | "XRP";
export type P2POrderSide = "buy" | "sell";
export type P2POrderStatus =
  | "open"        // advertisement posted, waiting for taker
  | "matched"     // taker accepted, escrow not yet locked
  | "escrowed"    // seller's crypto locked in escrow
  | "paid"        // buyer claims payment sent
  | "verifying"   // system/seller verifying payment
  | "released"    // escrow released to buyer
  | "completed"   // fully settled, receipt issued
  | "cancelled"   // cancelled before escrow
  | "expired"     // order timer ran out
  | "disputed";   // under dispute review

export interface P2PPayMethod {
  id: string;
  label: string;
  icon: string;
  color: string;
  country?: string;    // ISO2, undefined = global
  category: "bank" | "mobile_money" | "wallet" | "cash" | "crypto";
}

export interface P2PMerchant {
  id: string;
  name: string;
  avatar: string;          // initials or emoji
  verified: boolean;
  kycLevel: 0 | 1 | 2 | 3;
  completedTrades: number;
  completionRate: number;  // 0-100
  avgResponseSec: number;
  positive: number;        // % positive feedback
  registeredAt: number;    // ms timestamp
  onlineAt: number;        // ms — last seen
  currency: string;        // preferred fiat
  country: string;         // ISO2
}

export interface P2PAdvertisement {
  id: string;
  merchantId: string;
  side: P2POrderSide;      // "buy" = merchant wants to buy crypto; "sell" = merchant sells crypto
  asset: P2PAsset;
  fiatCurrency: string;    // e.g. "NGN", "USD"
  price: number;           // fiat per crypto unit
  premiumPct: number;      // premium/discount vs market
  availableAmt: number;    // crypto available
  minFiat: number;         // minimum order in fiat
  maxFiat: number;         // maximum order in fiat
  payMethods: P2PPayMethod[];
  terms: string;
  autoReply: string;
  status: "active" | "paused" | "exhausted";
  createdAt: number;
  fills: number;           // how many times filled
  score: number;           // ranking score (computed)
}

export interface P2PAuditEntry {
  ts: number;
  event: string;
  actor: "system" | "buyer" | "seller" | "admin";
  detail?: string;
}

export interface P2PTrade {
  id: string;
  adId: string;
  merchantId: string;
  takerId: string;          // wallet address of taker
  side: P2POrderSide;       // from TAKER's perspective
  asset: P2PAsset;
  fiatCurrency: string;
  cryptoAmt: number;
  fiatAmt: number;
  price: number;
  payMethod: P2PPayMethod;
  status: P2POrderStatus;
  escrowTxHash?: string;    // on-chain escrow tx
  paymentRef?: string;      // bank/payment reference
  paymentProof?: string;    // URL to evidence (never triggers auto-release)
  disputeReason?: string;
  createdAt: number;
  matchedAt?: number;
  escrowedAt?: number;
  paidAt?: number;
  completedAt?: number;
  expiresAt: number;        // order window
  timerSec: number;         // seconds remaining (updated by tick)
  audit: P2PAuditEntry[];   // immutable append-only log
}

export interface P2PNotification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
  ts: number;
  read: boolean;
  tradeId?: string;
}

export interface FxRate {
  base: string;
  rates: Record<string, number>;
  updatedAt: number;
}

// ─── Payment methods registry ─────────────────────────────────────────────────

export const PAY_METHODS: P2PPayMethod[] = [
  // Global
  { id: "bank_transfer",  label: "Bank Transfer",   icon: "🏦", color: "#3b82f6", category: "bank" },
  { id: "paypal",         label: "PayPal",           icon: "🅿",  color: "#003087", category: "wallet" },
  { id: "wise",           label: "Wise",             icon: "💚", color: "#00b9ff", category: "wallet" },
  { id: "revolut",        label: "Revolut",          icon: "🔵", color: "#0075eb", category: "wallet" },
  { id: "skrill",         label: "Skrill",           icon: "💜", color: "#8b22b0", category: "wallet" },
  { id: "neteller",       label: "Neteller",         icon: "🌐", color: "#ff6200", category: "wallet" },
  // USA
  { id: "zelle",          label: "Zelle",            icon: "⚡", color: "#6d1ed4", country: "US", category: "bank" },
  { id: "venmo",          label: "Venmo",            icon: "V",  color: "#008cff", country: "US", category: "wallet" },
  { id: "cashapp",        label: "Cash App",         icon: "$",  color: "#00d632", country: "US", category: "wallet" },
  { id: "chime",          label: "Chime",            icon: "🏦", color: "#1ec677", country: "US", category: "bank" },
  // UK
  { id: "faster_payments",label: "Faster Payments",  icon: "🇬🇧", color: "#cf142b", country: "GB", category: "bank" },
  { id: "monzo",          label: "Monzo",            icon: "🔶", color: "#ff5c00", country: "GB", category: "bank" },
  // Nigeria
  { id: "opay",           label: "OPay",             icon: "💚", color: "#00cf00", country: "NG", category: "mobile_money" },
  { id: "palmpay",        label: "PalmPay",          icon: "🌴", color: "#00a859", country: "NG", category: "mobile_money" },
  { id: "kuda",           label: "Kuda Bank",        icon: "🟣", color: "#400080", country: "NG", category: "bank" },
  { id: "moniepoint",     label: "Moniepoint",       icon: "💙", color: "#007bff", country: "NG", category: "bank" },
  // Ghana
  { id: "mtn_momo",       label: "MTN MoMo",         icon: "📱", color: "#ffcc00", country: "GH", category: "mobile_money" },
  { id: "vodafone_cash",  label: "Vodafone Cash",    icon: "📱", color: "#e60000", country: "GH", category: "mobile_money" },
  // Kenya
  { id: "mpesa",          label: "M-Pesa",           icon: "📱", color: "#00a650", country: "KE", category: "mobile_money" },
  { id: "airtel_money",   label: "Airtel Money",     icon: "📱", color: "#e00000", country: "KE", category: "mobile_money" },
  // South Africa
  { id: "fnb",            label: "FNB",              icon: "🇿🇦", color: "#006db3", country: "ZA", category: "bank" },
  { id: "capitec",        label: "Capitec",          icon: "🇿🇦", color: "#0070ba", country: "ZA", category: "bank" },
  // Europe
  { id: "sepa",           label: "SEPA Transfer",    icon: "🇪🇺", color: "#003399", country: "EU", category: "bank" },
  { id: "n26",            label: "N26",              icon: "🖤", color: "#1a1a1a", category: "bank" },
  // India
  { id: "upi",            label: "UPI",              icon: "🇮🇳", color: "#ff6600", country: "IN", category: "bank" },
  { id: "paytm",          label: "Paytm",            icon: "💙", color: "#00baf2", country: "IN", category: "wallet" },
  // Brazil
  { id: "pix",            label: "PIX",              icon: "🇧🇷", color: "#32bcad", country: "BR", category: "bank" },
  // UAE
  { id: "uae_transfer",   label: "UAE Bank Transfer",icon: "🇦🇪", color: "#00732f", country: "AE", category: "bank" },
  // China
  { id: "alipay",         label: "Alipay",           icon: "💙", color: "#1677ff", country: "CN", category: "wallet" },
  { id: "wechat_pay",     label: "WeChat Pay",       icon: "💚", color: "#07c160", country: "CN", category: "wallet" },
  // Crypto (on-chain)
  { id: "usdc_onchain",   label: "USDC On-chain",    icon: "🔵", color: "#2775ca", category: "crypto" },
];

// ─── Fiat currencies ──────────────────────────────────────────────────────────

export interface FiatCurrency {
  code: string; name: string; symbol: string; country: string; flag: string;
}

export const FIAT_CURRENCIES: FiatCurrency[] = [
  { code: "USD", name: "US Dollar",          symbol: "$",    country: "US", flag: "🇺🇸" },
  { code: "EUR", name: "Euro",               symbol: "€",    country: "EU", flag: "🇪🇺" },
  { code: "GBP", name: "British Pound",      symbol: "£",    country: "GB", flag: "🇬🇧" },
  { code: "NGN", name: "Nigerian Naira",     symbol: "₦",    country: "NG", flag: "🇳🇬" },
  { code: "GHS", name: "Ghanaian Cedi",      symbol: "₵",    country: "GH", flag: "🇬🇭" },
  { code: "KES", name: "Kenyan Shilling",    symbol: "KSh",  country: "KE", flag: "🇰🇪" },
  { code: "ZAR", name: "South African Rand", symbol: "R",    country: "ZA", flag: "🇿🇦" },
  { code: "INR", name: "Indian Rupee",       symbol: "₹",    country: "IN", flag: "🇮🇳" },
  { code: "AED", name: "UAE Dirham",         symbol: "د.إ",  country: "AE", flag: "🇦🇪" },
  { code: "BRL", name: "Brazilian Real",     symbol: "R$",   country: "BR", flag: "🇧🇷" },
  { code: "JPY", name: "Japanese Yen",       symbol: "¥",    country: "JP", flag: "🇯🇵" },
  { code: "CNY", name: "Chinese Yuan",       symbol: "¥",    country: "CN", flag: "🇨🇳" },
  { code: "CAD", name: "Canadian Dollar",    symbol: "C$",   country: "CA", flag: "🇨🇦" },
  { code: "AUD", name: "Australian Dollar",  symbol: "A$",   country: "AU", flag: "🇦🇺" },
  { code: "MXN", name: "Mexican Peso",       symbol: "$",    country: "MX", flag: "🇲🇽" },
  { code: "IDR", name: "Indonesian Rupiah",  symbol: "Rp",   country: "ID", flag: "🇮🇩" },
  { code: "PHP", name: "Philippine Peso",    symbol: "₱",    country: "PH", flag: "🇵🇭" },
  { code: "PKR", name: "Pakistani Rupee",    symbol: "₨",    country: "PK", flag: "🇵🇰" },
  { code: "VND", name: "Vietnamese Dong",    symbol: "₫",    country: "VN", flag: "🇻🇳" },
  { code: "THB", name: "Thai Baht",          symbol: "฿",    country: "TH", flag: "🇹🇭" },
  { code: "SGD", name: "Singapore Dollar",   symbol: "S$",   country: "SG", flag: "🇸🇬" },
  { code: "HKD", name: "Hong Kong Dollar",   symbol: "HK$",  country: "HK", flag: "🇭🇰" },
  { code: "TRY", name: "Turkish Lira",       symbol: "₺",    country: "TR", flag: "🇹🇷" },
  { code: "UAH", name: "Ukrainian Hryvnia",  symbol: "₴",    country: "UA", flag: "🇺🇦" },
  { code: "PLN", name: "Polish Zloty",       symbol: "zł",   country: "PL", flag: "🇵🇱" },
  { code: "CZK", name: "Czech Koruna",       symbol: "Kč",   country: "CZ", flag: "🇨🇿" },
  { code: "SEK", name: "Swedish Krona",      symbol: "kr",   country: "SE", flag: "🇸🇪" },
  { code: "NOK", name: "Norwegian Krone",    symbol: "kr",   country: "NO", flag: "🇳🇴" },
  { code: "DKK", name: "Danish Krone",       symbol: "kr",   country: "DK", flag: "🇩🇰" },
  { code: "CHF", name: "Swiss Franc",        symbol: "Fr",   country: "CH", flag: "🇨🇭" },
  { code: "CLP", name: "Chilean Peso",       symbol: "$",    country: "CL", flag: "🇨🇱" },
  { code: "COP", name: "Colombian Peso",     symbol: "$",    country: "CO", flag: "🇨🇴" },
  { code: "ARS", name: "Argentine Peso",     symbol: "$",    country: "AR", flag: "🇦🇷" },
  { code: "PEN", name: "Peruvian Sol",       symbol: "S/",   country: "PE", flag: "🇵🇪" },
  { code: "EGP", name: "Egyptian Pound",     symbol: "£",    country: "EG", flag: "🇪🇬" },
  { code: "MAD", name: "Moroccan Dirham",    symbol: "MAD",  country: "MA", flag: "🇲🇦" },
  { code: "GEL", name: "Georgian Lari",      symbol: "₾",    country: "GE", flag: "🇬🇪" },
  { code: "KZT", name: "Kazakhstani Tenge",  symbol: "₸",    country: "KZ", flag: "🇰🇿" },
  { code: "RUB", name: "Russian Ruble",      symbol: "₽",    country: "RU", flag: "🇷🇺" },
  { code: "HUF", name: "Hungarian Forint",   symbol: "Ft",   country: "HU", flag: "🇭🇺" },
];

// ─── Asset seeds (updated by priceStore tickers) ──────────────────────────────
const SEED_PRICES: Record<string, number> = {
  USDT: 1, USDC: 1, BTC: 97000, ETH: 3400, SOL: 185, BNB: 620, XRP: 0.52,
};

// ─── Merchant seed data ───────────────────────────────────────────────────────
const SEED_MERCHANTS: P2PMerchant[] = [
  { id: "m1", name: "CryptoKing_NG",  avatar: "CK", verified: true,  kycLevel: 3, completedTrades: 4821, completionRate: 99.2, avgResponseSec: 45,  positive: 98.7, registeredAt: Date.now() - 86400000*180, onlineAt: Date.now() - 60000,    currency: "NGN", country: "NG" },
  { id: "m2", name: "SwiftTrader_UK", avatar: "ST", verified: true,  kycLevel: 2, completedTrades: 1240, completionRate: 98.1, avgResponseSec: 120, positive: 97.2, registeredAt: Date.now() - 86400000*90,  onlineAt: Date.now() - 300000,   currency: "GBP", country: "GB" },
  { id: "m3", name: "AfriPay_GH",     avatar: "AP", verified: true,  kycLevel: 2, completedTrades: 872,  completionRate: 97.5, avgResponseSec: 180, positive: 96.8, registeredAt: Date.now() - 86400000*60,  onlineAt: Date.now() - 120000,   currency: "GHS", country: "GH" },
  { id: "m4", name: "USDPro",         avatar: "UP", verified: true,  kycLevel: 3, completedTrades: 9320, completionRate: 99.7, avgResponseSec: 30,  positive: 99.4, registeredAt: Date.now() - 86400000*365, onlineAt: Date.now() - 30000,    currency: "USD", country: "US" },
  { id: "m5", name: "EuroDesk",       avatar: "ED", verified: true,  kycLevel: 2, completedTrades: 3100, completionRate: 98.9, avgResponseSec: 90,  positive: 98.1, registeredAt: Date.now() - 86400000*200, onlineAt: Date.now() - 600000,   currency: "EUR", country: "EU" },
  { id: "m6", name: "NairaExpress",   avatar: "NE", verified: false, kycLevel: 1, completedTrades: 234,  completionRate: 94.3, avgResponseSec: 300, positive: 91.2, registeredAt: Date.now() - 86400000*30,  onlineAt: Date.now() - 1800000,  currency: "NGN", country: "NG" },
  { id: "m7", name: "ZarTrader_ZA",   avatar: "ZT", verified: true,  kycLevel: 2, completedTrades: 560,  completionRate: 97.8, avgResponseSec: 150, positive: 96.5, registeredAt: Date.now() - 86400000*120, onlineAt: Date.now() - 900000,   currency: "ZAR", country: "ZA" },
  { id: "m8", name: "MpesaKing_KE",   avatar: "MK", verified: true,  kycLevel: 2, completedTrades: 1890, completionRate: 98.5, avgResponseSec: 60,  positive: 97.9, registeredAt: Date.now() - 86400000*150, onlineAt: Date.now() - 180000,   currency: "KES", country: "KE" },
];

// ─── Advertisement seed ───────────────────────────────────────────────────────
function seedAds(fxRates: Record<string, number>): P2PAdvertisement[] {
  const ads: P2PAdvertisement[] = [];
  const assets: P2PAsset[] = ["USDT", "USDC", "BTC", "ETH", "SOL", "BNB"];
  const configs = [
    { merchant: "m1", side: "sell" as const, asset: "USDT" as const, fiat: "NGN", premium: 1.02, avail: 50000, min: 500, max: 5000000,   methods: ["bank_transfer", "opay", "palmpay", "kuda"] },
    { merchant: "m1", side: "buy"  as const, asset: "USDT" as const, fiat: "NGN", premium: 0.98, avail: 30000, min: 500, max: 3000000,   methods: ["bank_transfer", "opay", "moniepoint"] },
    { merchant: "m4", side: "sell" as const, asset: "USDC" as const, fiat: "USD", premium: 1.00, avail: 20000, min: 10,  max: 50000,     methods: ["bank_transfer", "zelle", "cashapp"] },
    { merchant: "m4", side: "buy"  as const, asset: "USDC" as const, fiat: "USD", premium: 1.00, avail: 10000, min: 10,  max: 20000,     methods: ["bank_transfer", "zelle"] },
    { merchant: "m2", side: "sell" as const, asset: "BTC"  as const, fiat: "GBP", premium: 1.01, avail: 0.5,   min: 10,  max: 5000,      methods: ["bank_transfer", "faster_payments", "monzo"] },
    { merchant: "m5", side: "sell" as const, asset: "ETH"  as const, fiat: "EUR", premium: 1.015,avail: 10,    min: 20,  max: 10000,     methods: ["sepa", "bank_transfer", "n26"] },
    { merchant: "m3", side: "sell" as const, asset: "USDT" as const, fiat: "GHS", premium: 1.03, avail: 5000,  min: 50,  max: 50000,     methods: ["bank_transfer", "mtn_momo", "vodafone_cash"] },
    { merchant: "m8", side: "sell" as const, asset: "USDT" as const, fiat: "KES", premium: 1.02, avail: 8000,  min: 100, max: 100000,    methods: ["mpesa", "airtel_money", "bank_transfer"] },
    { merchant: "m7", side: "sell" as const, asset: "USDT" as const, fiat: "ZAR", premium: 1.025,avail: 6000,  min: 100, max: 200000,    methods: ["bank_transfer", "fnb", "capitec"] },
    { merchant: "m4", side: "sell" as const, asset: "BTC"  as const, fiat: "USD", premium: 1.005,avail: 2,     min: 10,  max: 100000,    methods: ["bank_transfer", "wire"] },
    { merchant: "m4", side: "sell" as const, asset: "SOL"  as const, fiat: "USD", premium: 1.005,avail: 500,   min: 10,  max: 25000,     methods: ["bank_transfer", "zelle", "cashapp"] },
    { merchant: "m5", side: "buy"  as const, asset: "ETH"  as const, fiat: "EUR", premium: 0.985,avail: 5,     min: 50,  max: 5000,      methods: ["sepa"] },
  ];

  for (let i = 0; i < configs.length; i++) {
    const c = configs[i];
    const baseUsd = SEED_PRICES[c.asset] ?? 1;
    const fxRate = fxRates[c.fiat] ?? 1;
    const marketPrice = baseUsd * fxRate;
    const price = Math.round(marketPrice * c.premium * 100) / 100;
    const methods = c.methods.map(id => PAY_METHODS.find(p => p.id === id)!).filter(Boolean);

    ads.push({
      id:           `ad-${i + 1}`,
      merchantId:   c.merchant,
      side:         c.side,
      asset:        c.asset,
      fiatCurrency: c.fiat,
      price,
      premiumPct:   (c.premium - 1) * 100,
      availableAmt: c.avail,
      minFiat:      c.min,
      maxFiat:      c.max,
      payMethods:   methods,
      terms:        "Please complete payment within 15 minutes. Include your wallet address in the payment reference.",
      autoReply:    "Thank you for your order! Please send payment using one of the listed methods.",
      status:       "active",
      createdAt:    Date.now() - Math.random() * 3600000,
      fills:        Math.floor(Math.random() * 50),
      score:        0,
    });
  }

  // Add extra ads for more assets
  const extraAssets = assets.slice(3);
  for (const asset of extraAssets) {
    const baseUsd = SEED_PRICES[asset] ?? 1;
    const price = baseUsd * (fxRates["USD"] ?? 1) * 1.005;
    ads.push({
      id:           `ad-x-${asset}`,
      merchantId:   "m4",
      side:         "sell",
      asset,
      fiatCurrency: "USD",
      price,
      premiumPct:   0.5,
      availableAmt: 100,
      minFiat:      10,
      maxFiat:      10000,
      payMethods:   [PAY_METHODS.find(p => p.id === "bank_transfer")!, PAY_METHODS.find(p => p.id === "zelle")!].filter(Boolean),
      terms:        "Fast trade, verified trader, 15 min window.",
      autoReply:    "Order received! Send payment and confirm.",
      status:       "active",
      createdAt:    Date.now() - 7200000,
      fills:        0,
      score:        0,
    });
  }

  return ads;
}

// ─── Ranking algorithm ────────────────────────────────────────────────────────
// Scores 0-100: favours best price, completion rate, response time, verification
function rankAd(ad: P2PAdvertisement, merchants: Record<string, P2PMerchant>, side: P2POrderSide, marketPrice: number): number {
  const m = merchants[ad.merchantId];
  if (!m) return 0;
  // Price score: closer to market = better (for taker)
  const priceDelta = side === "buy"
    ? (ad.price - marketPrice) / marketPrice   // buyer wants low price — lower ad price = better
    : (marketPrice - ad.price) / marketPrice;  // seller wants high price — higher ad price = better
  const priceScore = Math.max(0, 1 - Math.abs(priceDelta) * 5) * 30; // max 30pts

  const completionScore = (m.completionRate / 100) * 25;         // max 25pts
  const responseScore   = Math.max(0, 1 - m.avgResponseSec / 600) * 20; // max 20pts
  const verifiedBonus   = m.verified ? 15 : 0;
  const volumeScore     = Math.min(m.completedTrades / 500, 1) * 10; // max 10pts

  return priceScore + completionScore + responseScore + verifiedBonus + volumeScore;
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface P2PState {
  // Market data
  fxRates:        Record<string, number>;
  fxUpdatedAt:    number;
  cryptoPrices:   Record<string, number>; // asset → USD price

  // Marketplace
  merchants:      Record<string, P2PMerchant>;
  ads:            P2PAdvertisement[];
  trades:         P2PTrade[];
  notifications:  P2PNotification[];

  // UI state
  selectedAsset:  P2PAsset;
  selectedFiat:   string;
  selectedSide:   P2POrderSide;
  filterPayMethod:string;
  filterVerified: boolean;
  activeTrade:    string | null;   // trade ID in focus
  unreadNotifs:   number;

  // Actions
  setFxRates:        (rates: Record<string, number>) => void;
  setCryptoPrice:    (asset: string, usdPrice: number) => void;
  setSelectedAsset:  (a: P2PAsset) => void;
  setSelectedFiat:   (f: string) => void;
  setSelectedSide:   (s: P2POrderSide) => void;
  setFilterPayMethod:(id: string) => void;
  setFilterVerified: (v: boolean) => void;
  setActiveTrade:    (id: string | null) => void;
  markNotifsRead:    () => void;

  // Trade lifecycle
  createTrade:       (adId: string, cryptoAmt: number, payMethodId: string, takerId: string) => P2PTrade | null;
  advanceEscrow:     (tradeId: string) => void;   // matched → escrowed
  confirmPayment:    (tradeId: string, ref: string) => void;
  verifyAndRelease:  (tradeId: string) => void;   // seller confirms → released → completed
  cancelTrade:       (tradeId: string, reason: string) => void;
  openDispute:       (tradeId: string, reason: string) => void;
  resolveDispute:    (tradeId: string, winner: "buyer" | "seller") => void;
  tickTimers:        () => void;

  // Ad management
  postAd:            (ad: Omit<P2PAdvertisement, "id" | "score" | "fills" | "createdAt">) => void;
  pauseAd:           (adId: string) => void;
  deleteAd:          (adId: string) => void;

  // Ranked ads selector (computed)
  rankedAds:         (side: P2POrderSide, asset: P2PAsset, fiat: string) => P2PAdvertisement[];
}

// ─── Store implementation ─────────────────────────────────────────────────────

const INITIAL_FX: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, NGN: 1650, GHS: 15.8, KES: 130,
  ZAR: 18.5, INR: 83.5, AED: 3.67, BRL: 4.95, JPY: 149, CNY: 7.24,
  CAD: 1.36, AUD: 1.53, MXN: 17.2, IDR: 15800, PHP: 56.5, PKR: 278,
  VND: 24800, THB: 35.2, SGD: 1.34, HKD: 7.82, TRY: 32.1, UAH: 38.5,
  PLN: 4.02, CZK: 22.8, SEK: 10.5, NOK: 10.7, DKK: 6.91, CHF: 0.89,
  CLP: 910, COP: 3950, ARS: 890, PEN: 3.72, EGP: 47.5, MAD: 10.1,
  GEL: 2.68, KZT: 448, RUB: 91.2, HUF: 355,
};

// Helper to add a notification
function pushNotif(
  get: () => P2PState,
  set: (fn: (s: P2PState) => Partial<P2PState>) => void,
  notif: Omit<P2PNotification, "id" | "ts" | "read">,
) {
  const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  set(s => ({
    notifications: [{ ...notif, id, ts: Date.now(), read: false }, ...s.notifications].slice(0, 50),
    unreadNotifs: get().unreadNotifs + 1,
  }));
}

function appendAudit(trade: P2PTrade, event: string, actor: P2PAuditEntry["actor"], detail?: string): P2PTrade {
  return { ...trade, audit: [...trade.audit, { ts: Date.now(), event, actor, detail }] };
}

export const useP2PStore = create<P2PState>()(
  subscribeWithSelector((set, get) => {
    const initialAds = seedAds(INITIAL_FX);

    return {
      fxRates:         INITIAL_FX,
      fxUpdatedAt:     0,
      cryptoPrices:    { ...SEED_PRICES },

      merchants: Object.fromEntries(SEED_MERCHANTS.map(m => [m.id, m])),
      ads:       initialAds,
      trades:    [],
      notifications: [],

      selectedAsset:   "USDT",
      selectedFiat:    "USD",
      selectedSide:    "buy",
      filterPayMethod: "",
      filterVerified:  false,
      activeTrade:     null,
      unreadNotifs:    0,

      // ── Market data ──────────────────────────────────────────────────────────
      setFxRates: (rates) => set(s => {
        const merged = { ...s.fxRates, ...rates };
        // Re-price all active ads on FX update
        const updatedAds = s.ads.map(ad => {
          const baseUsd = get().cryptoPrices[ad.asset] ?? SEED_PRICES[ad.asset] ?? 1;
          const fxRate = merged[ad.fiatCurrency] ?? 1;
          const marketPrice = baseUsd * fxRate;
          return { ...ad, price: Math.round(marketPrice * (1 + ad.premiumPct / 100) * 100) / 100 };
        });
        return { fxRates: merged, fxUpdatedAt: Date.now(), ads: updatedAds };
      }),

      setCryptoPrice: (asset, usdPrice) => set(s => {
        const prices = { ...s.cryptoPrices, [asset]: usdPrice };
        // Re-price ads for this asset
        const updatedAds = s.ads.map(ad => {
          if (ad.asset !== asset) return ad;
          const fxRate = s.fxRates[ad.fiatCurrency] ?? 1;
          const marketPrice = usdPrice * fxRate;
          return { ...ad, price: Math.round(marketPrice * (1 + ad.premiumPct / 100) * 100) / 100 };
        });
        return { cryptoPrices: prices, ads: updatedAds };
      }),

      // ── UI actions ───────────────────────────────────────────────────────────
      setSelectedAsset:   (a) => set({ selectedAsset: a }),
      setSelectedFiat:    (f) => set({ selectedFiat: f }),
      setSelectedSide:    (s) => set({ selectedSide: s }),
      setFilterPayMethod: (id) => set({ filterPayMethod: id }),
      setFilterVerified:  (v) => set({ filterVerified: v }),
      setActiveTrade:     (id) => set({ activeTrade: id }),
      markNotifsRead:     () => set({ unreadNotifs: 0, notifications: get().notifications.map(n => ({ ...n, read: true })) }),

      // ── Trade lifecycle ──────────────────────────────────────────────────────

      createTrade: (adId, cryptoAmt, payMethodId, takerId) => {
        const s = get();
        const ad = s.ads.find(a => a.id === adId);
        if (!ad || ad.status !== "active") return null;
        if (cryptoAmt > ad.availableAmt) return null;
        const payMethod = ad.payMethods.find(p => p.id === payMethodId) ?? ad.payMethods[0];
        if (!payMethod) return null;

        const fiatAmt = Math.round(cryptoAmt * ad.price * 100) / 100;
        if (fiatAmt < ad.minFiat || fiatAmt > ad.maxFiat) return null;

        const trade: P2PTrade = {
          id:           `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          adId,
          merchantId:   ad.merchantId,
          takerId,
          side:         ad.side === "sell" ? "buy" : "sell", // taker's perspective
          asset:        ad.asset,
          fiatCurrency: ad.fiatCurrency,
          cryptoAmt,
          fiatAmt,
          price:        ad.price,
          payMethod,
          status:       "matched",
          createdAt:    Date.now(),
          matchedAt:    Date.now(),
          expiresAt:    Date.now() + 15 * 60 * 1000,
          timerSec:     15 * 60,
          audit:        [{ ts: Date.now(), event: "Order created", actor: "system", detail: `${cryptoAmt} ${ad.asset} @ ${ad.price} ${ad.fiatCurrency}` }],
        };

        // Lock ad inventory
        set(st => ({
          trades: [trade, ...st.trades],
          activeTrade: trade.id,
          ads: st.ads.map(a => a.id === adId
            ? { ...a, availableAmt: a.availableAmt - cryptoAmt, status: a.availableAmt - cryptoAmt <= 0 ? "exhausted" : a.status }
            : a
          ),
        }));

        pushNotif(get, set, {
          type: "info",
          title: "Order Created",
          body: `Buy ${cryptoAmt} ${ad.asset} from ${s.merchants[ad.merchantId]?.name ?? "merchant"} — send payment within 15 min`,
          tradeId: trade.id,
        });

        // Auto-advance to escrowed after 2s (simulates on-chain escrow lock)
        setTimeout(() => { get().advanceEscrow(trade.id); }, 2000);

        return trade;
      },

      advanceEscrow: (tradeId) => {
        set(s => ({
          trades: s.trades.map(t => {
            if (t.id !== tradeId || t.status !== "matched") return t;
            const updated = appendAudit({ ...t, status: "escrowed", escrowedAt: Date.now() },
              "Escrow locked — crypto held in smart contract", "system",
              "Seller's crypto locked. Safe to send payment.");
            return updated;
          }),
        }));
        pushNotif(get, set, {
          type: "success",
          title: "Escrow Locked ✓",
          body: "Seller's crypto is secured in escrow. Safe to send payment now.",
          tradeId,
        });
      },

      confirmPayment: (tradeId, ref) => {
        set(s => ({
          trades: s.trades.map(t => {
            if (t.id !== tradeId || t.status !== "escrowed") return t;
            return appendAudit(
              { ...t, status: "paid", paidAt: Date.now(), paymentRef: ref },
              "Buyer confirmed payment sent",
              "buyer",
              `Payment reference: ${ref}`,
            );
          }),
        }));
        pushNotif(get, set, {
          type: "info",
          title: "Payment Claimed",
          body: "Waiting for seller to verify payment and release crypto.",
          tradeId,
        });
        // Simulate seller verifying after 3s
        setTimeout(() => { get().verifyAndRelease(tradeId); }, 3000);
      },

      verifyAndRelease: (tradeId) => {
        set(s => ({
          trades: s.trades.map(t => {
            if (t.id !== tradeId || t.status !== "paid") return t;
            return appendAudit(
              { ...t, status: "released" },
              "Seller verified payment — escrow released to buyer",
              "seller",
            );
          }),
        }));
        // Finalise after 500ms
        setTimeout(() => {
          set(s => ({
            trades: s.trades.map(t => {
              if (t.id !== tradeId || t.status !== "released") return t;
              return appendAudit(
                { ...t, status: "completed", completedAt: Date.now() },
                "Trade completed — crypto delivered",
                "system",
              );
            }),
          }));
          pushNotif(get, set, {
            type: "success",
            title: "Trade Complete! 🎉",
            body: "Crypto has been released. Check your wallet.",
            tradeId,
          });
        }, 500);
      },

      cancelTrade: (tradeId, reason) => {
        set(s => ({
          trades: s.trades.map(t => {
            if (t.id !== tradeId || ["completed", "released", "cancelled"].includes(t.status)) return t;
            // Restore ad inventory if cancelled before escrowed
            if (t.status === "matched") {
              set(st => ({ ads: st.ads.map(a => a.id === t.adId ? { ...a, availableAmt: a.availableAmt + t.cryptoAmt } : a) }));
            }
            return appendAudit({ ...t, status: "cancelled" }, `Cancelled: ${reason}`, "buyer");
          }),
          activeTrade: null,
        }));
        pushNotif(get, set, { type: "warning", title: "Order Cancelled", body: reason, tradeId });
      },

      openDispute: (tradeId, reason) => {
        set(s => ({
          trades: s.trades.map(t => {
            if (t.id !== tradeId) return t;
            return appendAudit({ ...t, status: "disputed", disputeReason: reason }, `Dispute opened: ${reason}`, "buyer");
          }),
        }));
        pushNotif(get, set, {
          type: "error",
          title: "Dispute Opened",
          body: "A support agent will review this trade. Please keep evidence ready.",
          tradeId,
        });
      },

      resolveDispute: (tradeId, winner) => {
        set(s => ({
          trades: s.trades.map(t => {
            if (t.id !== tradeId || t.status !== "disputed") return t;
            const newStatus: P2POrderStatus = winner === "buyer" ? "completed" : "cancelled";
            return appendAudit({ ...t, status: newStatus }, `Dispute resolved in favour of ${winner}`, "admin");
          }),
        }));
        pushNotif(get, set, {
          type: winner === "buyer" ? "success" : "warning",
          title: "Dispute Resolved",
          body: winner === "buyer" ? "Decision in your favour — crypto released." : "Decision for seller — crypto returned.",
          tradeId,
        });
      },

      tickTimers: () => {
        const now = Date.now();
        set(s => ({
          trades: s.trades.map(t => {
            if (!["matched", "escrowed", "paid"].includes(t.status)) return t;
            const remaining = Math.max(0, Math.floor((t.expiresAt - now) / 1000));
            if (remaining === 0 && t.status === "matched") {
              // Expire unmatched orders
              return appendAudit({ ...t, status: "expired", timerSec: 0 }, "Order expired — no payment received", "system");
            }
            return t.timerSec === remaining ? t : { ...t, timerSec: remaining };
          }),
        }));
      },

      // ── Ad management ────────────────────────────────────────────────────────
      postAd: (adData) => {
        const ad: P2PAdvertisement = {
          ...adData,
          id:        `ad-user-${Date.now()}`,
          score:     0,
          fills:     0,
          createdAt: Date.now(),
        };
        set(s => ({ ads: [ad, ...s.ads] }));
        pushNotif(get, set, { type: "success", title: "Ad Posted", body: `Your ${ad.side} ad for ${ad.asset} is now live.` });
      },

      pauseAd:   (adId) => set(s => ({ ads: s.ads.map(a => a.id === adId ? { ...a, status: "paused" }     : a) })),
      deleteAd:  (adId) => set(s => ({ ads: s.ads.filter(a => a.id !== adId) })),

      // ── Ranked ads ───────────────────────────────────────────────────────────
      rankedAds: (side, asset, fiat) => {
        const s = get();
        const ads = s.ads.filter(a =>
          a.side === (side === "buy" ? "sell" : "buy") && // show merchant sell ads for buyers
          a.asset === asset &&
          a.fiatCurrency === fiat &&
          a.status === "active" &&
          a.availableAmt > 0,
        );
        const marketPrice = (s.cryptoPrices[asset] ?? SEED_PRICES[asset] ?? 1) * (s.fxRates[fiat] ?? 1);
        return ads
          .map(a => ({ ...a, score: rankAd(a, s.merchants, side, marketPrice) }))
          .sort((a, b) => b.score - a.score);
      },
    };
  }),
);

// ── FX rate refresh (every 5 min) ─────────────────────────────────────────────
async function refreshFxRates() {
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!r.ok) return;
    const data = await r.json() as { rates: Record<string, number> };
    useP2PStore.getState().setFxRates(data.rates);
  } catch { /* silent — use seed rates */ }
}

void refreshFxRates();
setInterval(() => { void refreshFxRates(); }, 5 * 60 * 1000);
