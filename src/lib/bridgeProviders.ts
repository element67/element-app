/**
 * Bridge Provider Adapter Architecture
 * 
 * Each provider implements the BridgeAdapter interface.
 * The AutoRouter picks the best available route across all adapters.
 * New providers can be added by implementing BridgeAdapter and registering
 * them in BRIDGE_ADAPTERS without touching any UI code.
 */

// ─── Core types ───────────────────────────────────────────────────────────────

export type BridgeProviderId = "relay" | "cctp" | "across" | "lifi" | "debridge" | "stargate";

export interface BridgeToken {
  address: string;       // contract address or NATIVE_ADDRESS
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
  verified?: boolean;
}

export interface BridgeChain {
  id: number;
  name: string;
  displayName: string;
  logoURI?: string;
  brandColor?: string;
  explorerUrl?: string;
  nativeSymbol: string;
}

export interface BridgeRoute {
  providerId: BridgeProviderId;
  providerName: string;
  providerLogo?: string;
  fromChain: BridgeChain;
  toChain: BridgeChain;
  fromToken: BridgeToken;
  toToken: BridgeToken;
  fromAmount: string;     // in token units (human-readable)
  toAmount: string;       // estimated received
  toAmountMin: string;    // minimum received (slippage applied)
  gasFeeUsd: number;
  protocolFeeUsd: number;
  totalFeeUsd: number;
  estimatedTimeSeconds: number;
  exchangeRate: string;   // "1 ETH = 2400 USDC"
  slippagePct: number;
  tags: RouteTag[];
  // Auto-router scoring (higher = better)
  score: number;
  // Provider-specific opaque execution payload
  executionPayload: unknown;
}

export type RouteTag =
  | "fastest"
  | "cheapest"
  | "best_rate"
  | "cctp_native"
  | "solver_network"
  | "canonical"
  | "recommended";

export interface BridgeTx {
  id: string;
  providerId: BridgeProviderId;
  fromChain: BridgeChain;
  toChain: BridgeChain;
  fromToken: BridgeToken;
  toToken: BridgeToken;
  fromAmount: string;
  toAmount: string;
  status: "pending" | "success" | "failure" | "refund" | "delayed";
  sourceTxHash?: string;
  destTxHash?: string;
  requestId?: string;
  createdAt: number;
  updatedAt: number;
  explorerUrl?: string;
  gasFeeUsd?: number;
  protocolFeeUsd?: number;
}

export interface RouteRequest {
  fromChainId: number;
  toChainId: number;
  fromToken: BridgeToken;
  toToken: BridgeToken;
  fromAmount: string;   // human-readable
  fromAmountRaw: string; // in wei / smallest unit
  userAddress: string;
  recipient?: string;
  slippagePct?: number;
}

// ─── Auto-router scoring ──────────────────────────────────────────────────────

/**
 * Score a route for automatic selection.
 * Higher score = better.
 * Weights: cost 40%, speed 30%, security 20%, liquidity 10%.
 */
export function scoreRoute(route: BridgeRoute): number {
  let score = 100;

  // Cost penalty: $1 fee = -5 points (capped at -40)
  score -= Math.min(40, route.totalFeeUsd * 5);

  // Speed bonus: <30s = +20, <2m = +10, <5m = +5, <15m = 0, >15m = -10
  const t = route.estimatedTimeSeconds;
  if (t < 30) score += 20;
  else if (t < 120) score += 10;
  else if (t < 300) score += 5;
  else if (t > 900) score -= 10;

  // Security tags
  if (route.tags.includes("cctp_native")) score += 15;  // canonical burn/mint
  if (route.tags.includes("canonical")) score += 10;
  if (route.tags.includes("solver_network")) score += 5; // fast solver

  return Math.max(0, score);
}

/**
 * Tag a route with descriptive labels based on its attributes.
 */
export function tagRoute(route: Omit<BridgeRoute, "tags" | "score">, allRoutes: Array<Omit<BridgeRoute, "tags" | "score">>): RouteTag[] {
  const tags: RouteTag[] = [];
  if (route.providerId === "cctp") tags.push("cctp_native");
  const cheapest = allRoutes.reduce((m, r) => r.totalFeeUsd < m.totalFeeUsd ? r : m, allRoutes[0]);
  const fastest = allRoutes.reduce((m, r) => r.estimatedTimeSeconds < m.estimatedTimeSeconds ? r : m, allRoutes[0]);
  if (route === cheapest) tags.push("cheapest");
  if (route === fastest) tags.push("fastest");
  return tags;
}

// ─── CCTP supported chains ────────────────────────────────────────────────────

/** CCTP v1/v2 chain IDs supported by Circle (mainnet) */
export const CCTP_CHAINS: Record<number, { name: string; domain: number; explorerUrl: string; usdcAddress: string; nativeSymbol: string }> = {
  1:     { name: "Ethereum",  domain: 0, explorerUrl: "https://etherscan.io",         usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", nativeSymbol: "ETH"  },
  43114: { name: "Avalanche", domain: 1, explorerUrl: "https://snowtrace.io",         usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", nativeSymbol: "AVAX" },
  10:    { name: "Optimism",  domain: 2, explorerUrl: "https://optimistic.etherscan.io", usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", nativeSymbol: "ETH"  },
  42161: { name: "Arbitrum",  domain: 3, explorerUrl: "https://arbiscan.io",          usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", nativeSymbol: "ETH"  },
  8453:  { name: "Base",      domain: 6, explorerUrl: "https://basescan.org",         usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", nativeSymbol: "ETH"  },
  137:   { name: "Polygon",   domain: 7, explorerUrl: "https://polygonscan.com",      usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", nativeSymbol: "MATIC" },
};

export function isCctpSupported(fromChainId: number, toChainId: number, tokenSymbol: string): boolean {
  return (
    tokenSymbol.toUpperCase() === "USDC" &&
    fromChainId in CCTP_CHAINS &&
    toChainId in CCTP_CHAINS &&
    fromChainId !== toChainId
  );
}

// ─── Provider metadata registry ───────────────────────────────────────────────

export interface ProviderMeta {
  id: BridgeProviderId;
  name: string;
  tagline: string;
  logoUrl?: string;
  color: string;
  websiteUrl: string;
  status: "live" | "coming_soon" | "disabled";
  supportedFeatures: string[];
  trustModel: string;
  docsUrl: string;
}

export const PROVIDER_REGISTRY: ProviderMeta[] = [
  {
    id: "relay",
    name: "Relay",
    tagline: "Fast solver-based cross-chain bridging and swapping",
    color: "#3b82f6",
    websiteUrl: "https://relay.link",
    docsUrl: "https://docs.relay.link",
    status: "live",
    supportedFeatures: ["bridge", "cross_chain_swap", "fast_settlement"],
    trustModel: "Optimistic solver network with fallback refund",
  },
  {
    id: "cctp",
    name: "Circle CCTP",
    tagline: "Native USDC burn-and-mint via Circle's Cross-Chain Transfer Protocol",
    color: "#2775ca",
    websiteUrl: "https://www.circle.com/en/cross-chain-transfer-protocol",
    docsUrl: "https://developers.circle.com/stablecoins/cctp-getting-started",
    status: "live",
    supportedFeatures: ["usdc_bridge", "canonical_settlement"],
    trustModel: "Circle attestation service + on-chain verification (canonical)",
  },
  {
    id: "across",
    name: "Across",
    tagline: "UMA-powered optimistic bridging with relayer network",
    color: "#6df5b4",
    websiteUrl: "https://across.to",
    docsUrl: "https://docs.across.to",
    status: "coming_soon",
    supportedFeatures: ["bridge", "fast_relayer"],
    trustModel: "UMA optimistic oracle + relayer bonds",
  },
  {
    id: "lifi",
    name: "LI.FI",
    tagline: "Aggregated bridge + DEX with the widest route coverage",
    color: "#f59e0b",
    websiteUrl: "https://li.fi",
    docsUrl: "https://docs.li.fi",
    status: "coming_soon",
    supportedFeatures: ["bridge", "swap", "aggregation"],
    trustModel: "Aggregated third-party bridges (trust model varies per route)",
  },
  {
    id: "stargate",
    name: "Stargate",
    tagline: "LayerZero-based unified liquidity bridging",
    color: "#8b5cf6",
    websiteUrl: "https://stargate.finance",
    docsUrl: "https://stargateprotocol.gitbook.io/stargate",
    status: "coming_soon",
    supportedFeatures: ["bridge", "unified_liquidity"],
    trustModel: "LayerZero message passing + pooled liquidity",
  },
  {
    id: "debridge",
    name: "deBridge",
    tagline: "Cross-chain interoperability and value transfer protocol",
    color: "#10b981",
    websiteUrl: "https://debridge.finance",
    docsUrl: "https://docs.debridge.finance",
    status: "coming_soon",
    supportedFeatures: ["bridge", "cross_chain_swap"],
    trustModel: "Decentralized validators + slashing mechanism",
  },
];

export function getProvider(id: BridgeProviderId): ProviderMeta {
  return PROVIDER_REGISTRY.find(p => p.id === id) ?? PROVIDER_REGISTRY[0];
}

// ─── Bridge transaction history store ────────────────────────────────────────

const TX_STORAGE_KEY = "financex_bridge_history";
const MAX_HISTORY = 50;

export function saveBridgeTx(tx: BridgeTx): void {
  try {
    const history = loadBridgeHistory();
    const next = [tx, ...history.filter(t => t.id !== tx.id)].slice(0, MAX_HISTORY);
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(next));
  } catch { /* storage quota exceeded — ignore */ }
}

export function updateBridgeTx(id: string, updates: Partial<BridgeTx>): void {
  try {
    const history = loadBridgeHistory();
    const next = history.map(t => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t);
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function loadBridgeHistory(): BridgeTx[] {
  try {
    const raw = localStorage.getItem(TX_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BridgeTx[];
  } catch {
    return [];
  }
}

export function clearBridgeHistory(): void {
  localStorage.removeItem(TX_STORAGE_KEY);
}
