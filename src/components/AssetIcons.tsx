/**
 * PERPX — Shared Asset Icon Components
 * Uses the centralized asset registry for all logos, flags, and provider icons.
 * Every icon has a graceful fallback and an accessible aria-label.
 */
import React, { useState, useCallback } from "react";
import {
  cryptoLogoUrl, cryptoLogoLargeUrl, chainLogoUrl, flagUrl,
  CRYPTO_ASSETS, CHAINS, COUNTRIES_DEDUP,
  type PaymentProvider,
} from "@/lib/assetRegistry";

// ─────────────────────────────────────────────────────────────────────────────
// Fallback SVG placeholder (neutral grey circle with first letter)
// ─────────────────────────────────────────────────────────────────────────────
function FallbackIcon({
  label, size, color = "#444", textColor = "#fff",
}: { label: string; size: number; color?: string; textColor?: string }) {
  const letter = label.slice(0, 2).toUpperCase();
  const fs = Math.max(8, Math.round(size * 0.38));
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      aria-label={label} role="img"
      style={{ flexShrink: 0, borderRadius: "50%", display: "block" }}
    >
      <circle cx={size/2} cy={size/2} r={size/2} fill={color} />
      <text
        x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        fill={textColor} fontSize={fs} fontWeight="700" fontFamily="monospace"
      >{letter}</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic image-with-fallback hook
// ─────────────────────────────────────────────────────────────────────────────
function useImgFallback() {
  const [failed, setFailed] = useState(false);
  const onError = useCallback(() => setFailed(true), []);
  return { failed, onError };
}

// ─────────────────────────────────────────────────────────────────────────────
// CryptoIcon — shows the authentic CoinGecko CDN logo for any crypto symbol
// ─────────────────────────────────────────────────────────────────────────────
interface CryptoIconProps {
  symbol: string;
  size?: number;
  large?: boolean;    // use large (128px source) instead of small (64px)
  className?: string;
  style?: React.CSSProperties;
}

export function CryptoIcon({ symbol, size = 24, large = false, className = "", style }: CryptoIconProps) {
  const { failed, onError } = useImgFallback();
  const asset = CRYPTO_ASSETS[symbol?.toUpperCase()];
  const src = asset
    ? (large ? cryptoLogoLargeUrl(symbol) : cryptoLogoUrl(symbol))
    : "";
  const color = asset?.color ?? "#666";

  if (!src || failed) {
    return <FallbackIcon label={symbol ?? "?"} size={size} color={color} />;
  }

  return (
    <img
      src={src}
      alt={asset?.name ?? symbol}
      aria-label={asset?.name ?? symbol}
      width={size}
      height={size}
      onError={onError}
      className={className}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "contain", flexShrink: 0, background: "rgba(255,255,255,0.05)", ...style }}
      loading="lazy"
      decoding="async"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChainIcon — shows the authentic chain / network logo
// ─────────────────────────────────────────────────────────────────────────────
interface ChainIconProps {
  chainId: string;   // e.g. "ethereum", "bsc", "solana"
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ChainIcon({ chainId, size = 20, className = "", style }: ChainIconProps) {
  const { failed, onError } = useImgFallback();
  const chain = CHAINS[chainId?.toLowerCase()];
  const src = chainLogoUrl(chainId);
  const color = chain?.color ?? "#666";

  if (!src || failed) {
    return <FallbackIcon label={chainId ?? "?"} size={size} color={color} />;
  }

  return (
    <img
      src={src}
      alt={chain?.name ?? chainId}
      aria-label={chain?.name ?? chainId}
      width={size}
      height={size}
      onError={onError}
      className={className}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "contain", flexShrink: 0, background: "rgba(255,255,255,0.05)", ...style }}
      loading="lazy"
      decoding="async"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FlagIcon — shows the authentic national flag (flagcdn.com)
// ─────────────────────────────────────────────────────────────────────────────
interface FlagIconProps {
  iso2: string;       // e.g. "NG", "US", "GB"
  size?: number;      // height in px (width auto)
  className?: string;
  style?: React.CSSProperties;
}

export function FlagIcon({ iso2, size = 20, className = "", style }: FlagIconProps) {
  const { failed, onError } = useImgFallback();
  const country = COUNTRIES_DEDUP.find(c => c.iso2.toUpperCase() === iso2?.toUpperCase());
  const src = flagUrl(iso2);
  const label = country ? `${country.name} flag` : `${iso2} flag`;

  if (!iso2 || failed) {
    return (
      <span
        aria-label={label}
        style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
          width: Math.round(size * 1.4), height: size, background: "#333",
          borderRadius: 2, fontSize: size * 0.55, lineHeight: 1, flexShrink: 0, ...style }}
        className={className}
      >🏳</span>
    );
  }

  return (
    <img
      src={src}
      srcSet={`${flagUrl(iso2)} 1x, https://flagcdn.com/w80/${iso2.toLowerCase()}.png 2x`}
      alt={label}
      aria-label={label}
      height={size}
      onError={onError}
      className={className}
      style={{ height: size, width: "auto", borderRadius: 2, objectFit: "cover", flexShrink: 0, ...style }}
      loading="lazy"
      decoding="async"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProviderIcon — shows the authentic bank/payment provider logo (Clearbit API)
// ─────────────────────────────────────────────────────────────────────────────
interface ProviderIconProps {
  provider: PaymentProvider;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ProviderIcon({ provider, size = 32, className = "", style }: ProviderIconProps) {
  const { failed, onError } = useImgFallback();
  const src = provider.logoUrl;

  if (failed || !src) {
    return (
      <FallbackIcon
        label={provider.name}
        size={size}
        color={provider.color}
      />
    );
  }

  return (
    <img
      src={src}
      alt={provider.name}
      aria-label={`${provider.name} logo`}
      width={size}
      height={size}
      onError={onError}
      className={className}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.2), objectFit: "contain", flexShrink: 0, background: "#fff", padding: 2, ...style }}
      loading="lazy"
      decoding="async"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProviderIconById — looks up a provider by id from PAYMENT_PROVIDERS
// ─────────────────────────────────────────────────────────────────────────────
import { PAYMENT_PROVIDERS } from "@/lib/assetRegistry";

interface ProviderIconByIdProps {
  id: string;     // e.g. "gtbank", "opay", "mpesa"
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function ProviderIconById({ id, size = 32, className = "", style }: ProviderIconByIdProps) {
  const provider = PAYMENT_PROVIDERS.find(p => p.id === id.toLowerCase());
  if (!provider) {
    return <FallbackIcon label={id} size={size} color="#666" />;
  }
  return <ProviderIcon provider={provider} size={size} className={className} style={style} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// CryptoIconWithLabel — icon + symbol + optional full name
// ─────────────────────────────────────────────────────────────────────────────
interface CryptoIconWithLabelProps {
  symbol: string;
  showName?: boolean;
  iconSize?: number;
  className?: string;
}

export function CryptoIconWithLabel({
  symbol, showName = false, iconSize = 24, className = "",
}: CryptoIconWithLabelProps) {
  const asset = CRYPTO_ASSETS[symbol?.toUpperCase()];
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <CryptoIcon symbol={symbol} size={iconSize} />
      <span className="font-semibold text-sm">{symbol?.toUpperCase()}</span>
      {showName && asset && (
        <span className="text-xs" style={{ color: "var(--subtle)" }}>{asset.name}</span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CurrencyRow — flag + currency code + currency name (for selectors)
// ─────────────────────────────────────────────────────────────────────────────
interface CurrencyRowProps {
  iso2: string;
  currency: string;
  currencyName?: string;
  flagSize?: number;
  className?: string;
}

export function CurrencyRow({ iso2, currency, currencyName, flagSize = 18, className = "" }: CurrencyRowProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <FlagIcon iso2={iso2} size={flagSize} />
      <span className="font-semibold text-sm">{currency}</span>
      {currencyName && (
        <span className="text-xs truncate" style={{ color: "var(--subtle)" }}>{currencyName}</span>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NetworkBadge — small chain logo overlaid bottom-right on a crypto icon
// ─────────────────────────────────────────────────────────────────────────────
interface NetworkBadgeProps {
  symbol: string;
  chainId: string;
  size?: number;
}

export function NetworkBadge({ symbol, chainId, size = 32 }: NetworkBadgeProps) {
  const badgeSize = Math.round(size * 0.38);
  return (
    <span style={{ position: "relative", display: "inline-flex", width: size, height: size, flexShrink: 0 }}>
      <CryptoIcon symbol={symbol} size={size} />
      <span style={{
        position: "absolute", bottom: -1, right: -1,
        background: "var(--surface-muted)", borderRadius: "50%", padding: 1,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <ChainIcon chainId={chainId} size={badgeSize} />
      </span>
    </span>
  );
}
