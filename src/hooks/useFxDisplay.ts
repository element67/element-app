/**
 * useFxDisplay — converts USD amounts into the user's preferred local currency.
 *
 * Rules:
 *  - All internal values are denominated in USD.
 *  - The `convert` function multiplies by the live FX rate from marketplaceStore.
 *  - Never treat a converted display value as a real balance or completed tx.
 *  - If no live rate is available, falls back to the seed table (still shown as
 *    an estimate, never fabricated).
 */
import { useEffect, useMemo } from "react";
import { useMarketplaceStore } from "@/store/marketplaceStore";
import { useWalletStore }      from "@/store/walletStore";

// ── Currency metadata ─────────────────────────────────────────────────────────

interface CurrencyMeta {
  code:     string;
  symbol:   string;
  name:     string;
  decimals: number;   // typical display decimal places
  locale:   string;   // BCP-47 locale best for this currency
}

/**
 * Comprehensive currency metadata — symbol, decimal precision, formatting locale.
 * Covers every currency in COUNTRIES plus common extras.
 */
export const CURRENCY_META: Record<string, CurrencyMeta> = {
  USD: { code:"USD", symbol:"$",   name:"US Dollar",           decimals:2, locale:"en-US" },
  EUR: { code:"EUR", symbol:"€",   name:"Euro",                decimals:2, locale:"de-DE" },
  GBP: { code:"GBP", symbol:"£",   name:"British Pound",       decimals:2, locale:"en-GB" },
  NGN: { code:"NGN", symbol:"₦",   name:"Nigerian Naira",      decimals:0, locale:"en-NG" },
  GHS: { code:"GHS", symbol:"GH₵", name:"Ghanaian Cedi",       decimals:2, locale:"en-GH" },
  KES: { code:"KES", symbol:"KSh", name:"Kenyan Shilling",     decimals:0, locale:"en-KE" },
  ZAR: { code:"ZAR", symbol:"R",   name:"South African Rand",  decimals:2, locale:"en-ZA" },
  TZS: { code:"TZS", symbol:"TSh", name:"Tanzanian Shilling",  decimals:0, locale:"sw-TZ" },
  UGX: { code:"UGX", symbol:"USh", name:"Ugandan Shilling",    decimals:0, locale:"en-UG" },
  RWF: { code:"RWF", symbol:"RF",  name:"Rwandan Franc",       decimals:0, locale:"rw-RW" },
  ETB: { code:"ETB", symbol:"Br",  name:"Ethiopian Birr",      decimals:2, locale:"am-ET" },
  EGP: { code:"EGP", symbol:"E£",  name:"Egyptian Pound",      decimals:2, locale:"ar-EG" },
  MAD: { code:"MAD", symbol:"DH",  name:"Moroccan Dirham",     decimals:2, locale:"ar-MA" },
  XOF: { code:"XOF", symbol:"CFA", name:"West African CFA",    decimals:0, locale:"fr-SN" },
  XAF: { code:"XAF", symbol:"CFA", name:"Central African CFA", decimals:0, locale:"fr-CM" },
  ZMW: { code:"ZMW", symbol:"ZK",  name:"Zambian Kwacha",      decimals:2, locale:"en-ZM" },
  AOA: { code:"AOA", symbol:"Kz",  name:"Angolan Kwanza",      decimals:2, locale:"pt-AO" },
  MZN: { code:"MZN", symbol:"MT",  name:"Mozambican Metical",  decimals:2, locale:"pt-MZ" },
  ZWL: { code:"ZWL", symbol:"Z$",  name:"Zimbabwean Dollar",   decimals:2, locale:"en-ZW" },
  GNF: { code:"GNF", symbol:"FG",  name:"Guinean Franc",       decimals:0, locale:"fr-GN" },
  MGA: { code:"MGA", symbol:"Ar",  name:"Malagasy Ariary",     decimals:0, locale:"mg-MG" },
  // Americas
  CAD: { code:"CAD", symbol:"CA$", name:"Canadian Dollar",     decimals:2, locale:"en-CA" },
  MXN: { code:"MXN", symbol:"MX$", name:"Mexican Peso",        decimals:2, locale:"es-MX" },
  BRL: { code:"BRL", symbol:"R$",  name:"Brazilian Real",      decimals:2, locale:"pt-BR" },
  ARS: { code:"ARS", symbol:"$",   name:"Argentine Peso",      decimals:0, locale:"es-AR" },
  COP: { code:"COP", symbol:"$",   name:"Colombian Peso",      decimals:0, locale:"es-CO" },
  CLP: { code:"CLP", symbol:"$",   name:"Chilean Peso",        decimals:0, locale:"es-CL" },
  PEN: { code:"PEN", symbol:"S/",  name:"Peruvian Sol",        decimals:2, locale:"es-PE" },
  VES: { code:"VES", symbol:"Bs",  name:"Venezuelan Bolívar",  decimals:2, locale:"es-VE" },
  DOP: { code:"DOP", symbol:"$",   name:"Dominican Peso",      decimals:2, locale:"es-DO" },
  GTQ: { code:"GTQ", symbol:"Q",   name:"Guatemalan Quetzal",  decimals:2, locale:"es-GT" },
  HTG: { code:"HTG", symbol:"G",   name:"Haitian Gourde",      decimals:2, locale:"fr-HT" },
  // Asia
  INR: { code:"INR", symbol:"₹",   name:"Indian Rupee",        decimals:0, locale:"en-IN" },
  PKR: { code:"PKR", symbol:"₨",   name:"Pakistani Rupee",     decimals:0, locale:"ur-PK" },
  BDT: { code:"BDT", symbol:"৳",   name:"Bangladeshi Taka",    decimals:0, locale:"bn-BD" },
  PHP: { code:"PHP", symbol:"₱",   name:"Philippine Peso",     decimals:2, locale:"en-PH" },
  IDR: { code:"IDR", symbol:"Rp",  name:"Indonesian Rupiah",   decimals:0, locale:"id-ID" },
  VND: { code:"VND", symbol:"₫",   name:"Vietnamese Dong",     decimals:0, locale:"vi-VN" },
  THB: { code:"THB", symbol:"฿",   name:"Thai Baht",           decimals:2, locale:"th-TH" },
  MYR: { code:"MYR", symbol:"RM",  name:"Malaysian Ringgit",   decimals:2, locale:"ms-MY" },
  SGD: { code:"SGD", symbol:"S$",  name:"Singapore Dollar",    decimals:2, locale:"en-SG" },
  CNY: { code:"CNY", symbol:"¥",   name:"Chinese Yuan",        decimals:2, locale:"zh-CN" },
  JPY: { code:"JPY", symbol:"¥",   name:"Japanese Yen",        decimals:0, locale:"ja-JP" },
  KRW: { code:"KRW", symbol:"₩",   name:"South Korean Won",    decimals:0, locale:"ko-KR" },
  HKD: { code:"HKD", symbol:"HK$", name:"Hong Kong Dollar",    decimals:2, locale:"zh-HK" },
  TWD: { code:"TWD", symbol:"NT$", name:"New Taiwan Dollar",   decimals:0, locale:"zh-TW" },
  LKR: { code:"LKR", symbol:"Rs",  name:"Sri Lankan Rupee",    decimals:0, locale:"si-LK" },
  NPR: { code:"NPR", symbol:"Rs",  name:"Nepalese Rupee",      decimals:0, locale:"ne-NP" },
  KHR: { code:"KHR", symbol:"₹",   name:"Cambodian Riel",      decimals:0, locale:"km-KH" },
  MMK: { code:"MMK", symbol:"K",   name:"Myanmar Kyat",        decimals:0, locale:"my-MM" },
  UZS: { code:"UZS", symbol:"лв",  name:"Uzbekistani Som",     decimals:0, locale:"uz-UZ" },
  KZT: { code:"KZT", symbol:"₸",   name:"Kazakhstani Tenge",   decimals:0, locale:"kk-KZ" },
  // Europe
  PLN: { code:"PLN", symbol:"zł",  name:"Polish Złoty",        decimals:2, locale:"pl-PL" },
  CHF: { code:"CHF", symbol:"Fr",  name:"Swiss Franc",         decimals:2, locale:"de-CH" },
  SEK: { code:"SEK", symbol:"kr",  name:"Swedish Krona",       decimals:2, locale:"sv-SE" },
  NOK: { code:"NOK", symbol:"kr",  name:"Norwegian Krone",     decimals:2, locale:"nb-NO" },
  DKK: { code:"DKK", symbol:"kr",  name:"Danish Krone",        decimals:2, locale:"da-DK" },
  CZK: { code:"CZK", symbol:"Kč",  name:"Czech Koruna",        decimals:2, locale:"cs-CZ" },
  HUF: { code:"HUF", symbol:"Ft",  name:"Hungarian Forint",    decimals:0, locale:"hu-HU" },
  RON: { code:"RON", symbol:"lei", name:"Romanian Leu",        decimals:2, locale:"ro-RO" },
  UAH: { code:"UAH", symbol:"₴",   name:"Ukrainian Hryvnia",   decimals:2, locale:"uk-UA" },
  TRY: { code:"TRY", symbol:"₺",   name:"Turkish Lira",        decimals:2, locale:"tr-TR" },
  RUB: { code:"RUB", symbol:"₽",   name:"Russian Ruble",       decimals:0, locale:"ru-RU" },
  RSD: { code:"RSD", symbol:"din", name:"Serbian Dinar",       decimals:0, locale:"sr-RS" },
  // Middle East
  AED: { code:"AED", symbol:"د.إ", name:"UAE Dirham",          decimals:2, locale:"ar-AE" },
  SAR: { code:"SAR", symbol:"﷼",   name:"Saudi Riyal",         decimals:2, locale:"ar-SA" },
  ILS: { code:"ILS", symbol:"₪",   name:"Israeli Shekel",      decimals:2, locale:"he-IL" },
  IQD: { code:"IQD", symbol:"ع.د", name:"Iraqi Dinar",         decimals:0, locale:"ar-IQ" },
  JOD: { code:"JOD", symbol:"JD",  name:"Jordanian Dinar",     decimals:3, locale:"ar-JO" },
  KWD: { code:"KWD", symbol:"KD",  name:"Kuwaiti Dinar",       decimals:3, locale:"ar-KW" },
  QAR: { code:"QAR", symbol:"QR",  name:"Qatari Riyal",        decimals:2, locale:"ar-QA" },
  // Oceania
  AUD: { code:"AUD", symbol:"A$",  name:"Australian Dollar",   decimals:2, locale:"en-AU" },
  NZD: { code:"NZD", symbol:"NZ$", name:"New Zealand Dollar",  decimals:2, locale:"en-NZ" },
  PGK: { code:"PGK", symbol:"K",   name:"Papua New Guinean Kina", decimals:2, locale:"en-PG" },
  // Extra
  AFN: { code:"AFN", symbol:"؋",   name:"Afghan Afghani",      decimals:2, locale:"ps-AF" },
};

/** Fallback for unknown currencies */
const FALLBACK_META: CurrencyMeta = { code:"???", symbol:"", name:"Unknown", decimals:2, locale:"en-US" };

export function getCurrencyMeta(code: string): CurrencyMeta {
  return CURRENCY_META[code] ?? FALLBACK_META;
}

// ── Core formatting ───────────────────────────────────────────────────────────

/**
 * Format a value in the target currency using the browser's Intl formatter.
 * Falls back to a simple symbol-prefix string if Intl throws.
 */
export function formatLocalCurrency(
  usdValue: number,
  currencyCode: string,
  fxRate: number,
  opts: { hide?: boolean; compact?: boolean } = {},
): string {
  if (opts.hide) return "••••••";
  const meta   = getCurrencyMeta(currencyCode);
  const local  = usdValue * fxRate;

  if (opts.compact && local >= 1_000_000) {
    const m = local / 1_000_000;
    return `${meta.symbol}${m.toFixed(2)}M`;
  }
  if (opts.compact && local >= 1_000) {
    const k = local / 1_000;
    return `${meta.symbol}${k.toFixed(1)}K`;
  }

  // Use native Intl when supported (most browsers)
  try {
    return new Intl.NumberFormat(meta.locale, {
      style:                 "currency",
      currency:              currencyCode,
      minimumFractionDigits: meta.decimals,
      maximumFractionDigits: meta.decimals,
    }).format(local);
  } catch {
    // Intl doesn't know this currency — manual fallback
    const rounded = local.toFixed(meta.decimals);
    return `${meta.symbol}${Number(rounded).toLocaleString()}`;
  }
}

/** Returns the converted numeric value (not formatted). */
export function convertToLocal(usdValue: number, fxRate: number): number {
  return usdValue * fxRate;
}

// ── React hook ────────────────────────────────────────────────────────────────

export interface FxDisplay {
  /** User's currently selected currency code, e.g. "NGN" */
  currency: string;
  /** Currency symbol, e.g. "₦" */
  symbol:   string;
  /** Currency full name */
  name:     string;
  /** Live rate (USD→currency). 1 if unavailable. */
  rate:      number;
  /** ISO timestamp of last FX update */
  updatedAt: number;
  /** Whether rates were fetched live this session */
  isLive:    boolean;

  /**
   * Format a USD amount into the user's local currency string.
   * @param usdValue  Amount denominated in USD
   * @param hide      Whether to mask the value (balance-hide mode)
   * @param compact   Use K/M suffixes for large numbers
   */
  fmt: (usdValue: number, hide?: boolean, compact?: boolean) => string;

  /**
   * Convert a USD amount to the raw local numeric value.
   * Labelled "est" to remind callers this is a display estimate, not a balance.
   */
  toLocalEst: (usdValue: number) => number;

  /** Decimal places for this currency */
  decimals: number;
}

export function useFxDisplay(): FxDisplay {
  const primaryFiat   = useWalletStore(s => s.primaryFiat);
  const fxRates       = useMarketplaceStore(s => s.fxRates);
  const fxUpdatedAt   = useMarketplaceStore(s => s.fxUpdatedAt);
  const fetchFxRates  = useMarketplaceStore(s => s.fetchFxRates);

  // Trigger a background refresh on first mount (non-blocking, side-effect → useEffect)
  useEffect(() => { void fetchFxRates(); }, [fetchFxRates]);

  return useMemo(() => {
    const code = primaryFiat || "USD";
    const meta = getCurrencyMeta(code);
    const rate = fxRates[code] ?? 1;

    return {
      currency:  code,
      symbol:    meta.symbol,
      name:      meta.name,
      rate,
      updatedAt: fxUpdatedAt,
      isLive:    fxUpdatedAt > 0,
      decimals:  meta.decimals,

      fmt: (usdValue, hide = false, compact = false) =>
        formatLocalCurrency(usdValue, code, rate, { hide, compact }),

      toLocalEst: (usdValue) => convertToLocal(usdValue, rate),
    };
  }, [primaryFiat, fxRates, fxUpdatedAt]);
}
