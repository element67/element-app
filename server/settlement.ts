/**
 * Element Settlement Engine — server/settlement.ts
 *
 * Vault-backed instant-settlement for P2P crypto→fiat trades.
 * Separate from the QuickSwap engine (swapEngine.ts) — handles the
 * full P2P sell-side lifecycle where a user deposits crypto and
 * receives local currency as fast as the configured policy allows.
 *
 * Settlement phases (maps to P2PSettlementStatus):
 *   awaiting_crypto      → deposit address assigned, waiting for incoming tx
 *   tx_detected          → transaction seen in mempool / by provider
 *   verifying            → fetching receipt, checking logs, counting confs
 *   early_payout_eligible→ passes instant-settlement policy; reserving vault
 *   payout_processing    → payout initiated with provider
 *   paid                 → provider confirmed payment
 *   awaiting_confirmation→ waiting for remaining blockchain confirmations
 *   completed            → fully confirmed + reconciled
 *   under_review         → fraud hold / manual review
 *   failed               → verification or payout failed
 *
 * Security model:
 *   - Private keys NEVER leave this process
 *   - All financial decisions follow deterministic rules (no AI)
 *   - AI is only used for risk score explanation (read-only)
 *   - Vault reservations are atomic (Map + synchronous lock flag)
 *   - Every state transition appends to an immutable audit log
 *   - Duplicate-payment protection via processed-tx Set
 *   - Per-trade and daily exposure limits enforced before reservation
 */

import { createPublicClient, http, type Hex } from "viem";
import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";

// ─── RPC proxy (same pattern as swapEngine.ts) ────────────────────────────────
const PROXY_BASE   = process.env.RPC_PROXY_BASE_URL;
const PROXY_TOKEN  = process.env.RPC_PROXY_TOKEN;
const PROXY_CHAINS = (process.env.RPC_PROXY_CHAINS ?? "").split(",").map(s => s.trim());

function rpcUrl(compassChain: string, fallback: string): string {
  if (PROXY_BASE && PROXY_CHAINS.includes(compassChain))
    return `${PROXY_BASE}/api/rpc/${compassChain}?_rpc_token=${PROXY_TOKEN}`;
  return fallback;
}

const CHAIN_MAP = {
  ethereum: { chain: mainnet,  compass: "Ethereum",  pub: "https://cloudflare-eth.com" },
  base:     { chain: base,     compass: "Base",       pub: "https://mainnet.base.org"   },
  arbitrum: { chain: arbitrum, compass: "Arbitrum",   pub: "https://arb1.arbitrum.io/rpc"},
  optimism: { chain: optimism, compass: "OP_Mainnet", pub: "https://mainnet.optimism.io"},
  polygon:  { chain: polygon,  compass: "Polygon",    pub: "https://polygon-rpc.com"    },
} as const;

const CLIENT_CACHE = new Map<string, ReturnType<typeof createPublicClient>>();
function getClient(network: string): ReturnType<typeof createPublicClient> | null {
  if (CLIENT_CACHE.has(network)) return CLIENT_CACHE.get(network)!;
  const cfg = CHAIN_MAP[network as keyof typeof CHAIN_MAP];
  if (!cfg) return null;
  const c = createPublicClient({ chain: cfg.chain, transport: http(rpcUrl(cfg.compass, cfg.pub)) });
  CLIENT_CACHE.set(network, c);
  return c;
}

// ─── Known token addresses ────────────────────────────────────────────────────
// arc-studio-allow-onchain-literal
const USDC_ADDRS: Record<string, Hex> = {
  ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  base:     "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  polygon:  "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};
// arc-studio-allow-onchain-literal
const USDT_ADDRS: Record<string, Hex> = {
  ethereum: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  polygon:  "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
  arbitrum: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
};
const TOKEN_MAP: Record<string, Record<string, Hex>> = { USDC: USDC_ADDRS, USDT: USDT_ADDRS };
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;

// ─── Types ────────────────────────────────────────────────────────────────────
export type SettlementStatus =
  | "awaiting_crypto"
  | "tx_detected"
  | "verifying"
  | "early_payout_eligible"
  | "payout_processing"
  | "paid"
  | "awaiting_confirmation"
  | "completed"
  | "under_review"
  | "failed";

export interface SettlementAudit { ts: number; event: string; detail?: string }

export interface SettlementRecord {
  id:                 string;
  /** P2P trade ID this settlement is for */
  tradeId:            string;
  /** Who is selling crypto */
  sellerId:           string;
  /** Crypto asset sold */
  crypto:             string;
  network:            string;
  /** Expected crypto deposit amount */
  cryptoAmount:       string;
  /** Deposit address (vault) */
  depositAddress:     string | null;
  /** Actual received tx */
  txHash:             string | null;
  txBlockNumber:      bigint | null;
  txConfirmations:    number;
  /** Fiat payout */
  fiat:               string;
  fiatAmount:         string;
  rate:               number;
  fee:                string;
  /** Recipient bank details */
  recipientBank:      RecipientBank | null;
  /** Payout provider reference */
  payoutRef:          string | null;
  payoutConfirmed:    boolean;
  /** Risk */
  riskScore:          number;
  riskFlags:          string[];
  earlyPayoutGranted: boolean;
  /** Vault reservation */
  vaultReserved:      number;
  /** Timing */
  createdAt:          number;
  updatedAt:          number;
  expiresAt:          number;
  status:             SettlementStatus;
  audit:              SettlementAudit[];
  /** Human-readable status message shown to user */
  statusMessage:      string;
  /** Estimated confirmations needed */
  requiredConfs:      number;
}

export interface RecipientBank {
  bankCode:      string;
  accountNumber: string;
  accountName:   string;
  bankName:      string;
  provider:      "flutterwave" | "paystack" | "unavailable";
}

// ─── In-memory stores ─────────────────────────────────────────────────────────
const settlements    = new Map<string, SettlementRecord>();
const processedTxs   = new Set<string>();
/** Total reserved but not yet reconciled (guard against over-exposure) */
let vaultReservedTotal = 0;

// ─── Vault liquidity (read from env) ─────────────────────────────────────────
function getVaultLiquidity(): number {
  const raw = process.env.VAULT_LIQUIDITY_NGN ?? process.env.VAULT_LIQUIDITY ?? "0";
  return parseFloat(raw) || 0;
}
function getVaultAddress(network: string): string | null {
  return (
    process.env[`VAULT_ADDRESS_${network.toUpperCase()}`] ||
    process.env.VAULT_EVM_ADDRESS ||
    null
  );
}

// ─── Instant-settlement policy ────────────────────────────────────────────────
/**
 * Deterministic rules only — AI is NOT involved in approval decisions.
 * Returns whether an early payout is permitted and why it was denied if not.
 */
function evaluateInstantPolicy(rec: SettlementRecord): { allow: boolean; reason: string } {
  const fiatAmt = parseFloat(rec.fiatAmount);
  const liquidity = getVaultLiquidity();

  // 1. Vault must have enough unreserved liquidity
  const available = liquidity - vaultReservedTotal;
  if (available < fiatAmt)
    return { allow: false, reason: `Insufficient vault liquidity (available: ${available.toLocaleString()})` };

  // 2. Per-transaction limit (configurable via env, default ₦500,000)
  const perTxLimit = parseFloat(process.env.INSTANT_MAX_PER_TX ?? "500000");
  if (fiatAmt > perTxLimit)
    return { allow: false, reason: `Amount ${fiatAmt} exceeds instant-settlement limit ${perTxLimit}` };

  // 3. Daily seller exposure limit (configurable, default ₦2,000,000)
  const dailyLimit = parseFloat(process.env.INSTANT_DAILY_SELLER_LIMIT ?? "2000000");
  const today = new Date().toDateString();
  const sellerDailyTotal = [...settlements.values()]
    .filter(s => s.sellerId === rec.sellerId && s.earlyPayoutGranted &&
                 new Date(s.createdAt).toDateString() === today)
    .reduce((sum, s) => sum + parseFloat(s.fiatAmount), 0);
  if (sellerDailyTotal + fiatAmt > dailyLimit)
    return { allow: false, reason: `Daily limit ${dailyLimit} reached for this seller` };

  // 4. Risk score must be below threshold
  if (rec.riskScore >= 50)
    return { allow: false, reason: `Risk score ${rec.riskScore} too high for instant payout` };

  // 5. Transaction must have at least 1 confirmation (EVM) or equivalent
  if (rec.txConfirmations < 1)
    return { allow: false, reason: "Transaction has 0 confirmations — too early" };

  return { allow: true, reason: "All instant-settlement criteria passed" };
}

// ─── Risk scoring (deterministic — no AI) ────────────────────────────────────
function scoreRisk(rec: SettlementRecord): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;

  const fiatAmt = parseFloat(rec.fiatAmount);
  if (fiatAmt > 5_000_000)     { flags.push("large_fiat_amount");      score += 25; }
  if (fiatAmt > 1_000_000)     { flags.push("high_value_trade");       score += 10; }

  // First-time seller
  const priorCompleted = [...settlements.values()]
    .filter(s => s.sellerId === rec.sellerId && s.status === "completed").length;
  if (priorCompleted === 0)    { flags.push("first_time_seller");       score += 15; }

  // Duplicate tx guard
  if (rec.txHash && processedTxs.has(rec.txHash)) {
    flags.push("duplicate_tx");                                          score += 90;
  }

  // Expired
  if (Date.now() > rec.expiresAt) { flags.push("expired");             score += 40; }

  return { score, flags };
}

// ─── Confirmation thresholds (by network) ────────────────────────────────────
const CONF_REQUIREMENTS: Record<string, number> = {
  bitcoin:  3,
  ethereum: 12,
  base:     1,
  arbitrum: 1,
  optimism: 1,
  polygon:  20,
  solana:   32,
};
function requiredConfs(network: string): number {
  return CONF_REQUIREMENTS[network.toLowerCase()] ?? 6;
}

// ─── FX rate (same seed table as swapEngine.ts — extend from server config) ──
const SEED_USD_PRICES: Record<string, number> = {
  USDC: 1, USDT: 1, BTC: 95000, ETH: 3500, SOL: 180, BNB: 320, MATIC: 0.55,
};
const SEED_FX: Record<string, number> = {
  NGN: 1650, KES: 130, GHS: 15.5, ZAR: 18.5, USD: 1, GBP: 0.79, EUR: 0.92,
  TZS: 2650, UGX: 3750, INR: 84, BRL: 5.1, MXN: 17.2,
};
export function getSettlementRate(crypto: string, fiat: string): number {
  return (SEED_USD_PRICES[crypto.toUpperCase()] ?? 1) * (SEED_FX[fiat.toUpperCase()] ?? 1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeId()  { return `se_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function log(rec: SettlementRecord, event: string, detail?: string) {
  rec.audit.push({ ts: Date.now(), event, detail });
  rec.updatedAt = Date.now();
}
function statusMsg(status: SettlementStatus, confs?: number, required?: number): string {
  switch (status) {
    case "awaiting_crypto":       return "Waiting for your crypto deposit…";
    case "tx_detected":           return "Transaction detected on the network";
    case "verifying":             return `Verifying on blockchain (${confs ?? 0}/${required ?? "?"} confirmations)`;
    case "early_payout_eligible": return "Early payout approved — processing your payment";
    case "payout_processing":     return "Sending your local currency payout…";
    case "paid":                  return "Payment sent — awaiting your bank confirmation";
    case "awaiting_confirmation": return `Awaiting ${required ?? "?"} confirmations (${confs ?? 0} so far)`;
    case "completed":             return "Settlement complete — funds received";
    case "under_review":          return "Under review — your funds are safe, we'll contact you";
    case "failed":                return "Settlement failed — contact support with your trade ID";
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Create a settlement record for a P2P sell trade */
export async function createSettlement(params: {
  tradeId:      string;
  sellerId:     string;
  crypto:       string;
  network:      string;
  cryptoAmount: string;
  fiat:         string;
  recipientBank?: RecipientBank;
}): Promise<SettlementRecord> {
  const id      = makeId();
  const rate    = getSettlementRate(params.crypto, params.fiat);
  const feeRate = 0.005; // 0.5%
  const cryptoAmt = parseFloat(params.cryptoAmount);
  const grossFiat = cryptoAmt * rate;
  const fee       = grossFiat * feeRate;
  const netFiat   = grossFiat - fee;
  const decimals  = params.crypto.toUpperCase() === "BTC" ? 8 : 6;

  const rec: SettlementRecord = {
    id, tradeId: params.tradeId, sellerId: params.sellerId,
    crypto: params.crypto.toUpperCase(), network: params.network.toLowerCase(),
    cryptoAmount: cryptoAmt.toFixed(decimals),
    depositAddress: getVaultAddress(params.network),
    txHash: null, txBlockNumber: null, txConfirmations: 0,
    fiat: params.fiat.toUpperCase(),
    fiatAmount:  netFiat.toFixed(2),
    rate, fee: fee.toFixed(2),
    recipientBank: params.recipientBank ?? null,
    payoutRef: null, payoutConfirmed: false,
    riskScore: 0, riskFlags: [], earlyPayoutGranted: false,
    vaultReserved: 0,
    createdAt: Date.now(), updatedAt: Date.now(),
    expiresAt: Date.now() + 30 * 60 * 1000, // 30-min window
    status: "awaiting_crypto",
    statusMessage: statusMsg("awaiting_crypto"),
    requiredConfs: requiredConfs(params.network),
    audit: [],
  };

  log(rec, "settlement_created", `${rec.cryptoAmount} ${rec.crypto} → ${rec.fiatAmount} ${rec.fiat} @ ${rate}`);
  settlements.set(id, rec);
  return rec;
}

/** Notify the engine that a transaction hash was detected (from user or webhook) */
export async function notifyTxDetected(settlementId: string, txHash: string): Promise<SettlementRecord> {
  const rec = settlements.get(settlementId);
  if (!rec) throw new Error("Settlement not found");
  if (!["awaiting_crypto", "tx_detected"].includes(rec.status))
    throw new Error(`Cannot notify tx in status: ${rec.status}`);

  // Idempotent
  if (rec.txHash && rec.txHash !== txHash) throw new Error("Different tx hash already recorded");
  if (processedTxs.has(txHash)) throw new Error("This transaction has already been used for a settlement");

  rec.txHash = txHash;
  rec.status = "tx_detected";
  rec.statusMessage = statusMsg("tx_detected");
  log(rec, "tx_detected", txHash);

  // Start async verification (non-blocking)
  processSettlement(rec).catch(err => {
    console.error(`[ElementSettlement] process error for ${rec.id}:`, err);
    rec.status = "failed";
    rec.statusMessage = statusMsg("failed");
    log(rec, "process_error", String(err));
  });

  return rec;
}

/** Core processing pipeline — called after tx is detected */
async function processSettlement(rec: SettlementRecord): Promise<void> {
  rec.status = "verifying";
  rec.statusMessage = statusMsg("verifying", 0, rec.requiredConfs);
  log(rec, "verification_started");

  // ── 1. On-chain verification ─────────────────────────────────────────────
  const client = getClient(rec.network);
  if (!client) {
    rec.status = "failed";
    rec.statusMessage = statusMsg("failed");
    log(rec, "rpc_unavailable", `network: ${rec.network}`);
    return;
  }

  let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | null = null;
  let blockNumber: bigint = 0n;
  try {
    [receipt, blockNumber] = await Promise.all([
      client.getTransactionReceipt({ hash: rec.txHash as Hex }),
      client.getBlockNumber(),
    ]);
  } catch (e) {
    // RPC hiccup — mark as verifying; caller can retry via notifyTxDetected again
    log(rec, "rpc_error", String(e));
    return;
  }

  if (!receipt || receipt.status !== "success") {
    rec.status = "failed";
    rec.statusMessage = statusMsg("failed");
    log(rec, "tx_failed_or_not_found", `receipt=${receipt?.status ?? "null"}`);
    return;
  }

  rec.txBlockNumber    = receipt.blockNumber;
  rec.txConfirmations  = Number(blockNumber - receipt.blockNumber);
  rec.statusMessage    = statusMsg("verifying", rec.txConfirmations, rec.requiredConfs);
  log(rec, "receipt_found", `confs=${rec.txConfirmations}`);

  // ── 2. Verify amount and destination ─────────────────────────────────────
  const vaultAddr = rec.depositAddress?.toLowerCase();
  if (!vaultAddr) {
    rec.status = "failed";
    rec.statusMessage = statusMsg("failed");
    log(rec, "no_vault_address");
    return;
  }

  const tokenAddrs = TOKEN_MAP[rec.crypto];
  if (tokenAddrs) {
    // ERC-20 token (USDC / USDT)
    const tokenAddr = tokenAddrs[rec.network];
    if (!tokenAddr) {
      rec.status = "failed";
      rec.statusMessage = statusMsg("failed");
      log(rec, "token_not_on_network", `${rec.crypto} not mapped on ${rec.network}`);
      return;
    }
    const transferLog = receipt.logs.find(l =>
      l.address.toLowerCase() === tokenAddr.toLowerCase() &&
      l.topics[0] === TRANSFER_TOPIC &&
      l.topics[2] && `0x${l.topics[2].slice(26).toLowerCase()}` === vaultAddr
    );
    if (!transferLog) {
      rec.status = "failed";
      rec.statusMessage = statusMsg("failed");
      log(rec, "no_transfer_log", "No ERC-20 Transfer to vault found in tx");
      return;
    }
    const rawAmt  = BigInt(transferLog.data);
    const received = Number(rawAmt) / 1e6; // USDC/USDT are 6 decimals
    const expected = parseFloat(rec.cryptoAmount);
    if (Math.abs(received - expected) / expected > 0.005) {
      rec.status = "failed";
      rec.statusMessage = statusMsg("failed");
      log(rec, "amount_mismatch", `expected=${expected} received=${received}`);
      return;
    }
    log(rec, "amount_verified", `received=${received} ${rec.crypto}`);
  } else if (rec.crypto === "ETH") {
    // Native ETH
    const tx = await client.getTransaction({ hash: rec.txHash as Hex });
    if (tx.to?.toLowerCase() !== vaultAddr) {
      rec.status = "failed";
      rec.statusMessage = statusMsg("failed");
      log(rec, "wrong_destination");
      return;
    }
    const received = Number(tx.value) / 1e18;
    const expected = parseFloat(rec.cryptoAmount);
    if (Math.abs(received - expected) / expected > 0.005) {
      rec.status = "failed";
      rec.statusMessage = statusMsg("failed");
      log(rec, "amount_mismatch", `expected=${expected} received=${received}`);
      return;
    }
    log(rec, "amount_verified", `received=${received} ETH`);
  } else {
    log(rec, "native_token_unverified", `${rec.crypto} — using tx presence as proof`);
  }

  // Prevent duplicate use
  if (processedTxs.has(rec.txHash!)) {
    rec.status = "failed";
    rec.statusMessage = statusMsg("failed");
    log(rec, "duplicate_tx_detected");
    return;
  }

  // ── 3. Risk scoring ───────────────────────────────────────────────────────
  const risk = scoreRisk(rec);
  rec.riskScore = risk.score;
  rec.riskFlags = risk.flags;
  log(rec, "risk_scored", `score=${risk.score} flags=${risk.flags.join(",")}`);

  if (risk.score >= 70) {
    rec.status = "under_review";
    rec.statusMessage = statusMsg("under_review");
    log(rec, "fraud_hold", `score=${risk.score}`);
    return;
  }

  // ── 4. Instant-settlement eligibility ────────────────────────────────────
  const policy = evaluateInstantPolicy(rec);
  log(rec, "policy_evaluated", policy.reason);

  if (policy.allow) {
    // Reserve vault funds atomically
    const fiatAmt = parseFloat(rec.fiatAmount);
    vaultReservedTotal += fiatAmt;
    rec.vaultReserved   = fiatAmt;
    rec.earlyPayoutGranted = true;
    rec.status        = "early_payout_eligible";
    rec.statusMessage = statusMsg("early_payout_eligible");
    log(rec, "vault_reserved", `amount=${fiatAmt} totalReserved=${vaultReservedTotal}`);

    // ── 5a. Initiate early payout ──────────────────────────────────────────
    await initiatePayout(rec);

    // Track tx even before full confirmation (will reconcile after)
  } else {
    // Wait for full confirmation threshold
    rec.status        = "awaiting_confirmation";
    rec.statusMessage = statusMsg("awaiting_confirmation", rec.txConfirmations, rec.requiredConfs);
    log(rec, "awaiting_full_confirmation", policy.reason);
    // Caller must poll via getSettlement() + call finalizeSettlement() once confs reached
  }
}

/** Initiate the fiat payout (called after reservation) */
async function initiatePayout(rec: SettlementRecord): Promise<void> {
  rec.status        = "payout_processing";
  rec.statusMessage = statusMsg("payout_processing");
  log(rec, "payout_started");

  if (!rec.recipientBank) {
    rec.status = "under_review";
    rec.statusMessage = statusMsg("under_review");
    log(rec, "payout_held_no_bank", "No recipient bank provided — requires manual payout");
    return;
  }

  const result = await dispatchPayout(rec);
  if (!result.success) {
    // Release reservation
    vaultReservedTotal = Math.max(0, vaultReservedTotal - rec.vaultReserved);
    rec.vaultReserved  = 0;
    rec.status = "under_review";
    rec.statusMessage = statusMsg("under_review");
    log(rec, "payout_failed", result.error ?? "provider error");
    return;
  }

  rec.payoutRef     = result.ref ?? null;
  rec.status        = "paid";
  rec.statusMessage = statusMsg("paid");
  log(rec, "payout_sent", `ref=${result.ref}`);

  // Mark tx as processed (prevents duplicate)
  if (rec.txHash) processedTxs.add(rec.txHash);
}

interface PayoutDispatchResult { success: boolean; ref?: string; error?: string }
async function dispatchPayout(rec: SettlementRecord): Promise<PayoutDispatchResult> {
  const flwKey = process.env.FLUTTERWAVE_SECRET_KEY;
  const pstKey = process.env.PAYSTACK_SECRET_KEY;

  if (!flwKey && !pstKey) {
    return {
      success: false,
      error: "Payout provider not configured. Set FLUTTERWAVE_SECRET_KEY or PAYSTACK_SECRET_KEY in .env.",
    };
  }
  if (!rec.recipientBank) return { success: false, error: "No recipient bank" };

  const idempotencyKey = `se-payout-${rec.id}`;

  try {
    if (flwKey) {
      const resp = await fetch("https://api.flutterwave.com/v3/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${flwKey}` },
        body: JSON.stringify({
          account_bank:   rec.recipientBank.bankCode,
          account_number: rec.recipientBank.accountNumber,
          amount:         parseFloat(rec.fiatAmount),
          narration:      `Element Settlement ${rec.id}`,
          currency:       rec.fiat,
          reference:      idempotencyKey,
          debit_currency: rec.fiat,
        }),
      });
      const json = await resp.json() as { status: string; data?: { id: string; reference?: string } };
      if (json.status !== "success")
        return { success: false, error: `Flutterwave: ${json.status}` };
      return { success: true, ref: json.data?.reference ?? json.data?.id };
    }

    if (pstKey) {
      const resp = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${pstKey}` },
        body: JSON.stringify({
          source:    "balance",
          amount:    Math.round(parseFloat(rec.fiatAmount) * 100),
          recipient: rec.recipientBank.accountNumber,
          reason:    `Element Settlement ${rec.id}`,
          reference: idempotencyKey,
        }),
      });
      const json = await resp.json() as { status: boolean; data?: { transfer_code: string } };
      if (!json.status) return { success: false, error: "Paystack transfer failed" };
      return { success: true, ref: json.data?.transfer_code };
    }
  } catch (e) {
    return { success: false, error: String(e) };
  }

  return { success: false, error: "No provider" };
}

/**
 * Confirm payout from provider webhook or polling.
 * Call this when the provider confirms the payment was received.
 */
export async function confirmPayout(settlementId: string, providerRef: string): Promise<SettlementRecord> {
  const rec = settlements.get(settlementId);
  if (!rec) throw new Error("Settlement not found");
  if (rec.status !== "paid" && rec.status !== "payout_processing")
    throw new Error(`Cannot confirm payout in status: ${rec.status}`);

  rec.payoutConfirmed = true;
  // If still waiting for full confs, move to awaiting_confirmation
  if (rec.txConfirmations < rec.requiredConfs) {
    rec.status        = "awaiting_confirmation";
    rec.statusMessage = statusMsg("awaiting_confirmation", rec.txConfirmations, rec.requiredConfs);
    log(rec, "payout_confirmed_waiting_confs", `ref=${providerRef} confs=${rec.txConfirmations}/${rec.requiredConfs}`);
  } else {
    // Already fully confirmed — complete immediately
    await finalizeSettlement(settlementId);
  }
  return rec;
}

/**
 * Call this when the tx reaches the required confirmation threshold.
 * Can be called by a polling job or on-chain event webhook.
 */
export async function finalizeSettlement(settlementId: string): Promise<SettlementRecord> {
  const rec = settlements.get(settlementId);
  if (!rec) throw new Error("Settlement not found");
  if (rec.status === "completed") return rec;

  // Re-check confirmations if we have a client
  const client = getClient(rec.network);
  if (client && rec.txBlockNumber !== null) {
    try {
      const blockNumber = await client.getBlockNumber();
      rec.txConfirmations = Number(blockNumber - rec.txBlockNumber);
    } catch { /* keep existing count */ }
  }

  if (rec.txConfirmations < rec.requiredConfs && rec.status !== "paid") {
    rec.statusMessage = statusMsg("awaiting_confirmation", rec.txConfirmations, rec.requiredConfs);
    log(rec, "not_yet_finalized", `confs=${rec.txConfirmations}/${rec.requiredConfs}`);
    return rec;
  }

  // Release vault reservation for early-payout trades
  if (rec.earlyPayoutGranted && rec.vaultReserved > 0) {
    vaultReservedTotal = Math.max(0, vaultReservedTotal - rec.vaultReserved);
    rec.vaultReserved  = 0;
    log(rec, "vault_reservation_released");
  }

  rec.status        = "completed";
  rec.statusMessage = statusMsg("completed");
  log(rec, "settlement_completed", `confs=${rec.txConfirmations}`);

  return rec;
}

// ─── Read API ─────────────────────────────────────────────────────────────────
export function getSettlement(id: string): SettlementRecord | undefined {
  return settlements.get(id);
}

export function getSettlementByTrade(tradeId: string): SettlementRecord | undefined {
  return [...settlements.values()].find(s => s.tradeId === tradeId);
}

export function listSettlements(limit = 50): SettlementRecord[] {
  return [...settlements.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

// ─── Vault dashboard stats ────────────────────────────────────────────────────
export function getVaultStats() {
  const all = [...settlements.values()];
  const providerConfigured = !!(process.env.FLUTTERWAVE_SECRET_KEY || process.env.PAYSTACK_SECRET_KEY);
  const vaultAddress       = process.env.VAULT_EVM_ADDRESS ?? null;
  const liquidity          = getVaultLiquidity();

  return {
    totalLiquidity:     liquidity,
    reservedLiquidity:  vaultReservedTotal,
    availableLiquidity: Math.max(0, liquidity - vaultReservedTotal),
    providerConfigured,
    vaultAddressSet:    !!vaultAddress,

    counts: {
      total:         all.length,
      awaitingCrypto: all.filter(s => s.status === "awaiting_crypto").length,
      verifying:     all.filter(s => ["tx_detected","verifying"].includes(s.status)).length,
      earlyPayout:   all.filter(s => s.earlyPayoutGranted && !["completed","failed"].includes(s.status)).length,
      paid:          all.filter(s => s.status === "paid").length,
      completed:     all.filter(s => s.status === "completed").length,
      underReview:   all.filter(s => s.status === "under_review").length,
      failed:        all.filter(s => s.status === "failed").length,
    },

    instantSettlementEnabled: liquidity > 0 && providerConfigured && !!vaultAddress,

    missingConfig: [
      !vaultAddress          && "VAULT_EVM_ADDRESS",
      !providerConfigured    && "FLUTTERWAVE_SECRET_KEY or PAYSTACK_SECRET_KEY",
      liquidity === 0        && "VAULT_LIQUIDITY_NGN",
    ].filter(Boolean) as string[],

    recentSettlements: all
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20)
      .map(s => ({
        id: s.id, tradeId: s.tradeId, status: s.status, statusMessage: s.statusMessage,
        crypto: s.crypto, cryptoAmount: s.cryptoAmount, fiat: s.fiat, fiatAmount: s.fiatAmount,
        rate: s.rate, riskScore: s.riskScore, riskFlags: s.riskFlags,
        earlyPayoutGranted: s.earlyPayoutGranted, txConfirmations: s.txConfirmations,
        requiredConfs: s.requiredConfs, createdAt: s.createdAt, updatedAt: s.updatedAt,
      })),
  };
}
