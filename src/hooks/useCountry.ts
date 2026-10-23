/**
 * useCountry — unified country/currency configuration hook
 *
 * Single source of truth for:
 *  - The user's active country (ISO-2 code)
 *  - Their local currency config (symbol, decimals, providers)
 *  - Syncing walletStore.userCountry and fiatStore.activeCountry
 *
 * Usage:
 *   const { country, fiatConfig, setCountry } = useCountry();
 */
import { useCallback } from "react";
import { useWalletStore } from "@/store/walletStore";
import { useFiatStore, FIAT_COUNTRIES, type FiatCountryConfig } from "@/store/fiatStore";
import { COUNTRIES } from "@/store/marketplaceStore";

// ── Geo-detection heuristic (no API call, purely client-side) ─────────────────
// Uses navigator.language + Intl timezone to make a best-guess country code.
export function detectCountryCode(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const lang = (navigator.language || "").toLowerCase();

    // Timezone → country map (cover the main P2P markets first)
    const TZ_MAP: Record<string, string> = {
      "Africa/Lagos":        "NG",
      "Africa/Accra":        "GH",
      "Africa/Nairobi":      "KE",
      "Africa/Johannesburg": "ZA",
      "Africa/Dar_es_Salaam":"TZ",
      "Africa/Kampala":      "UG",
      "Africa/Kigali":       "RW",
      "Africa/Cairo":        "EG",
      "Africa/Casablanca":   "MA",
      "Asia/Kolkata":        "IN",
      "Asia/Calcutta":       "IN",
      "Asia/Dhaka":          "BD",
      "Asia/Karachi":        "PK",
      "Asia/Manila":         "PH",
      "Asia/Jakarta":        "ID",
      "Asia/Ho_Chi_Minh":    "VN",
      "Asia/Bangkok":        "TH",
      "America/Sao_Paulo":   "BR",
      "America/Bogota":      "CO",
      "America/Mexico_City": "MX",
      "America/New_York":    "US",
      "America/Chicago":     "US",
      "America/Los_Angeles": "US",
      "Europe/London":       "GB",
      "Europe/Paris":        "FR",
      "Europe/Berlin":       "DE",
      "Australia/Sydney":    "AU",
    };

    if (TZ_MAP[tz]) return TZ_MAP[tz];

    // Fallback: navigator.language → country part ("en-NG" → "NG")
    const parts = lang.split("-");
    if (parts.length >= 2) {
      const code = parts[parts.length - 1].toUpperCase();
      if (code.length === 2) return code;
    }
  } catch { /* ignore */ }
  return null;
}

// ── Fallback: build a minimal config from marketplaceStore COUNTRIES ──────────
function buildFallbackConfig(countryCode: string): FiatCountryConfig | null {
  const c = COUNTRIES.find(c => c.code === countryCode);
  if (!c) return null;
  return {
    countryCode:      c.code,
    countryName:      c.name,
    currency:         c.currency,
    symbol:           c.currencySymbol ?? "$",
    decimals:         2,
    depositStatus:    "coming_soon",
    providers:        [],
    minDeposit:       100,
    maxDeposit:       1_000_000,
    withdrawEnabled:  false,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface CountryInfo {
  /** ISO-2 country code ("NG", "KE", "IN" …) */
  code:           string;
  /** Display name */
  name:           string;
  /** Local currency code ("NGN", "KES", "INR" …) */
  currency:       string;
  /** Currency symbol ("₦", "KSh", "₹" …) */
  symbol:         string;
  /** Currency decimal places */
  decimals:       number;
  /** Full fiat config (providers, limits, deposit status) */
  fiatConfig:     FiatCountryConfig | null;
  /** Flag image URL from flagcdn.com */
  flagUrl:        string;
  /** Whether this country has a configured fiat account page */
  hasFiatAccount: boolean;
}

export function useCountry() {
  const userCountry    = useWalletStore(s => s.userCountry);
  const setUserCountry = useWalletStore(s => s.setUserCountry);
  const setActiveCountry = useFiatStore(s => s.setActiveCountry);

  // Primary: look up in FIAT_COUNTRIES (has full provider config)
  const fiatConfig: FiatCountryConfig | null =
    FIAT_COUNTRIES.find(f => f.countryCode === userCountry) ??
    buildFallbackConfig(userCountry);

  const countryMeta = COUNTRIES.find(c => c.code === userCountry);

  const info: CountryInfo = {
    code:           userCountry || "NG",
    name:           fiatConfig?.countryName ?? countryMeta?.name ?? userCountry,
    currency:       fiatConfig?.currency    ?? countryMeta?.currency ?? "USD",
    symbol:         fiatConfig?.symbol      ?? countryMeta?.currencySymbol ?? "$",
    decimals:       fiatConfig?.decimals    ?? 2,
    fiatConfig,
    flagUrl:        `https://flagcdn.com/w40/${(userCountry || "NG").toLowerCase()}.png`,
    hasFiatAccount: !!fiatConfig,
  };

  /** Change country — syncs both walletStore and fiatStore */
  const setCountry = useCallback((code: string) => {
    setUserCountry(code);         // also updates primaryFiat in walletStore
    setActiveCountry(code);       // fiatStore active country
  }, [setUserCountry, setActiveCountry]);

  /** List of all countries that have any fiat support */
  const supportedCountries: FiatCountryConfig[] = FIAT_COUNTRIES;

  return { country: info, setCountry, supportedCountries };
}
