/**
 * RushPay Backend Server — port 3001
 * Exposes the Swap Engine REST API and serves as the proxied backend for the Vite frontend.
 *
 * Routes:
 *   POST /api/swap/quote      — get a live quote
 *   POST /api/swap/initiate   — create the swap and get payment instructions
 *   POST /api/swap/payment    — submit proof of payment (tx hash or bank ref)
 *   GET  /api/swap/status/:id — poll swap status
 *   POST /api/swap/cancel/:id — cancel a pending swap
 *   GET  /api/health          — health check
 */

import {
  createQuote, initiateSwap, submitPayment, getSwap, cancelSwap,
  type SwapDirection,
} from "./swapEngine.ts";
import {
  runDiagnosticScan, applyRepair, approveRepair,
  getHealthSnapshot, getIssues, getThreats, getAuditLog,
  getAvailableUpdates, checkRequestThreat,
} from "./engineer.ts";
import {
  createSettlement, notifyTxDetected, confirmPayout, finalizeSettlement,
  getSettlement, getSettlementByTrade, listSettlements, getVaultStats,
  type RecipientBank,
} from "./settlement.ts";
import {
  getOrCreateWallet, getAddresses, getBalance, sendTransaction, sendRawTransaction,
} from "./wallet.ts";
import {
  handleAIChat, getSessionHistory, clearSession, getSystemDiagnostics,
  type ChatRequest,
} from "./ai.ts";
import {
  loadEscrowStore, listActiveMerchants, getMerchant, getTrade,
  listTradesForTaker, registerMerchant, verifyMerchantDeposit,
  acceptOffer, initiatePayout, cancelTrade, escrowStats, sanitizeTrade,
} from "./merchantEscrow.ts";
import { existsSync, readFileSync, writeFileSync } from "fs";

// ── Fiat account registry ─────────────────────────────────────────────────────
// Persists to disk. Each record maps a unique accountNumber to a walletId + display info.
// Production: replace with a real DB (Postgres). Never expose phone numbers.

const ACCOUNTS_PATH = "/home/user/app/.circle/fiat-accounts.json";

interface FiatAccount {
  accountNumber: string;   // unique 9-digit identifier
  walletId:      string;   // the app wallet that owns this account
  displayName:   string;   // public display name (e.g. "Tunde B.")
  currency:      string;   // primary currency (e.g. "NGN")
  createdAt:     number;
}

interface FiatLedger {
  // walletId → currency → balance
  [walletId: string]: { [currency: string]: number };
}

const ACCOUNT_REGISTRY = new Map<string, FiatAccount>(); // accountNumber → account
const WALLET_TO_ACCOUNT = new Map<string, string>();      // walletId → accountNumber
let FIAT_LEDGER: FiatLedger = {};

// Load persisted accounts
try {
  if (existsSync(ACCOUNTS_PATH)) {
    const raw = JSON.parse(readFileSync(ACCOUNTS_PATH, "utf-8")) as {
      accounts: FiatAccount[];
      ledger: FiatLedger;
    };
    for (const acct of raw.accounts ?? []) {
      ACCOUNT_REGISTRY.set(acct.accountNumber, acct);
      WALLET_TO_ACCOUNT.set(acct.walletId, acct.accountNumber);
    }
    FIAT_LEDGER = raw.ledger ?? {};
    console.log(`[Fiat] Loaded ${ACCOUNT_REGISTRY.size} account(s) from registry`);
  }
} catch { /* start fresh */ }

async function persistAccounts() {
  try {
    const { mkdirSync } = await import("fs");
    mkdirSync("/home/user/app/.circle", { recursive: true });
    writeFileSync(ACCOUNTS_PATH, JSON.stringify({
      accounts: [...ACCOUNT_REGISTRY.values()],
      ledger: FIAT_LEDGER,
    }, null, 2), "utf-8");
  } catch { /* non-fatal */ }
}

function getLedgerBalance(walletId: string, currency: string): number {
  return FIAT_LEDGER[walletId]?.[currency] ?? 0;
}

function setLedgerBalance(walletId: string, currency: string, amount: number) {
  FIAT_LEDGER[walletId] = FIAT_LEDGER[walletId] ?? {};
  FIAT_LEDGER[walletId][currency] = amount;
}

// Derive a 9-digit account number from a phone number.
// Removes leading zero and country code, keeps last 9 digits.
// Returns null if the input is not a valid phone number.
function deriveAccountNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Remove leading country code (1-3 digits) or leading zero
  const core = digits.startsWith("0") ? digits.slice(1) : digits.replace(/^(234|44|1|254|233|27|255|256)/, "");
  if (core.length < 7) return null;
  return core.slice(-9).padStart(9, "0");
}

// Generate a random 9-digit account number not already in use
function generateUniqueAccountNumber(): string {
  let attempts = 0;
  while (attempts++ < 1000) {
    const n = String(Math.floor(100_000_000 + Math.random() * 900_000_000));
    if (!ACCOUNT_REGISTRY.has(n)) return n;
  }
  throw new Error("Could not generate unique account number");
}

const PORT = 3001;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

async function parseBody<T>(req: Request): Promise<T | null> {
  try { return await req.json() as T; } catch { return null; }
}

// ── Price proxy — CoinGecko free API (no key, no geo-block) ──────────────────
// Maps CoinGecko id → Binance-style symbol key expected by priceStore
const CG_IDS: Record<string, string> = {
  bitcoin:          "BTCUSDT",
  ethereum:         "ETHUSDT",
  solana:           "SOLUSDT",
  binancecoin:      "BNBUSDT",
  ripple:           "XRPUSDT",
  dogecoin:         "DOGEUSDT",
  cardano:          "ADAUSDT",
  avalanche:        "AVAXUSDT",
  "matic-network":  "MATICUSDT",
  polkadot:         "DOTUSDT",
  chainlink:        "LINKUSDT",
  litecoin:         "LTCUSDT",
  uniswap:          "UNIUSDT",
  cosmos:           "ATOMUSDT",
  arbitrum:         "ARBUSDT",
  optimism:         "OPUSDT",
  "the-open-network":"TONUSDT",
  tron:             "TRXUSDT",
  "fantom":         "FTMUSDT",
  "near":           "NEARUSDT",
  "aave":           "AAVEUSDT",
  "maker":          "MKRUSDT",
};

let priceCache: { data: unknown; ts: number } | null = null;
let _priceFetchInFlight: Promise<unknown> | null = null;

async function fetchPrices(): Promise<unknown> {
  // 60s cache — avoids hammering upstream on every priceStore poll
  if (priceCache && Date.now() - priceCache.ts < 60_000) return priceCache.data;
  // In-flight dedup — multiple simultaneous cache-misses share one upstream request
  if (_priceFetchInFlight) return _priceFetchInFlight;
  _priceFetchInFlight = _doFetchPrices().finally(() => { _priceFetchInFlight = null; });
  return _priceFetchInFlight;
}

async function _doFetchPrices(): Promise<unknown> {

  const ids = Object.keys(CG_IDS).join(",");
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`;

  // Try CoinGecko first, then Binance as fallback
  let out: unknown[] | null = null;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "Accept": "application/json", "User-Agent": "RushPay/1.0" },
    });
    if (res.ok) {
      interface CgCoin {
        id: string; current_price: number;
        price_change_24h: number; price_change_percentage_24h: number;
        high_24h: number; low_24h: number;
        total_volume: number;
      }
      const coins = await res.json() as CgCoin[];
      out = coins.map(c => ({
        symbol:              CG_IDS[c.id] ?? c.id.toUpperCase() + "USDT",
        lastPrice:           String(c.current_price ?? 0),
        priceChange:         String(c.price_change_24h ?? 0),
        priceChangePercent:  String(c.price_change_percentage_24h ?? 0),
        highPrice:           String(c.high_24h ?? c.current_price),
        lowPrice:            String(c.low_24h ?? c.current_price),
        volume:              String(c.total_volume ?? 0),
        quoteVolume:         String((c.current_price ?? 0) * (c.total_volume ?? 0)),
      }));
    }
  } catch { /* fall through to Binance */ }

  // Binance fallback
  if (!out) {
    const symbols = Object.values(CG_IDS);
    const bnbUrl = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
    const res2 = await fetch(bnbUrl, { signal: AbortSignal.timeout(6000) });
    if (!res2.ok) {
      // Return stale cache rather than crashing
      if (priceCache) return priceCache.data;
      throw new Error(`Both CoinGecko and Binance failed`);
    }
    out = await res2.json() as unknown[];
  }

  priceCache = { data: out, ts: Date.now() };
  return out;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url  = new URL(req.url);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // ── Price proxy ─────────────────────────────────────────────────────────
    if (path === "/api/prices" && req.method === "GET") {
      try {
        const data = await fetchPrices();
        return json(data);
      } catch (e) {
        return err(`Price fetch failed: ${e instanceof Error ? e.message : e}`, 502);
      }
    }

    // ── Health ──────────────────────────────────────────────────────────────
    if (path === "/api/health" && req.method === "GET") {
      return json({
        status: "ok",
        time:   new Date().toISOString(),
        integrations: {
          onChainRpc:      !!process.env.RPC_PROXY_BASE_URL || "public-fallback",
          flutterwave:     !!process.env.FLUTTERWAVE_SECRET_KEY,
          paystack:        !!process.env.PAYSTACK_SECRET_KEY,
          vaultEvm:        !!process.env.VAULT_EVM_ADDRESS,
          vaultPrivateKey: !!process.env.VAULT_PRIVATE_KEY,
          vaultBank:       !!process.env.VAULT_BANK_ACCOUNT,
        },
      });
    }

    // ── POST /api/swap/quote ────────────────────────────────────────────────
    if (path === "/api/swap/quote" && req.method === "POST") {
      const body = await parseBody<{
        direction: SwapDirection; crypto: string; network: string; fiat: string;
        cryptoAmount?: string; fiatAmount?: string;
      }>(req);
      if (!body?.direction || !body.crypto || !body.network || !body.fiat) {
        return err("Missing required fields: direction, crypto, network, fiat");
      }
      try {
        const quote = await createQuote(body);
        return json({ swap: sanitize(quote) });
      } catch (e) {
        return err(String(e));
      }
    }

    // ── POST /api/swap/initiate ─────────────────────────────────────────────
    if (path === "/api/swap/initiate" && req.method === "POST") {
      const body = await parseBody<{
        swapId: string; customerAddress?: string;
        customerBank?: { bankCode: string; accountNumber: string; accountName: string; provider: string };
      }>(req);
      if (!body?.swapId) return err("Missing swapId");
      try {
        const swap = await initiateSwap(body.swapId, {
          customerAddress: body.customerAddress,
          customerBank:    body.customerBank,
        });
        return json({ swap: sanitize(swap) });
      } catch (e) {
        return err(String(e));
      }
    }

    // ── POST /api/swap/payment ──────────────────────────────────────────────
    if (path === "/api/swap/payment" && req.method === "POST") {
      const body = await parseBody<{ swapId: string; txHash?: string; paymentRef?: string }>(req);
      if (!body?.swapId) return err("Missing swapId");
      if (!body.txHash && !body.paymentRef) return err("Provide txHash or paymentRef");
      try {
        const swap = await submitPayment(body.swapId, { txHash: body.txHash, paymentRef: body.paymentRef });
        return json({ swap: sanitize(swap) });
      } catch (e) {
        return err(String(e));
      }
    }

    // ── GET /api/swap/status/:id ────────────────────────────────────────────
    const statusMatch = path.match(/^\/api\/swap\/status\/([a-z0-9_]+)$/i);
    if (statusMatch && req.method === "GET") {
      const swap = getSwap(statusMatch[1]);
      if (!swap) return err("Swap not found", 404);
      return json({ swap: sanitize(swap) });
    }

    // ── POST /api/swap/cancel/:id ───────────────────────────────────────────
    const cancelMatch = path.match(/^\/api\/swap\/cancel\/([a-z0-9_]+)$/i);
    if (cancelMatch && req.method === "POST") {
      try {
        const swap = cancelSwap(cancelMatch[1]);
        return json({ swap: sanitize(swap) });
      } catch (e) {
        return err(String(e));
      }
    }

    // ── POST /api/wallet/get-or-create ─────────────────────────────────────
    // Creates or retrieves a wallet for the given userId.
    // Returns walletId + addresses. NEVER returns private keys or entropy.
    if (path === "/api/wallet/get-or-create" && req.method === "POST") {
      const body = await parseBody<{ userId: string }>(req);
      if (!body?.userId) return err("Missing userId");
      try {
        const result = await getOrCreateWallet(body.userId);
        return json(result);
      } catch (e) { return err(String(e)); }
    }

    // ── GET /api/wallet/addresses/:walletId ────────────────────────────────
    const addrMatch = path.match(/^\/api\/wallet\/addresses\/([a-z0-9]+)$/i);
    if (addrMatch && req.method === "GET") {
      const addrs = await getAddresses(addrMatch[1]);
      return json({ addresses: addrs });
    }

    // ── GET /api/wallet/balance/:walletId/:network/:symbol ─────────────────
    const balMatch = path.match(/^\/api\/wallet\/balance\/([a-z0-9]+)\/([^/]+)\/([^/]+)$/i);
    if (balMatch && req.method === "GET") {
      const [, walletId, network, symbol] = balMatch;
      try {
        const result = await getBalance(walletId, decodeURIComponent(network), symbol);
        return json(result);
      } catch (e) { return err(String(e)); }
    }

    // ── POST /api/wallet/send ──────────────────────────────────────────────
    if (path === "/api/wallet/send" && req.method === "POST") {
      const body = await parseBody<{
        walletId: string; network: string; symbol: string; to: string; amount: string;
      }>(req);
      if (!body?.walletId || !body.network || !body.symbol || !body.to || !body.amount) {
        return err("Missing required fields");
      }
      if (body.to.length < 10) return err("Invalid recipient address");
      try {
        const result = await sendTransaction(body);
        return json(result);
      } catch (e) { return err(String(e)); }
    }

    // ── POST /api/wallet/send-raw ──────────────────────────────────────────
    // Signs and broadcasts a pre-built EVM transaction (used by bridge).
    // Never returns the private key — only the resulting tx hash.
    if (path === "/api/wallet/send-raw" && req.method === "POST") {
      const body = await parseBody<{
        walletId: string; chainId: number; to: string; data?: string; value?: string;
        maxFeePerGas?: string; maxPriorityFeePerGas?: string; gasLimit?: string;
      }>(req);
      if (!body?.walletId || !body.chainId || !body.to) {
        return err("Missing required fields: walletId, chainId, to");
      }
      try {
        const result = await sendRawTransaction(body);
        return json(result);
      } catch (e) { return err(String(e)); }
    }

    // ── POST /api/fiat/register ────────────────────────────────────────────
    // Register (or retrieve) a fiat account for a wallet.
    // Accepts optional phone number for paper-style derivation.
    // Never stores full phone numbers — only stores the derived account number.
    if (path === "/api/fiat/register" && req.method === "POST") {
      const body = await parseBody<{
        walletId: string; displayName: string; currency: string;
        phone?: string;   // optional — used only to derive account number, not stored
        requestedNumber?: string; // user wants a specific number (availability checked)
      }>(req);
      if (!body?.walletId || !body.displayName || !body.currency) {
        return err("Missing walletId, displayName, or currency");
      }

      // If wallet already has an account, return it
      const existingNum = WALLET_TO_ACCOUNT.get(body.walletId);
      if (existingNum) {
        const acct = ACCOUNT_REGISTRY.get(existingNum)!;
        return json({ accountNumber: acct.accountNumber, displayName: acct.displayName, currency: acct.currency, existing: true });
      }

      // Determine account number
      let accountNumber: string | null = null;

      // 1. User requested a specific number (custom)
      if (body.requestedNumber) {
        const digits = body.requestedNumber.replace(/\D/g, "");
        if (digits.length < 7 || digits.length > 12) return err("Account number must be 7–12 digits");
        if (ACCOUNT_REGISTRY.has(digits)) return err("That account number is already taken. Choose a different one.");
        accountNumber = digits;
      }
      // 2. Phone-derived
      else if (body.phone) {
        const derived = deriveAccountNumber(body.phone);
        if (!derived) return err("Invalid phone number format");
        if (ACCOUNT_REGISTRY.has(derived)) {
          // Conflict — generate a random one instead and inform the user
          accountNumber = generateUniqueAccountNumber();
        } else {
          accountNumber = derived;
        }
      }
      // 3. Auto-generate
      else {
        accountNumber = generateUniqueAccountNumber();
      }

      const acct: FiatAccount = {
        accountNumber,
        walletId: body.walletId,
        displayName: body.displayName.slice(0, 40),
        currency: body.currency,
        createdAt: Date.now(),
      };
      ACCOUNT_REGISTRY.set(accountNumber, acct);
      WALLET_TO_ACCOUNT.set(body.walletId, accountNumber);
      persistAccounts();

      return json({ accountNumber, displayName: acct.displayName, currency: acct.currency, new: true });
    }

    // ── GET /api/fiat/lookup/:accountNumber ────────────────────────────────
    // Returns display name + currency for a given account number.
    // NEVER returns walletId, phone, full name or private details.
    const fiatLookupMatch = path.match(/^\/api\/fiat\/lookup\/(\d{7,12})$/);
    if (fiatLookupMatch && req.method === "GET") {
      const acct = ACCOUNT_REGISTRY.get(fiatLookupMatch[1]);
      if (!acct) return err("Account not found", 404);
      return json({ accountNumber: acct.accountNumber, displayName: acct.displayName, currency: acct.currency });
    }

    // ── POST /api/fiat/send ────────────────────────────────────────────────
    // Transfers fiat from sender's server-side ledger to recipient's.
    // The frontend mirrors this with a local fiatStore debit; the server is
    // the authoritative source for multi-user transfers.
    if (path === "/api/fiat/send" && req.method === "POST") {
      const body = await parseBody<{
        fromWalletId: string; toAccountNumber: string;
        currency: string; amount: number; note?: string;
        idempotencyKey: string;
      }>(req);
      if (!body?.fromWalletId || !body.toAccountNumber || !body.currency || !body.amount || !body.idempotencyKey) {
        return err("Missing required fields");
      }
      if (body.amount <= 0) return err("Amount must be positive");

      const toAcct = ACCOUNT_REGISTRY.get(body.toAccountNumber);
      if (!toAcct) return err("Recipient account not found");
      if (toAcct.walletId === body.fromWalletId) return err("Cannot send to yourself");

      const senderBal = getLedgerBalance(body.fromWalletId, body.currency);
      if (senderBal < body.amount) return err(`Insufficient ${body.currency} balance on server ledger`);

      // Apply transfer
      setLedgerBalance(body.fromWalletId, body.currency, senderBal - body.amount);
      setLedgerBalance(toAcct.walletId, body.currency,
        getLedgerBalance(toAcct.walletId, body.currency) + body.amount);
      persistAccounts();

      return json({
        success: true,
        txId: `ftx_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        toDisplayName: toAcct.displayName,
        amount: body.amount,
        currency: body.currency,
        note: body.note ?? "",
      });
    }

    // ── POST /api/fiat/sync ────────────────────────────────────────────────
    // Syncs the frontend fiatStore balance into the server ledger.
    // Called when a deposit is confirmed locally (fiatStore) so the server
    // ledger stays consistent for multi-user sends.
    if (path === "/api/fiat/sync" && req.method === "POST") {
      const body = await parseBody<{ walletId: string; currency: string; balance: number }>(req);
      if (!body?.walletId || !body.currency || body.balance == null) return err("Missing fields");
      setLedgerBalance(body.walletId, body.currency, body.balance);
      persistAccounts();
      return json({ ok: true });
    }

    // ── POST /api/ai/chat ──────────────────────────────────────────────────
    if (path === "/api/ai/chat" && req.method === "POST") {
      const body = await parseBody<ChatRequest>(req);
      if (!body?.sessionId || !body.message) return err("Missing sessionId or message");
      try {
        const result = await handleAIChat(body);
        return json(result);
      } catch (e) { return err(String(e)); }
    }

    // ── GET /api/ai/history/:sessionId ─────────────────────────────────────
    const aiHistMatch = path.match(/^\/api\/ai\/history\/([a-z0-9_-]+)$/i);
    if (aiHistMatch && req.method === "GET") {
      return json({ messages: getSessionHistory(aiHistMatch[1]) });
    }

    // ── POST /api/ai/clear ─────────────────────────────────────────────────
    if (path === "/api/ai/clear" && req.method === "POST") {
      const body = await parseBody<{ sessionId: string }>(req);
      if (body?.sessionId) clearSession(body.sessionId);
      return json({ ok: true });
    }

    // ── GET /api/ai/status ─────────────────────────────────────────────────
    if (path === "/api/ai/status" && req.method === "GET") {
      return json(getSystemDiagnostics());
    }

    // ════════════════════════════════════════════════════════════════════════
    // ELEMENT SETTLEMENT ENGINE — /api/settlement/*
    // ════════════════════════════════════════════════════════════════════════

    // ── POST /api/settlement/create ────────────────────────────────────────
    // Create a new settlement record for a P2P sell-side trade.
    if (path === "/api/settlement/create" && req.method === "POST") {
      try {
        const body = await parseBody<Record<string, string>>(req);
        if (!body) return err("Missing body");
        // Accept both naming conventions from Quick Swap and P2P callers
        const tradeId      = body.tradeId      || body.swapId      || "";
        const sellerId     = body.sellerId     || body.userId      || body.takerId || "";
        const crypto       = body.crypto       || body.asset       || "";
        const network      = body.network      || body.chain       || "Ethereum";
        const cryptoAmount = body.cryptoAmount || body.expectedAmount || body.amount || "";
        const fiat         = body.fiat         || body.fiatCurrency || "NGN";
        if (!tradeId || !sellerId || !crypto || !cryptoAmount)
          return err("Missing required fields: tradeId/swapId, sellerId/userId, crypto/asset, cryptoAmount/expectedAmount");
        const settlement = await createSettlement({
          tradeId, sellerId, crypto, network, cryptoAmount, fiat,
          recipientBank: body.recipientBank as unknown as RecipientBank | undefined
        });
        return json({ settlement: sanitizeSettlement(settlement) });
      } catch (e) { return err(String(e)); }
    }

    // ── POST /api/settlement/tx-detected ──────────────────────────────────
    // Notify the engine a transaction was detected (user submits txHash).
    if (path === "/api/settlement/tx-detected" && req.method === "POST") {
      try {
        const body = await parseBody<{ settlementId: string; txHash: string }>(req);
        if (!body?.settlementId || !body.txHash) return err("Missing settlementId or txHash");
        const settlement = await notifyTxDetected(body.settlementId, body.txHash);
        return json({ settlement: sanitizeSettlement(settlement) });
      } catch (e) { return err(String(e)); }
    }

    // ── POST /api/settlement/confirm-payout ───────────────────────────────
    // Called by provider webhook or manually to confirm payout delivery.
    if (path === "/api/settlement/confirm-payout" && req.method === "POST") {
      try {
        const body = await parseBody<{ settlementId: string; providerRef: string }>(req);
        if (!body?.settlementId || !body.providerRef) return err("Missing fields");
        const settlement = await confirmPayout(body.settlementId, body.providerRef);
        return json({ settlement: sanitizeSettlement(settlement) });
      } catch (e) { return err(String(e)); }
    }

    // ── POST /api/settlement/finalize ──────────────────────────────────────
    // Called by confirmation-tracking job when tx reaches required confs.
    if (path === "/api/settlement/finalize" && req.method === "POST") {
      try {
        const body = await parseBody<{ settlementId: string }>(req);
        if (!body?.settlementId) return err("Missing settlementId");
        const settlement = await finalizeSettlement(body.settlementId);
        return json({ settlement: sanitizeSettlement(settlement) });
      } catch (e) { return err(String(e)); }
    }

    // ── GET /api/settlement/status/:id ────────────────────────────────────
    const settlementMatch = path.match(/^\/api\/settlement\/status\/([a-zA-Z0-9_]+)$/);
    if (settlementMatch && req.method === "GET") {
      const s = getSettlement(settlementMatch[1]);
      if (!s) return err("Settlement not found", 404);
      return json({ settlement: sanitizeSettlement(s) });
    }

    // ── GET /api/settlement/by-trade/:tradeId ─────────────────────────────
    const byTradeMatch = path.match(/^\/api\/settlement\/by-trade\/([a-zA-Z0-9_-]+)$/);
    if (byTradeMatch && req.method === "GET") {
      const s = getSettlementByTrade(byTradeMatch[1]);
      if (!s) return err("No settlement for this trade", 404);
      return json({ settlement: sanitizeSettlement(s) });
    }

    // ── GET /api/settlement/vault-stats (admin) ───────────────────────────
    if (path === "/api/settlement/vault-stats" && req.method === "GET") {
      return json(getVaultStats());
    }

    // ── GET /api/settlement/list (admin) ──────────────────────────────────
    if (path === "/api/settlement/list" && req.method === "GET") {
      const limit = parseInt(new URL(req.url).searchParams.get("limit") ?? "50");
      return json({ settlements: listSettlements(limit).map(sanitizeSettlement) });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Merchant Escrow API — Top Offer merchant system (separate from Quick Swap)
    // ══════════════════════════════════════════════════════════════════════════

    // GET /api/merchant-escrow/merchants — list active merchants with available balance
    if (path === "/api/merchant-escrow/merchants" && req.method === "GET") {
      loadEscrowStore();
      return json(listActiveMerchants().map(m => ({
        merchantId: m.merchantId, merchantName: m.merchantName,
        asset: m.asset, network: m.network,
        depositedAmt: m.depositedAmt, reservedAmt: m.reservedAmt,
        availableAmt: Math.max(0, m.depositedAmt - m.reservedAmt),
        status: m.status, kycLevel: m.kycLevel, verifiedAt: m.verifiedAt,
        fiatCurrency: m.fiatCurrency, ratePerUnit: m.ratePerUnit,
        minFiat: m.minFiat, maxFiat: m.maxFiat, feePct: m.feePct,
        payMethods: m.payMethods, riskScore: m.riskScore,
        // Never return riskFlags (internal), depositAddress only to the relevant merchant
      })));
    }

    // GET /api/merchant-escrow/merchant/:id
    if (path.startsWith("/api/merchant-escrow/merchant/") && req.method === "GET") {
      const mid = path.split("/")[4];
      const m = getMerchant(mid);
      if (!m) return err("Merchant not found", 404);
      return json({ merchantId: m.merchantId, merchantName: m.merchantName,
        asset: m.asset, network: m.network, kycLevel: m.kycLevel,
        depositedAmt: m.depositedAmt, reservedAmt: m.reservedAmt,
        availableAmt: Math.max(0, m.depositedAmt - m.reservedAmt),
        status: m.status, fiatCurrency: m.fiatCurrency, ratePerUnit: m.ratePerUnit,
        minFiat: m.minFiat, maxFiat: m.maxFiat, feePct: m.feePct, payMethods: m.payMethods,
      });
    }

    // POST /api/merchant-escrow/register — merchant self-registration
    if (path === "/api/merchant-escrow/register" && req.method === "POST") {
      try {
        const body = await req.json() as Parameters<typeof registerMerchant>[0];
        if (!body?.merchantId || !body.merchantName || !body.asset)
          return err("Missing required fields");
        return json(registerMerchant(body));
      } catch (e) { return err(String(e)); }
    }

    // POST /api/merchant-escrow/verify-deposit — admin verifies merchant's on-chain deposit
    if (path === "/api/merchant-escrow/verify-deposit" && req.method === "POST") {
      try {
        const body = await req.json() as { merchantId: string; txHash: `0x${string}` };
        if (!body?.merchantId || !body.txHash) return err("Missing merchantId or txHash");
        const result = await verifyMerchantDeposit(body.merchantId, body.txHash);
        return json(result);
      } catch (e) { return err(String(e)); }
    }

    // POST /api/merchant-escrow/accept — user accepts a merchant offer (one-tap)
    if (path === "/api/merchant-escrow/accept" && req.method === "POST") {
      try {
        const body = await req.json() as {
          merchantId: string; takerId: string; fiatAmt: number;
          payMethod: string; recipientName?: string; recipientAccount?: string;
        };
        if (!body?.merchantId || !body.takerId || !body.fiatAmt)
          return err("Missing required fields");
        const result = acceptOffer(body);
        if (!result.ok) return err(result.reason ?? "Failed to accept offer");
        return json({ ok: true, trade: sanitizeTrade(result.trade!) });
      } catch (e) { return err(String(e)); }
    }

    // GET /api/merchant-escrow/trade/:id — poll trade status
    if (path.startsWith("/api/merchant-escrow/trade/") && req.method === "GET") {
      const tid = path.split("/")[4];
      const t = getTrade(tid);
      if (!t) return err("Trade not found", 404);
      return json(sanitizeTrade(t));
    }

    // GET /api/merchant-escrow/my-trades/:takerId
    if (path.startsWith("/api/merchant-escrow/my-trades/") && req.method === "GET") {
      const takerId = path.split("/")[4];
      return json(listTradesForTaker(takerId).map(sanitizeTrade));
    }

    // POST /api/merchant-escrow/payout — initiate fiat payout for a trade
    if (path === "/api/merchant-escrow/payout" && req.method === "POST") {
      try {
        const body = await req.json() as { tradeId: string };
        if (!body?.tradeId) return err("Missing tradeId");
        const result = await initiatePayout(body.tradeId);
        return json(result);
      } catch (e) { return err(String(e)); }
    }

    // POST /api/merchant-escrow/cancel — cancel a trade
    if (path === "/api/merchant-escrow/cancel" && req.method === "POST") {
      try {
        const body = await req.json() as { tradeId: string; reason: string };
        if (!body?.tradeId) return err("Missing tradeId");
        return json(cancelTrade(body.tradeId, body.reason ?? "User cancelled"));
      } catch (e) { return err(String(e)); }
    }

    // GET /api/merchant-escrow/stats — vault dashboard stats (admin)
    if (path === "/api/merchant-escrow/stats" && req.method === "GET") {
      return json(escrowStats());
    }

    // POST /api/merchant-escrow/payout-webhook — Flutterwave/Paystack callback
    if (path === "/api/merchant-escrow/payout-webhook" && req.method === "POST") {
      // Webhook verification would go here in production (signature check)
      return json({ received: true });
    }

    // ── Engineer / AI Control Center ─────────────────────────────────────
    if (path === "/api/engineer/status" && req.method === "GET") {
      const snap = getHealthSnapshot();
      return json(snap);
    }
    if (path === "/api/engineer/scan" && req.method === "POST") {
      const newIssues = await runDiagnosticScan();
      return json({ ok: true, newIssues: newIssues.length, issues: getIssues() });
    }
    if (path === "/api/engineer/issues" && req.method === "GET") {
      return json({ issues: getIssues() });
    }
    if (path === "/api/engineer/threats" && req.method === "GET") {
      return json({ threats: getThreats().slice(0, 100) });
    }
    if (path === "/api/engineer/audit" && req.method === "GET") {
      return json({ audit: getAuditLog().slice(0, 200) });
    }
    if (path === "/api/engineer/updates" && req.method === "GET") {
      return json({ updates: getAvailableUpdates() });
    }
    if (path === "/api/engineer/repair" && req.method === "POST") {
      const { issueId } = (await req.json().catch(() => ({}))) as { issueId?: string };
      if (!issueId) return err("issueId required", 400);
      const result = await applyRepair(issueId);
      return json(result);
    }
    if (path === "/api/engineer/approve" && req.method === "POST") {
      const { issueId } = (await req.json().catch(() => ({}))) as { issueId?: string };
      if (!issueId) return err("issueId required", 400);
      return json(approveRepair(issueId));
    }

    return err("Not found", 404);
  },
});

console.log(`[RushPay Server] Listening on port ${server.port}`);
console.log(`[RushPay Server] Flutterwave: ${process.env.FLUTTERWAVE_SECRET_KEY ? "✓" : "not configured"}`);
console.log(`[RushPay Server] Paystack:    ${process.env.PAYSTACK_SECRET_KEY    ? "✓" : "not configured"}`);
console.log(`[RushPay Server] Vault EVM:   ${process.env.VAULT_EVM_ADDRESS      ? "✓" : "not configured"}`);

// Strip sensitive fields from settlement records before sending to client
function sanitizeSettlement(s: ReturnType<typeof getSettlement>) {
  if (!s) return null;
  return {
    id: s.id, tradeId: s.tradeId, sellerId: s.sellerId,
    crypto: s.crypto, network: s.network, cryptoAmount: s.cryptoAmount,
    depositAddress: s.depositAddress,
    txHash: s.txHash, txConfirmations: s.txConfirmations,
    fiat: s.fiat, fiatAmount: s.fiatAmount, rate: s.rate, fee: s.fee,
    payoutRef: s.payoutRef, payoutConfirmed: s.payoutConfirmed,
    riskScore: s.riskScore, riskFlags: s.riskFlags,
    earlyPayoutGranted: s.earlyPayoutGranted, vaultReserved: s.vaultReserved,
    requiredConfs: s.requiredConfs,
    status: s.status, statusMessage: s.statusMessage,
    createdAt: s.createdAt, updatedAt: s.updatedAt, expiresAt: s.expiresAt,
    // Omit recipientBank (sensitive), recipientBank provider is ok
    recipientBankProvider: s.recipientBank?.provider ?? null,
    // Omit full audit log from client responses (internal only)
  };
}

// Strip sensitive fields before sending to client
function sanitize(swap: ReturnType<typeof getSwap>) {
  if (!swap) return null;
  return {
    ...swap,
    // Never expose bank account numbers for OTHER users — only instructions the customer needs
    customerBank: swap.customerBank ? { bankCode: swap.customerBank.bankCode, accountName: swap.customerBank.accountName, provider: swap.customerBank.provider } : null,
    // Audit log is internal — omit from client response
    auditLog: undefined,
  };
}
