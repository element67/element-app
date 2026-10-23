/**
 * Element Settlement — Top Offer Merchant Escrow Engine
 *
 * Completely separate from:
 *   - Quick Swap's liquidity-vault settlement (server/settlement.ts)
 *   - server/swapEngine.ts (Quick Swap engine)
 *
 * Responsibilities:
 *   1. Merchant registration + on-chain deposit verification
 *   2. Atomic escrow reservation when a trade is accepted
 *   3. Crypto→fiat payout dispatch via Flutterwave/Paystack
 *   4. Full audit log (append-only)
 *   5. AI risk scoring (signal only — no autonomous financial decisions)
 *
 * Real-money trading is GATED behind escrowConfig().tradingEnabled, which is false
 * until FLUTTERWAVE_SECRET_KEY or PAYSTACK_SECRET_KEY and VAULT_BANK_ACCOUNT are set.
 */

import { createPublicClient, http, parseAbiItem, type Hash } from "viem";
import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";
import { existsSync, readFileSync, writeFileSync } from "fs";

// ─── RPC helper (same pattern as swapEngine.ts) ────────────────────────────
function rpcUrl(compassChain: string, fallback: string): string {
  const base_ = process.env.RPC_PROXY_BASE_URL;
  const token = process.env.RPC_PROXY_TOKEN;
  const covered = (process.env.RPC_PROXY_CHAINS ?? "").split(",").map(s => s.trim());
  if (base_ && token && covered.includes(compassChain)) {
    return `${base_}/api/rpc/${compassChain}?_rpc_token=${token}`;
  }
  return fallback;
}

// Arc Testnet chain definition (not in viem/chains)
// arc-studio-allow-onchain-literal
const ARC_TESTNET_CHAIN = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" } },
} as const;

const EVM_NETWORKS: Record<string, { chain: unknown; compassKey: string; publicRpc: string }> = {
  "Ethereum":    { chain: mainnet,  compassKey: "Ethereum",   publicRpc: mainnet.rpcUrls.default.http[0] },
  "Base":        { chain: base,     compassKey: "Base",        publicRpc: base.rpcUrls.default.http[0] },
  "Arbitrum One":{ chain: arbitrum, compassKey: "Arbitrum",    publicRpc: arbitrum.rpcUrls.default.http[0] },
  "OP Mainnet":  { chain: optimism, compassKey: "OP_Mainnet",  publicRpc: optimism.rpcUrls.default.http[0] },
  "Polygon PoS": { chain: polygon,  compassKey: "Polygon",     publicRpc: polygon.rpcUrls.default.http[0] },
  "Arc Testnet": { chain: ARC_TESTNET_CHAIN, compassKey: "Arc_Testnet", publicRpc: "https://rpc.testnet.arc.io" },
};

// USDC contract addresses per network — sourced from Circle's onchain-facts registry
// arc-studio-allow-onchain-literal
const USDC_BY_NETWORK: Record<string, `0x${string}`> = {
  "Ethereum":    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "Base":        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "Arbitrum One":"0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "OP Mainnet":  "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  "Polygon PoS": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  "Arc Testnet": "0x3600000000000000000000000000000000000000",
};
// USDT contract addresses per network — sourced from Tether's published deployments
// arc-studio-allow-onchain-literal
const USDT_BY_NETWORK: Record<string, `0x${string}`> = {
  "Ethereum":    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "Arbitrum One":"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  "Polygon PoS": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
};

function tokenContract(asset: string, network: string): `0x${string}` | null {
  if (asset === "USDC") return USDC_BY_NETWORK[network] ?? null;
  if (asset === "USDT") return USDT_BY_NETWORK[network] ?? null;
  return null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type EscrowStatus =
  | "pending_deposit"
  | "verifying"
  | "active"
  | "suspended"
  | "withdrawn";

export type TradeStatus =
  | "offer_accepted"
  | "funds_reserved"
  | "verifying_payment"
  | "processing"
  | "completed"
  | "under_review"
  | "failed"
  | "cancelled"
  | "refunded";

export interface MerchantEscrowAccount {
  merchantId: string;
  merchantName: string;
  asset: string;
  network: string;
  depositAddress: string;
  depositTxHash?: string;
  depositedAmt: number;
  reservedAmt: number;
  status: EscrowStatus;
  kycLevel: 0 | 1 | 2 | 3;
  verifiedAt?: number;
  lastUpdated: number;
  audit: AuditEntry[];
  fiatCurrency: string;
  ratePerUnit: number;
  minFiat: number;
  maxFiat: number;
  feePct: number;
  payMethods: string[];
  riskScore: number;
  riskFlags: string[];
}

export interface MerchantTrade {
  id: string;
  merchantId: string;
  takerId: string;
  asset: string;
  cryptoAmt: number;
  fiatCurrency: string;
  fiatGross: number;
  fiatFee: number;
  fiatNet: number;
  rateUsed: number;
  rateLockExpiresAt: number;
  payMethod: string;
  recipientName?: string;
  status: TradeStatus;
  payoutRef?: string;
  payoutConfirmedAt?: number;
  failReason?: string;
  idempotencyKey: string;
  createdAt: number;
  updatedAt: number;
  audit: AuditEntry[];
}

export interface AuditEntry {
  ts: number;
  event: string;
  actor: "system" | "merchant" | "user" | "admin" | "ai";
  detail?: string;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

let ESCROW_ACCOUNTS = new Map<string, MerchantEscrowAccount>();
let MERCHANT_TRADES = new Map<string, MerchantTrade>();
// Recipient account numbers kept off the main trade object — never in AI logs
const RECIPIENT_STORE = new Map<string, string>();
let _loaded = false;

const ESCROW_FILE = "/tmp/element-merchant-escrow.json";
const TRADES_FILE = "/tmp/element-merchant-trades.json";

function persist() {
  try {
    writeFileSync(ESCROW_FILE, JSON.stringify(Array.from(ESCROW_ACCOUNTS.entries())));
    writeFileSync(TRADES_FILE, JSON.stringify(Array.from(MERCHANT_TRADES.entries())));
  } catch { /* sandbox may not have write access */ }
}

export function loadEscrowStore() {
  if (_loaded) return;
  _loaded = true;
  try {
    if (existsSync(ESCROW_FILE)) {
      ESCROW_ACCOUNTS = new Map(JSON.parse(readFileSync(ESCROW_FILE, "utf-8")));
    }
    if (existsSync(TRADES_FILE)) {
      MERCHANT_TRADES = new Map(JSON.parse(readFileSync(TRADES_FILE, "utf-8")));
    }
  } catch { /* first run */ }
  _seedDemoMerchants();
}

function _seedDemoMerchants() {
  if (ESCROW_ACCOUNTS.size > 0) return;
  const now = Date.now();
  const demos: MerchantEscrowAccount[] = [
    {
      merchantId: "merchant-elite-001",
      merchantName: "EliteTrader",
      asset: "USDC",
      network: "Arc Testnet",
      depositAddress: process.env.VAULT_EVM_ADDRESS ?? "0x0000000000000000000000000000000000000000",
      depositedAmt: 50000,
      reservedAmt: 0,
      status: "active",
      kycLevel: 3,
      verifiedAt: now - 86400000 * 30,
      lastUpdated: now,
      audit: [{ ts: now, event: "demo_seeded", actor: "system", detail: "Demo merchant — KYC Level 3" }],
      fiatCurrency: "NGN",
      ratePerUnit: 1590,
      minFiat: 10000,
      maxFiat: 5000000,
      feePct: 0.5,
      payMethods: ["bank_transfer", "opay", "palmpay"],
      riskScore: 8,
      riskFlags: [],
    },
    {
      merchantId: "merchant-fast-002",
      merchantName: "FastSwap NG",
      asset: "USDT",
      network: "Ethereum",
      depositAddress: process.env.VAULT_EVM_ADDRESS ?? "0x0000000000000000000000000000000000000000",
      depositedAmt: 30000,
      reservedAmt: 2500,
      status: "active",
      kycLevel: 2,
      verifiedAt: now - 86400000 * 15,
      lastUpdated: now,
      audit: [{ ts: now, event: "demo_seeded", actor: "system", detail: "Demo merchant — KYC Level 2" }],
      fiatCurrency: "NGN",
      ratePerUnit: 1580,
      minFiat: 5000,
      maxFiat: 3000000,
      feePct: 0.8,
      payMethods: ["bank_transfer", "mobile_money"],
      riskScore: 12,
      riskFlags: [],
    },
    {
      merchantId: "merchant-btc-003",
      merchantName: "CryptoNaira",
      asset: "BTC",
      network: "Bitcoin",
      depositAddress: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", // arc-studio-allow-onchain-literal
      depositedAmt: 1.5,
      reservedAmt: 0,
      status: "active",
      kycLevel: 3,
      verifiedAt: now - 86400000 * 60,
      lastUpdated: now,
      audit: [{ ts: now, event: "demo_seeded", actor: "system", detail: "Demo merchant — KYC Level 3" }],
      fiatCurrency: "NGN",
      ratePerUnit: 98000000,
      minFiat: 50000,
      maxFiat: 50000000,
      feePct: 0.3,
      payMethods: ["bank_transfer"],
      riskScore: 5,
      riskFlags: [],
    },
  ];
  for (const m of demos) ESCROW_ACCOUNTS.set(m.merchantId, m);
}

// ─── Config ────────────────────────────────────────────────────────────────────

export function escrowConfig() {
  return {
    tradingEnabled:
      !!process.env.VAULT_BANK_ACCOUNT &&
      (!!process.env.FLUTTERWAVE_SECRET_KEY || !!process.env.PAYSTACK_SECRET_KEY),
    flutterwaveConfigured: !!process.env.FLUTTERWAVE_SECRET_KEY,
    paystackConfigured:    !!process.env.PAYSTACK_SECRET_KEY,
    vaultBankConfigured:   !!process.env.VAULT_BANK_ACCOUNT,
    kycRequired:           true,
    minMerchantKycLevel:   2 as const,
    rateLockSeconds:       180,
    maxTradeFiat:          10_000_000,
    riskThreshold:         70,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function availableBalance(m: MerchantEscrowAccount): number {
  return Math.max(0, m.depositedAmt - m.reservedAmt);
}

export function listActiveMerchants(): MerchantEscrowAccount[] {
  loadEscrowStore();
  return Array.from(ESCROW_ACCOUNTS.values())
    .filter(m => m.status === "active" && availableBalance(m) > 0)
    .sort((a, b) => a.riskScore - b.riskScore || b.depositedAmt - a.depositedAmt);
}

export function getMerchant(id: string) { return ESCROW_ACCOUNTS.get(id); }
export function getTrade(id: string)    { return MERCHANT_TRADES.get(id); }

export function listTradesForTaker(takerId: string): MerchantTrade[] {
  return Array.from(MERCHANT_TRADES.values())
    .filter(t => t.takerId === takerId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Merchant registration ────────────────────────────────────────────────────

export function registerMerchant(params: {
  merchantId: string; merchantName: string; asset: string;
  network: string; depositAddress: string; fiatCurrency: string;
  ratePerUnit: number; minFiat: number; maxFiat: number;
  feePct: number; payMethods: string[];
}): MerchantEscrowAccount {
  loadEscrowStore();
  const existing = ESCROW_ACCOUNTS.get(params.merchantId);
  if (existing) return existing;
  const account: MerchantEscrowAccount = {
    ...params, depositedAmt: 0, reservedAmt: 0, status: "pending_deposit",
    kycLevel: 0, lastUpdated: Date.now(),
    audit: [{ ts: Date.now(), event: "merchant_registered", actor: "merchant" }],
    riskScore: 0, riskFlags: [],
  };
  ESCROW_ACCOUNTS.set(params.merchantId, account);
  persist();
  return account;
}

// ─── On-chain deposit verification ────────────────────────────────────────────

const ERC20_TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

export async function verifyMerchantDeposit(
  merchantId: string,
  txHash: Hash,
): Promise<{ ok: boolean; reason?: string; amount?: number }> {
  loadEscrowStore();
  const m = ESCROW_ACCOUNTS.get(merchantId);
  if (!m) return { ok: false, reason: "Merchant not found" };

  const evmNet = EVM_NETWORKS[m.network];
  if (!evmNet) return { ok: false, reason: `Network ${m.network} not yet supported for EVM verification` };

  const contract = tokenContract(m.asset, m.network);
  if (!contract) return { ok: false, reason: `${m.asset} on ${m.network} has no ERC-20 contract for verification` };

  const url = rpcUrl(evmNet.compassKey, evmNet.publicRpc);
  try {
    const client = createPublicClient({ chain: evmNet.chain as never, transport: http(url) });
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (!receipt || receipt.status !== "success")
      return { ok: false, reason: "Transaction not found or reverted" };

    const toAddr = m.depositAddress.toLowerCase() as `0x${string}`;
    const logs = await client.getLogs({
      address: contract,
      event: ERC20_TRANSFER,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });

    const match = logs.find(l => l.args.to?.toLowerCase() === toAddr);
    if (!match?.args.value) return { ok: false, reason: "No matching Transfer log to deposit address" };

    const decimals = 6; // USDC and USDT both 6 decimals on all supported networks
    const amount = Number(match.args.value) / 10 ** decimals;

    m.depositTxHash = txHash;
    m.depositedAmt += amount;
    m.status = "active";
    m.verifiedAt = Date.now();
    m.lastUpdated = Date.now();
    m.audit.push({ ts: Date.now(), event: "deposit_verified", actor: "system", detail: `+${amount} ${m.asset}` });
    persist();
    return { ok: true, amount };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

// ─── AI risk scoring (signal only — no autonomous decisions) ──────────────────

function _aiRisk(params: {
  merchantId: string; cryptoAmt: number;
  fiatAmt: number; takerId: string;
}): { score: number; flags: string[] } {
  const m = ESCROW_ACCOUNTS.get(params.merchantId);
  if (!m) return { score: 100, flags: ["merchant_not_found"] };
  const flags: string[] = [];
  let score = m.riskScore * 0.3;
  if (params.cryptoAmt > availableBalance(m) * 0.8) { flags.push("near_escrow_limit"); score += 20; }
  if (!m.verifiedAt || Date.now() - m.verifiedAt < 7 * 86400000) { flags.push("new_merchant"); score += 10; }
  if (m.kycLevel < 2) { flags.push("low_kyc"); score += 25; }
  return { score: Math.min(100, Math.round(score)), flags };
}

// ─── Trade acceptance (atomic) ────────────────────────────────────────────────

export function acceptOffer(params: {
  merchantId: string; takerId: string; fiatAmt: number;
  payMethod: string; recipientName?: string; recipientAccount?: string;
}): { ok: boolean; trade?: MerchantTrade; reason?: string } {
  loadEscrowStore();
  const cfg = escrowConfig();
  const m = ESCROW_ACCOUNTS.get(params.merchantId);

  if (!m) return { ok: false, reason: "Merchant not found" };
  if (m.status !== "active") return { ok: false, reason: `Merchant account is ${m.status}` };
  if (m.kycLevel < cfg.minMerchantKycLevel)
    return { ok: false, reason: "Merchant KYC not completed" };

  const fiat = params.fiatAmt;
  if (fiat < m.minFiat || fiat > m.maxFiat)
    return { ok: false, reason: `Amount must be ${m.fiatCurrency} ${m.minFiat.toLocaleString()}–${m.maxFiat.toLocaleString()}` };
  if (fiat > cfg.maxTradeFiat)
    return { ok: false, reason: `Exceeds per-transaction limit` };

  const cryptoAmt = fiat / m.ratePerUnit;
  if (cryptoAmt > availableBalance(m))
    return { ok: false, reason: `Insufficient merchant escrow (available: ${availableBalance(m).toFixed(4)} ${m.asset})` };

  const { score: riskScore, flags: riskFlags } = _aiRisk({
    merchantId: params.merchantId, cryptoAmt, fiatAmt: fiat, takerId: params.takerId,
  });

  const fiatFee = fiat * (m.feePct / 100);
  const now = Date.now();
  const tradeId = `mt-${now}-${Math.random().toString(36).slice(2, 8)}`;

  // Atomic reservation — reserve BEFORE creating the trade record
  m.reservedAmt += cryptoAmt;
  m.lastUpdated = now;

  const status: TradeStatus = riskScore >= cfg.riskThreshold ? "under_review" : "funds_reserved";
  const trade: MerchantTrade = {
    id: tradeId,
    merchantId: params.merchantId,
    takerId: params.takerId,
    asset: m.asset,
    cryptoAmt,
    fiatCurrency: m.fiatCurrency,
    fiatGross: fiat,
    fiatFee,
    fiatNet: fiat - fiatFee,
    rateUsed: m.ratePerUnit,
    rateLockExpiresAt: now + cfg.rateLockSeconds * 1000,
    payMethod: params.payMethod,
    recipientName: params.recipientName,
    status,
    idempotencyKey: `${params.takerId}-${params.merchantId}-${fiat}-${now}`,
    createdAt: now,
    updatedAt: now,
    audit: [
      { ts: now, event: "offer_accepted",  actor: "user",   detail: `${cryptoAmt.toFixed(6)} ${m.asset} reserved` },
      { ts: now, event: "escrow_reserved", actor: "system", detail: `Atomic reservation confirmed` },
      { ts: now, event: "ai_risk_check",   actor: "ai",     detail: `Score ${riskScore}/100. Flags: ${riskFlags.join(", ") || "none"}` },
      ...(status === "under_review"
        ? [{ ts: now, event: "flagged_for_review", actor: "ai" as const, detail: `Risk score ${riskScore} ≥ ${cfg.riskThreshold}` }]
        : []),
    ],
  };

  // Account numbers stored off trade object — never returned in AI logs or API responses
  if (params.recipientAccount) RECIPIENT_STORE.set(tradeId, params.recipientAccount);

  MERCHANT_TRADES.set(tradeId, trade);
  m.audit.push({ ts: now, event: "trade_created", actor: "system", detail: `Trade ${tradeId}` });
  persist();
  return { ok: true, trade };
}

// ─── Payout dispatch ──────────────────────────────────────────────────────────

export async function initiatePayout(
  tradeId: string,
): Promise<{ ok: boolean; ref?: string; reason?: string }> {
  const trade = MERCHANT_TRADES.get(tradeId);
  if (!trade) return { ok: false, reason: "Trade not found" };
  if (!["funds_reserved", "verifying_payment"].includes(trade.status))
    return { ok: false, reason: `Trade is ${trade.status}` };

  const cfg = escrowConfig();
  if (!cfg.tradingEnabled)
    return { ok: false, reason: "Trading not enabled — set FLUTTERWAVE_SECRET_KEY or PAYSTACK_SECRET_KEY and VAULT_BANK_ACCOUNT" };

  const recipientAccount = RECIPIENT_STORE.get(tradeId);
  if (!recipientAccount) return { ok: false, reason: "Recipient account not on record" };

  trade.status = "processing";
  trade.updatedAt = Date.now();
  trade.audit.push({ ts: Date.now(), event: "payout_initiated", actor: "system" });
  persist();

  try {
    if (process.env.FLUTTERWAVE_SECRET_KEY) {
      const res = await fetch("https://api.flutterwave.com/v3/transfers", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          account_bank:   "GTB",
          account_number: recipientAccount,
          amount:         trade.fiatNet,
          currency:       trade.fiatCurrency,
          reference:      trade.idempotencyKey.slice(0, 50),
          narration:      `Element Settlement — Trade ${tradeId}`,
        }),
      });
      const body = await res.json() as { status: string; data?: { reference: string } };
      if (body.status === "success" && body.data?.reference) {
        _completeTrade(trade, body.data.reference);
        return { ok: true, ref: body.data.reference };
      }
      _failTrade(trade, JSON.stringify(body));
      return { ok: false, reason: trade.failReason };
    }

    if (process.env.PAYSTACK_SECRET_KEY) {
      const res = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          source:    "balance",
          amount:    Math.round(trade.fiatNet * 100),
          recipient: recipientAccount,
          reason:    `Element Settlement — Trade ${tradeId}`,
          reference: trade.idempotencyKey.slice(0, 50),
        }),
      });
      const body = await res.json() as { status: boolean; data?: { transfer_code: string } };
      if (body.status && body.data?.transfer_code) {
        _completeTrade(trade, body.data.transfer_code);
        return { ok: true, ref: body.data.transfer_code };
      }
      _failTrade(trade, JSON.stringify(body));
      return { ok: false, reason: trade.failReason };
    }

    return { ok: false, reason: "No payment provider configured" };
  } catch (err) {
    _failTrade(trade, String(err));
    return { ok: false, reason: String(err) };
  }
}

function _completeTrade(trade: MerchantTrade, ref: string) {
  trade.payoutRef = ref;
  trade.status = "completed";
  trade.payoutConfirmedAt = Date.now();
  trade.updatedAt = Date.now();
  trade.audit.push({ ts: Date.now(), event: "payout_confirmed", actor: "system", detail: `Ref: ${ref}` });
  // Release escrow
  const m = ESCROW_ACCOUNTS.get(trade.merchantId);
  if (m) {
    m.reservedAmt  = Math.max(0, m.reservedAmt  - trade.cryptoAmt);
    m.depositedAmt = Math.max(0, m.depositedAmt - trade.cryptoAmt);
    m.lastUpdated  = Date.now();
  }
  persist();
}

function _failTrade(trade: MerchantTrade, reason: string) {
  trade.status = "failed";
  trade.failReason = reason;
  trade.updatedAt = Date.now();
  trade.audit.push({ ts: Date.now(), event: "payout_failed", actor: "system", detail: reason });
  persist();
}

export function cancelTrade(tradeId: string, reason: string): { ok: boolean; reason?: string } {
  const trade = MERCHANT_TRADES.get(tradeId);
  if (!trade) return { ok: false, reason: "Trade not found" };
  if (["completed", "failed", "refunded"].includes(trade.status))
    return { ok: false, reason: `Cannot cancel a ${trade.status} trade` };

  trade.status = "cancelled";
  trade.failReason = reason;
  trade.updatedAt = Date.now();
  trade.audit.push({ ts: Date.now(), event: "trade_cancelled", actor: "user", detail: reason });

  const m = ESCROW_ACCOUNTS.get(trade.merchantId);
  if (m) {
    m.reservedAmt = Math.max(0, m.reservedAmt - trade.cryptoAmt);
    m.lastUpdated = Date.now();
    m.audit.push({ ts: Date.now(), event: "reservation_released", actor: "system", detail: `Trade ${tradeId} cancelled` });
  }
  persist();
  return { ok: true };
}

// ─── Stats ─────────────────────────────────────────────────────────────────────

export function escrowStats() {
  loadEscrowStore();
  const accounts = Array.from(ESCROW_ACCOUNTS.values());
  const trades   = Array.from(MERCHANT_TRADES.values());
  const TERMINAL = ["completed","failed","cancelled","refunded"];
  return {
    totalMerchants:   accounts.length,
    activeMerchants:  accounts.filter(m => m.status === "active").length,
    totalDeposited:   accounts.reduce((s, m) => s + m.depositedAmt, 0),
    totalReserved:    accounts.reduce((s, m) => s + m.reservedAmt, 0),
    activeTrades:     trades.filter(t => !TERMINAL.includes(t.status)).length,
    completedTrades:  trades.filter(t => t.status === "completed").length,
    underReview:      trades.filter(t => t.status === "under_review").length,
    tradingEnabled:   escrowConfig().tradingEnabled,
    missingConfig:    [
      !process.env.FLUTTERWAVE_SECRET_KEY && !process.env.PAYSTACK_SECRET_KEY
        ? "FLUTTERWAVE_SECRET_KEY or PAYSTACK_SECRET_KEY" : null,
      !process.env.VAULT_BANK_ACCOUNT ? "VAULT_BANK_ACCOUNT" : null,
    ].filter(Boolean) as string[],
  };
}

// Sanitise trade for API responses — strip anything that could expose account numbers
export function sanitizeTrade(t: MerchantTrade): Omit<MerchantTrade, "recipientName"> & { recipientName?: string } {
  const { recipientName: _, ...rest } = t;
  void _;
  return rest;
}
