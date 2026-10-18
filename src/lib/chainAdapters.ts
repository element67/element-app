/**
 * Chain Adapter Registry
 *
 * Auto-derives send/receive/validate/fee capabilities from the app's existing
 * walletStore asset list + onchain-facts. No manual chain list — adding a new
 * asset to walletStore SEED or the priceStore automatically picks it up here.
 *
 * Network families:
 *   evm      — Ethereum, Arbitrum, Optimism, Base, Polygon, BNB, Arc, etc.
 *   bitcoin  — Bitcoin mainnet / testnet
 *   solana   — Solana (base58 pubkey)
 *   cosmos   — Cosmos SDK chains (bech32 prefix)
 *   tron     — TRON (T…)
 *   ton      — The Open Network (EQ…)
 *   xrp      — XRP Ledger (r…)
 *   aptos    — Aptos (0x…, 64-char hex)
 *   sui      — Sui (0x…, 64-char hex)
 *   near     — NEAR (implicit / named accounts)
 *   default  — any unknown chain — permissive validation, copy address
 */

export type NetworkFamily =
  | "evm" | "bitcoin" | "solana" | "cosmos" | "tron" | "ton"
  | "xrp" | "aptos" | "sui" | "near" | "default";

export interface ChainAdapter {
  /** Canonical name shown in UI */
  name: string;
  /** Network family used for address validation */
  family: NetworkFamily;
  /** Ticker of the native gas token */
  nativeTicker: string;
  /** Typical network fee in USD (rough estimate for display only) */
  typicalFeeUsd: number;
  /** Block explorer base URL for tx hashes */
  explorerBase: string;
  /** Template for address explorer links ({addr} is replaced) */
  addressExplorer: string;
  /** Placeholder shown in the address input */
  addressPlaceholder: string;
  /** Human-readable address format hint */
  addressHint: string;
  /** Address prefix(es) used for quick validation */
  prefixes: string[];
  /** Expected address length (exact or [min,max]) */
  addrLen: number | [number, number];
  /** True if tokens on this chain share the same wallet address as native */
  tokensShareAddress: boolean;
}

// ── Adapter definitions ───────────────────────────────────────────────────────

const ADAPTERS: Record<string, ChainAdapter> = {
  // ── EVM chains ──────────────────────────────────────────────────────────────
  Ethereum: {
    name: "Ethereum", family: "evm", nativeTicker: "ETH",
    typicalFeeUsd: 2.5, explorerBase: "https://etherscan.io",
    addressExplorer: "https://etherscan.io/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },
  Arc: {
    name: "Arc Testnet", family: "evm", nativeTicker: "USDC",
    typicalFeeUsd: 0.001, explorerBase: "https://explorer.testnet.arc.io",
    addressExplorer: "https://explorer.testnet.arc.io/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },
  Arbitrum: {
    name: "Arbitrum One", family: "evm", nativeTicker: "ETH",
    typicalFeeUsd: 0.08, explorerBase: "https://arbiscan.io",
    addressExplorer: "https://arbiscan.io/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },
  Optimism: {
    name: "Optimism", family: "evm", nativeTicker: "ETH",
    typicalFeeUsd: 0.05, explorerBase: "https://optimistic.etherscan.io",
    addressExplorer: "https://optimistic.etherscan.io/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },
  Base: {
    name: "Base", family: "evm", nativeTicker: "ETH",
    typicalFeeUsd: 0.04, explorerBase: "https://basescan.org",
    addressExplorer: "https://basescan.org/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },
  Polygon: {
    name: "Polygon", family: "evm", nativeTicker: "POL",
    typicalFeeUsd: 0.02, explorerBase: "https://polygonscan.com",
    addressExplorer: "https://polygonscan.com/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },
  BNB: {
    name: "BNB Smart Chain", family: "evm", nativeTicker: "BNB",
    typicalFeeUsd: 0.15, explorerBase: "https://bscscan.com",
    addressExplorer: "https://bscscan.com/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },
  Avalanche: {
    name: "Avalanche C-Chain", family: "evm", nativeTicker: "AVAX",
    typicalFeeUsd: 0.2, explorerBase: "https://snowtrace.io",
    addressExplorer: "https://snowtrace.io/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },
  Fantom: {
    name: "Fantom", family: "evm", nativeTicker: "FTM",
    typicalFeeUsd: 0.01, explorerBase: "https://ftmscan.com",
    addressExplorer: "https://ftmscan.com/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },
  Cronos: {
    name: "Cronos", family: "evm", nativeTicker: "CRO",
    typicalFeeUsd: 0.01, explorerBase: "https://cronoscan.com",
    addressExplorer: "https://cronoscan.com/address/{addr}",
    addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
    prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
  },

  // ── Bitcoin ──────────────────────────────────────────────────────────────────
  Bitcoin: {
    name: "Bitcoin", family: "bitcoin", nativeTicker: "BTC",
    typicalFeeUsd: 3.0, explorerBase: "https://mempool.space",
    addressExplorer: "https://mempool.space/address/{addr}",
    addressPlaceholder: "bc1q… or 1… or 3…",
    addressHint: "Native SegWit (bc1q…), P2PKH (1…), or P2SH (3…)",
    prefixes: ["bc1", "1", "3", "tb1"],
    addrLen: [25, 62], tokensShareAddress: false,
  },

  // ── Solana ───────────────────────────────────────────────────────────────────
  Solana: {
    name: "Solana", family: "solana", nativeTicker: "SOL",
    typicalFeeUsd: 0.0005, explorerBase: "https://solscan.io",
    addressExplorer: "https://solscan.io/account/{addr}",
    addressPlaceholder: "Base58 public key…",
    addressHint: "44-character Base58 Solana address",
    prefixes: [], addrLen: [32, 44], tokensShareAddress: true,
  },

  // ── TRON ──────────────────────────────────────────────────────────────────────
  TRON: {
    name: "TRON", family: "tron", nativeTicker: "TRX",
    typicalFeeUsd: 0.3, explorerBase: "https://tronscan.org",
    addressExplorer: "https://tronscan.org/#/address/{addr}",
    addressPlaceholder: "T…",
    addressHint: "34-character address starting with T",
    prefixes: ["T"], addrLen: 34, tokensShareAddress: true,
  },
  // TRX alias
  TRX: {
    name: "TRON", family: "tron", nativeTicker: "TRX",
    typicalFeeUsd: 0.3, explorerBase: "https://tronscan.org",
    addressExplorer: "https://tronscan.org/#/address/{addr}",
    addressPlaceholder: "T…",
    addressHint: "34-character address starting with T",
    prefixes: ["T"], addrLen: 34, tokensShareAddress: true,
  },

  // ── TON ───────────────────────────────────────────────────────────────────────
  TON: {
    name: "TON", family: "ton", nativeTicker: "TON",
    typicalFeeUsd: 0.05, explorerBase: "https://tonscan.org",
    addressExplorer: "https://tonscan.org/address/{addr}",
    addressPlaceholder: "EQ… or UQ…",
    addressHint: "48-character TON address starting with EQ or UQ",
    prefixes: ["EQ", "UQ", "kQ", "0:"],
    addrLen: [48, 67], tokensShareAddress: true,
  },

  // ── XRP ───────────────────────────────────────────────────────────────────────
  XRP: {
    name: "XRP Ledger", family: "xrp", nativeTicker: "XRP",
    typicalFeeUsd: 0.001, explorerBase: "https://xrpscan.com",
    addressExplorer: "https://xrpscan.com/account/{addr}",
    addressPlaceholder: "r…",
    addressHint: "25–34 character address starting with r",
    prefixes: ["r"], addrLen: [25, 34], tokensShareAddress: true,
  },

  // ── Cosmos ecosystem ─────────────────────────────────────────────────────────
  Cosmos: {
    name: "Cosmos Hub", family: "cosmos", nativeTicker: "ATOM",
    typicalFeeUsd: 0.05, explorerBase: "https://mintscan.io/cosmos",
    addressExplorer: "https://mintscan.io/cosmos/address/{addr}",
    addressPlaceholder: "cosmos1…",
    addressHint: "Bech32 address starting with cosmos1",
    prefixes: ["cosmos1"], addrLen: [45, 45], tokensShareAddress: true,
  },
  ATOM: {
    name: "Cosmos Hub", family: "cosmos", nativeTicker: "ATOM",
    typicalFeeUsd: 0.05, explorerBase: "https://mintscan.io/cosmos",
    addressExplorer: "https://mintscan.io/cosmos/address/{addr}",
    addressPlaceholder: "cosmos1…",
    addressHint: "Bech32 address starting with cosmos1",
    prefixes: ["cosmos1"], addrLen: [45, 45], tokensShareAddress: true,
  },

  // ── NEAR ──────────────────────────────────────────────────────────────────────
  NEAR: {
    name: "NEAR Protocol", family: "near", nativeTicker: "NEAR",
    typicalFeeUsd: 0.001, explorerBase: "https://nearblocks.io",
    addressExplorer: "https://nearblocks.io/address/{addr}",
    addressPlaceholder: "account.near or 64-char hex",
    addressHint: "Named account (e.g. alice.near) or 64-char implicit account",
    prefixes: [], addrLen: [2, 64], tokensShareAddress: true,
  },

  // ── Aptos ─────────────────────────────────────────────────────────────────────
  Aptos: {
    name: "Aptos", family: "aptos", nativeTicker: "APT",
    typicalFeeUsd: 0.001, explorerBase: "https://explorer.aptoslabs.com",
    addressExplorer: "https://explorer.aptoslabs.com/account/{addr}",
    addressPlaceholder: "0x… (64-char hex)",
    addressHint: "66-character hex address starting with 0x",
    prefixes: ["0x"], addrLen: [66, 66], tokensShareAddress: true,
  },
  APT: {
    name: "Aptos", family: "aptos", nativeTicker: "APT",
    typicalFeeUsd: 0.001, explorerBase: "https://explorer.aptoslabs.com",
    addressExplorer: "https://explorer.aptoslabs.com/account/{addr}",
    addressPlaceholder: "0x… (64-char hex)",
    addressHint: "66-character hex address starting with 0x",
    prefixes: ["0x"], addrLen: [66, 66], tokensShareAddress: true,
  },

  // ── Sui ───────────────────────────────────────────────────────────────────────
  Sui: {
    name: "Sui", family: "sui", nativeTicker: "SUI",
    typicalFeeUsd: 0.001, explorerBase: "https://suiexplorer.com",
    addressExplorer: "https://suiexplorer.com/address/{addr}",
    addressPlaceholder: "0x… (64-char hex)",
    addressHint: "66-character hex address starting with 0x",
    prefixes: ["0x"], addrLen: [66, 66], tokensShareAddress: true,
  },
  SUI: {
    name: "Sui", family: "sui", nativeTicker: "SUI",
    typicalFeeUsd: 0.001, explorerBase: "https://suiexplorer.com",
    addressExplorer: "https://suiexplorer.com/address/{addr}",
    addressPlaceholder: "0x… (64-char hex)",
    addressHint: "66-character hex address starting with 0x",
    prefixes: ["0x"], addrLen: [66, 66], tokensShareAddress: true,
  },

  // ── Dogecoin ──────────────────────────────────────────────────────────────────
  DOGE: {
    name: "Dogecoin", family: "bitcoin", nativeTicker: "DOGE",
    typicalFeeUsd: 0.5, explorerBase: "https://dogechain.info",
    addressExplorer: "https://dogechain.info/address/{addr}",
    addressPlaceholder: "D…",
    addressHint: "34-character address starting with D",
    prefixes: ["D"], addrLen: 34, tokensShareAddress: false,
  },

  // ── Litecoin ──────────────────────────────────────────────────────────────────
  LTC: {
    name: "Litecoin", family: "bitcoin", nativeTicker: "LTC",
    typicalFeeUsd: 0.1, explorerBase: "https://blockchair.com/litecoin",
    addressExplorer: "https://blockchair.com/litecoin/address/{addr}",
    addressPlaceholder: "ltc1… or L… or M…",
    addressHint: "Bech32 (ltc1…) or Legacy (L…) address",
    prefixes: ["ltc1", "L", "M"], addrLen: [25, 62], tokensShareAddress: false,
  },
};

// Default EVM adapter for any unknown network that uses 0x addresses
const EVM_DEFAULT: ChainAdapter = {
  name: "EVM Chain", family: "evm", nativeTicker: "ETH",
  typicalFeeUsd: 1.0, explorerBase: "https://etherscan.io",
  addressExplorer: "https://etherscan.io/address/{addr}",
  addressPlaceholder: "0x…", addressHint: "42-char hex address starting with 0x",
  prefixes: ["0x"], addrLen: 42, tokensShareAddress: true,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the chain adapter for a wallet asset's network.
 * Falls back to the asset's symbol, then to EVM default.
 */
export function getAdapter(network: string | undefined, symbol?: string): ChainAdapter {
  if (network && ADAPTERS[network]) return ADAPTERS[network];
  if (symbol  && ADAPTERS[symbol])  return ADAPTERS[symbol];
  // Detect EVM by address shape
  if (network?.toLowerCase().includes("evm")) return EVM_DEFAULT;
  return { ...EVM_DEFAULT, name: network ?? "Unknown Network" };
}

/**
 * Validate a recipient address for a given adapter.
 * Returns { valid: boolean; error?: string }
 */
export function validateAddress(
  addr: string,
  adapter: ChainAdapter
): { valid: boolean; error?: string } {
  const trimmed = addr.trim();
  if (!trimmed) return { valid: false, error: "Enter a recipient address" };

  const len = trimmed.length;
  const [minLen, maxLen] = Array.isArray(adapter.addrLen)
    ? adapter.addrLen
    : [adapter.addrLen, adapter.addrLen];

  // Prefix check (only when prefixes are specified)
  if (adapter.prefixes.length > 0) {
    const hasPrefix = adapter.prefixes.some(p =>
      trimmed.toLowerCase().startsWith(p.toLowerCase())
    );
    if (!hasPrefix) {
      return { valid: false, error: `Address must start with ${adapter.prefixes.join(" or ")}` };
    }
  }

  // Length check
  if (len < minLen || len > maxLen) {
    const lenDesc = minLen === maxLen ? `${minLen} characters` : `${minLen}–${maxLen} characters`;
    return { valid: false, error: `Address should be ${lenDesc} (got ${len})` };
  }

  // EVM checksum sanity (hex chars only)
  if (adapter.family === "evm") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      return { valid: false, error: "Invalid EVM address — must be 0x followed by 40 hex characters" };
    }
  }

  // Solana: base58 character set check
  if (adapter.family === "solana") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) {
      return { valid: false, error: "Invalid Solana address — must be Base58 encoded" };
    }
  }

  return { valid: true };
}

/**
 * Build a tx explorer URL. Pass a tx hash or an address.
 */
export function buildExplorerUrl(adapter: ChainAdapter, hash: string): string {
  return `${adapter.explorerBase}/tx/${hash}`;
}

export function buildAddressUrl(adapter: ChainAdapter, addr: string): string {
  return adapter.addressExplorer.replace("{addr}", addr);
}

/**
 * QR code URI for a receive address.
 * Returns a URI scheme string suitable for QR encoding, e.g.:
 *   ethereum:0x123…  |  bitcoin:bc1q…  |  solana:7xKX…
 */
export function receiveUri(adapter: ChainAdapter, address: string, symbol?: string, amount?: number): string {
  switch (adapter.family) {
    case "evm":     return `ethereum:${address}${amount ? `?value=${amount}` : ""}`;
    case "bitcoin": return `${adapter.nativeTicker.toLowerCase()}:${address}${amount ? `?amount=${amount}` : ""}`;
    case "solana":  return `solana:${address}${amount ? `?amount=${amount}` : ""}`;
    case "tron":    return `tron:${address}`;
    case "ton":     return `ton://transfer/${address}`;
    case "xrp":     return `xrpl:${address}`;
    default:        return address;
  }
}

/**
 * Estimate network fee in USD for a given adapter.
 * In production this would call the chain's fee oracle.
 * Here we return the adapter's preset estimate with a live gas-price multiplier.
 */
export function estimateFeeUsd(adapter: ChainAdapter, _livePrices: Record<string, number>): {
  feeUsd: number;
  feeNative: number;
  nativeTicker: string;
  label: string;
} {
  const price = _livePrices[adapter.nativeTicker] ?? 1;
  const feeUsd = adapter.typicalFeeUsd;
  const feeNative = price > 0 ? feeUsd / price : 0;
  return {
    feeUsd,
    feeNative,
    nativeTicker: adapter.nativeTicker,
    label: `~$${feeUsd.toFixed(feeUsd < 0.01 ? 4 : 2)} (${feeNative.toPrecision(3)} ${adapter.nativeTicker})`,
  };
}

/**
 * Returns every unique network present in the wallet asset list,
 * with its adapter.
 */
export function getSupportedNetworks(assets: Array<{ network?: string; symbol: string }>): Array<{
  network: string;
  adapter: ChainAdapter;
}> {
  const seen = new Set<string>();
  const result: Array<{ network: string; adapter: ChainAdapter }> = [];
  for (const a of assets) {
    const key = a.network ?? a.symbol;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ network: key, adapter: getAdapter(a.network, a.symbol) });
    }
  }
  return result;
}

export { ADAPTERS };
