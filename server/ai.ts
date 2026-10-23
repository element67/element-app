/**
 * Element AI — backend intelligence engine
 *
 * Handles all /api/ai/* routes.
 * - /api/ai/chat   — main chat endpoint (POST)
 * - /api/ai/history/:sessionId — conversation history (GET)
 * - /api/ai/clear  — clear session (POST)
 *
 * Intelligence layers (in priority order):
 *   1. External LLM (OpenAI or Anthropic) — if OPENAI_API_KEY / ANTHROPIC_API_KEY is set
 *   2. Built-in intent engine — market data, portfolio, tx diagnosis, app help
 *
 * Security:
 *   - Each session is isolated. Sessions expire after 2 hours of inactivity.
 *   - Never returns private keys, seed phrases, or wallet entropy.
 *   - All financial actions require explicit user confirmation (confirm=true param).
 *   - AI cannot initiate transactions; it only returns instructions for the frontend.
 */

import type { Server } from "bun";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:        string;
  role:      "user" | "assistant" | "system";
  content:   string;
  timestamp: number;
  intent?:   string;
  data?:     Record<string, unknown>;
}

export interface ChatSession {
  id:           string;
  messages:     ChatMessage[];
  createdAt:    number;
  lastActiveAt: number;
  walletId?:    string;
}

export interface ChatRequest {
  sessionId:  string;
  message:    string;
  walletId?:  string;
  context?:   Record<string, unknown>; // optional: { assets, tickers, recentTxs }
  confirm?:   boolean; // user confirmed a pending action
}

export interface ChatResponse {
  messageId:    string;
  reply:        string;
  intent?:      string;
  data?:        Record<string, unknown>;
  requiresConfirm?: boolean;   // true = show confirm dialog before acting
  pendingAction?:   PendingAction;
  capabilities: string[];
}

export interface PendingAction {
  type:    "send" | "info" | "navigate";
  payload: Record<string, unknown>;
  label:   string;  // human-readable summary shown in confirm dialog
}

// ── Session store ─────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const SESSIONS = new Map<string, ChatSession>();

// Evict expired sessions every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, sess] of SESSIONS) {
    if (sess.lastActiveAt < cutoff) SESSIONS.delete(id);
  }
}, 10 * 60 * 1000);

function getOrCreateSession(id: string, walletId?: string): ChatSession {
  let sess = SESSIONS.get(id);
  if (!sess) {
    sess = { id, messages: [], createdAt: Date.now(), lastActiveAt: Date.now(), walletId };
    SESSIONS.set(id, sess);
  }
  sess.lastActiveAt = Date.now();
  if (walletId) sess.walletId = walletId;
  return sess;
}

function addMessage(sess: ChatSession, msg: Omit<ChatMessage, "id" | "timestamp">): ChatMessage {
  const full: ChatMessage = { ...msg, id: uid(), timestamp: Date.now() };
  sess.messages = [...sess.messages, full].slice(-100); // keep last 100
  return full;
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── External LLM ─────────────────────────────────────────────────────────────

const OPENAI_KEY     = process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const LLM_AVAILABLE  = Boolean(OPENAI_KEY || ANTHROPIC_KEY);

const SYSTEM_PROMPT = `You are Element, the intelligent AI assistant built into RushPay — a self-custodial fintech app.

You help users with:
- Understanding their crypto portfolio, balances, and assets
- Explaining transactions, fees, network confirmations, and errors
- Market analysis and crypto price movements
- App features: Wallet, Send, Receive, Swap, Bridge, P2P marketplace, DeFi, Exchange
- Diagnosing why transactions failed
- Explaining how to use the app

Rules you MUST follow:
1. NEVER request or reveal private keys, seed phrases, passwords, or wallet entropy.
2. NEVER claim to have executed a transaction unless a real tx hash is confirmed.
3. NEVER fabricate balances, prices, addresses, or transaction IDs.
4. For any financial action (send, swap, bridge), describe the steps and let the user confirm — do NOT claim it happened.
5. If you don't know something, say so clearly.
6. Keep answers concise and mobile-friendly. Use short paragraphs.
7. When the user asks about their portfolio or recent activity, use the context data provided.

Current app capabilities: Wallet (BTC, ETH, SOL, USDC, USDT, BNB, ARB, ARC), P2P marketplace, DeFi (external wallet), Exchange (coming soon), Bridge via Relay, Swap (DEX deep-links).`;

async function askLLM(sess: ChatSession, userMsg: string, contextJson: string): Promise<string | null> {
  if (!LLM_AVAILABLE) return null;

  const history = sess.messages.slice(-12).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user" as const,
    content: m.content,
  }));

  const systemWithCtx = SYSTEM_PROMPT + (contextJson ? `\n\nUser context:\n${contextJson}` : "");

  try {
    if (OPENAI_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 600,
          messages: [
            { role: "system", content: systemWithCtx },
            ...history,
            { role: "user", content: userMsg },
          ],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        interface OpenAIResp { choices: { message: { content: string } }[] }
        const data = await res.json() as OpenAIResp;
        return data.choices[0]?.message?.content ?? null;
      }
    }

    if (ANTHROPIC_KEY) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-20240307",
          max_tokens: 600,
          system: systemWithCtx,
          messages: [...history, { role: "user", content: userMsg }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        interface AnthropicResp { content: { type: string; text: string }[] }
        const data = await res.json() as AnthropicResp;
        return data.content.find(c => c.type === "text")?.text ?? null;
      }
    }
  } catch { /* fall through to built-in */ }
  return null;
}

// ── Built-in intent engine ────────────────────────────────────────────────────

interface ParsedIntent {
  intent: string;
  params: Record<string, string>;
}

function parseIntent(text: string): ParsedIntent {
  const t = text.toLowerCase().trim();

  if (/\b(help|what can you do|commands|features)\b/.test(t))
    return { intent: "help", params: {} };

  if (/\b(balance|how much|portfolio|assets|holdings)\b/.test(t))
    return { intent: "portfolio", params: {} };

  if (/\b(price|worth|value|rate)\b.*(btc|eth|sol|bnb|usdc|usdt|arb|avax|xrp|doge)/.test(t) ||
      /\b(btc|eth|sol|bnb|avax|xrp|doge|arb)\b.*(price|worth|value|rate)/.test(t))
    return { intent: "price", params: { symbol: extractSymbol(t) } };

  if (/\b(movers|gainers|losers|top|biggest move)\b/.test(t))
    return { intent: "movers", params: {} };

  if (/\b(send|transfer|pay)\b/.test(t) && /\b(how|can i|steps)\b/.test(t))
    return { intent: "how_to_send", params: {} };

  if (/\b(receive|deposit|get paid|address)\b/.test(t))
    return { intent: "how_to_receive", params: {} };

  if (/\b(swap|exchange|convert|trade)\b/.test(t))
    return { intent: "how_to_swap", params: {} };

  if (/\b(bridge|cross.?chain|move.*to)\b/.test(t))
    return { intent: "how_to_bridge", params: {} };

  if (/\b(p2p|peer|buy.*crypto|sell.*crypto|merchant)\b/.test(t))
    return { intent: "how_to_p2p", params: {} };

  if (/\b(defi|decentrali[sz]ed|protocol|yield|liquidity)\b/.test(t))
    return { intent: "how_to_defi", params: {} };

  if (/\b(transaction|tx|failed|error|stuck|pending|rejected)\b/.test(t))
    return { intent: "tx_diagnosis", params: { query: t } };

  if (/\b(fee|gas|cost|charges|network fee)\b/.test(t))
    return { intent: "fees", params: {} };

  if (/\b(network|chain|ethereum|base|polygon|arbitrum|arc|solana|bitcoin)\b/.test(t))
    return { intent: "networks", params: { query: t } };

  if (/\b(security|safe|private key|seed|mnemonic|hack|protect)\b/.test(t))
    return { intent: "security", params: {} };

  if (/\b(scan|analy[sz]e|signal|market)\b/.test(t))
    return { intent: "scan", params: {} };

  if (/\b(history|past|previous|recent)\b/.test(t))
    return { intent: "history", params: {} };

  if (/\b(ngn|naira|fiat|local|currency|wallet)\b/.test(t))
    return { intent: "local_wallet", params: {} };

  return { intent: "general", params: { query: t } };
}

function extractSymbol(t: string): string {
  const syms = ["btc","eth","sol","bnb","usdc","usdt","arb","avax","xrp","doge","ada","op","near","link","aave","arc"];
  for (const s of syms) if (t.includes(s)) return s.toUpperCase();
  return "BTC";
}

function buildBuiltinReply(
  intent: ParsedIntent,
  context: Record<string, unknown>,
): { reply: string; data?: Record<string, unknown> } {
  const tickers = (context.tickers ?? {}) as Record<string, { lastPrice: number; priceChangePct: number; high24h: number; low24h: number }>;
  const assets  = (context.assets  ?? []) as { symbol: string; name: string; balance: number; usdValue: number; network?: string }[];

  switch (intent.intent) {

    case "help":
      return { reply: `I'm **Element**, your RushPay AI assistant. Here's what I can help with:

**Portfolio & Balances** — "What's my portfolio worth?" or "Show my BTC balance"
**Market Prices** — "What's the ETH price?" or "Show top movers today"
**App Features** — "How do I send crypto?" or "How does P2P work?"
**Transaction Help** — "Why did my transaction fail?" or "How long do confirmations take?"
**Market Signals** — "Scan markets" or "Any big movers today?"

I can also answer questions about fees, networks, security, and how to use every part of the app.

${LLM_AVAILABLE ? "✅ AI engine: connected" : "⚡ AI engine: built-in (add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env for enhanced responses)"}` };

    case "portfolio": {
      if (!assets.length) return { reply: "Your wallet hasn't loaded any assets yet. Open the Wallet tab and wait a moment for balances to sync." };
      const total = assets.reduce((s, a) => s + a.usdValue, 0);
      const rows  = [...assets].sort((a, b) => b.usdValue - a.usdValue)
        .map(a => `• **${a.symbol}** — ${a.balance.toLocaleString("en", { maximumFractionDigits: 6 })} (≈$${a.usdValue.toFixed(2)})`).join("\n");
      return { reply: `**Your Portfolio — $${total.toFixed(2)} total**\n\n${rows}`, data: { total, assets } };
    }

    case "price": {
      const sym  = intent.params.symbol ?? "BTC";
      const key  = sym + "-USD";
      const tick = tickers[key];
      if (!tick || !tick.lastPrice) return { reply: `I don't have a live price for ${sym} right now. The price feed may still be loading — try again in a moment.` };
      const chg  = tick.priceChangePct;
      const dir  = chg >= 0 ? "📈" : "📉";
      return { reply: `**${sym}** — $${tick.lastPrice.toLocaleString("en", { maximumFractionDigits: 2 })}\n${dir} 24h change: ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%\nHigh: $${tick.high24h?.toFixed(2) ?? "—"} · Low: $${tick.low24h?.toFixed(2) ?? "—"}` };
    }

    case "movers": {
      const vals = Object.entries(tickers).filter(([, t]) => t.lastPrice > 0);
      if (!vals.length) return { reply: "Price data is still loading. Try again in a few seconds." };
      const sorted = vals.sort((a, b) => b[1].priceChangePct - a[1].priceChangePct);
      const top3   = sorted.slice(0, 3).map(([k, t]) => `📈 **${k.replace("-USD","")}** ${t.priceChangePct >= 0 ? "+" : ""}${t.priceChangePct.toFixed(2)}% at $${t.lastPrice.toFixed(2)}`).join("\n");
      const bot3   = sorted.slice(-3).reverse().map(([k, t]) => `📉 **${k.replace("-USD","")}** ${t.priceChangePct.toFixed(2)}% at $${t.lastPrice.toFixed(2)}`).join("\n");
      return { reply: `**Top Movers (24h)**\n\n**Gainers:**\n${top3}\n\n**Losers:**\n${bot3}` };
    }

    case "scan": {
      const movers = Object.entries(tickers)
        .filter(([, t]) => t.lastPrice > 0 && Math.abs(t.priceChangePct) >= 3)
        .sort((a, b) => Math.abs(b[1].priceChangePct) - Math.abs(a[1].priceChangePct))
        .slice(0, 5);
      if (!movers.length) return { reply: "Markets are relatively calm right now — no assets have moved more than 3% in the last 24 hours. I'll keep watching." };
      const lines = movers.map(([k, t]) => `• **${k.replace("-USD","")}** ${t.priceChangePct >= 0 ? "+" : ""}${t.priceChangePct.toFixed(2)}% at $${t.lastPrice.toFixed(2)}`).join("\n");
      return { reply: `**Market Scan — ${movers.length} significant moves found:**\n\n${lines}\n\nUse the Signals tab to see full analysis cards for each.` };
    }

    case "how_to_send":
      return { reply: `**How to Send Crypto:**\n\n1. Go to **Wallet** → tap **Send**\n2. Select the asset (BTC, ETH, USDC, etc.)\n3. Select the correct network (e.g. Ethereum, Arc Testnet)\n4. Paste the recipient address\n5. Enter the amount\n6. Review the network fee estimate\n7. Tap **Confirm** to sign and broadcast\n\n⚠️ Always double-check the address and network before confirming. Transactions cannot be reversed.` };

    case "how_to_receive":
      return { reply: `**How to Receive Crypto:**\n\n1. Go to **Wallet** → tap **Receive**\n2. Select the asset you want to receive\n3. Select the network the sender will use\n4. Copy your address or show the QR code\n5. Share with the sender\n\n⚠️ Make sure the sender uses the same network — sending ETH on Arbitrum to an Ethereum address on a different chain will result in lost funds.` };

    case "how_to_swap":
      return { reply: `**How to Swap Tokens:**\n\n**Same-chain swaps** use DEX deep-links:\n1. Go to **Wallet** → **Swap**\n2. Select your token pair\n3. Tap the DEX link (Uniswap, 1inch, or Curve)\n4. Your connected wallet signs in the DEX interface\n\n**Cross-chain swaps** go through the Bridge feature, which uses Relay Protocol to move assets between chains.\n\nThe Exchange feature (coming soon) will support direct crypto↔fiat conversions.` };

    case "how_to_bridge":
      return { reply: `**How to Bridge Assets:**\n\n1. Go to **Wallet** → **Bridge**\n2. Select the source chain and asset\n3. Select the destination chain\n4. Enter the amount\n5. Review the Relay route and fee\n6. Confirm — your in-app wallet signs and broadcasts\n\nBridge uses **Relay Protocol** for cross-chain routes. Typical completion: 1–3 minutes for EVM→EVM routes.` };

    case "how_to_p2p":
      return { reply: `**How P2P Trading Works:**\n\n1. Go to **P2P** tab\n2. Select **Buy** or **Sell**, asset (USDC, BTC, ETH), and your currency (NGN, GHS, etc.)\n3. Browse merchant listings\n4. Tap a listing and follow the order flow\n\nP2P lets you trade directly with other users at their posted rates. No liquidity pool — just peer-to-peer. Always confirm payment before releasing crypto.` };

    case "how_to_defi":
      return { reply: `**DeFi Section:**\n\nThe DeFi tab connects your **external wallet** (MetaMask, Coinbase Wallet, etc.) — not your in-app wallet.\n\n• **Send** — transfer ERC-20 tokens from your external wallet\n• **Receive** — show your external wallet address\n• **Swap** — deep-links to Uniswap/1inch for your connected chain\n• **Bridge** — cross-chain routes via Relay\n• **Buy** — Circle Onramp for fiat→crypto\n\nConnect your wallet via the **Connect Wallet** button in the DeFi tab.` };

    case "tx_diagnosis":
      return { reply: `**Transaction Troubleshooting:**\n\n**Transaction pending too long?**\nOn EVM chains, transactions queue by gas price. If stuck, you may need to speed up or cancel using the same nonce with higher gas in MetaMask.\n\n**Transaction failed?**\nCommon reasons:\n• Insufficient gas (try increasing gas limit)\n• Contract revert (check the token contract allows your action)\n• Wrong network — always verify you're on the right chain\n• Insufficient token balance for the transfer + fee\n\n**Bridge failed?**\nCheck the Relay status tracker. Relay bridges typically complete in 1–5 min; if stuck after 15 min, the relay may need manual intervention.\n\nShare the transaction hash and I can look up more details.` };

    case "fees":
      return { reply: `**Network Fees in RushPay:**\n\n**Arc Testnet** — gas is paid in USDC (Arc's native token). Fees are very low (fractions of a cent).\n\n**Ethereum** — gas fees vary. Check etherscan.io/gastracker for current prices.\n\n**Base / Arbitrum / Optimism** — L2 fees are typically $0.01–$0.10 per transaction.\n\n**Bitcoin** — fees depend on network congestion. Currently estimated when you tap Send.\n\n**Solana** — very low fees (~$0.0001 per transaction).\n\nAll fees are shown before you confirm any transaction.` };

    case "networks":
      return { reply: `**Supported Networks:**\n\n• **Arc Testnet** — USDC as native gas, fast & cheap (default)\n• **Ethereum** — ETH, USDC, USDT, ERC-20 tokens\n• **Base** — ETH, USDC (L2, low fees)\n• **Arbitrum** — ETH, USDC, ARB (L2)\n• **Optimism** — ETH, USDC, OP (L2)\n• **Polygon** — MATIC, USDC, USDT\n• **BNB Chain** — BNB, USDT\n• **Solana** — SOL, USDC (SPL)\n• **Bitcoin** — BTC only\n\nYour in-app wallet supports all of these. DeFi only works with your external wallet (MetaMask).` };

    case "security":
      return { reply: `**Security in RushPay:**\n\n• Your wallet keys are stored **server-side** in an AES-256-GCM encrypted keystore — they never touch the browser.\n• Element AI **cannot** access your private keys or initiate transactions without your explicit confirmation on-screen.\n• Transactions require a confirmation step where you review all details before signing.\n• No seed phrases are shown or stored in chat history.\n• Set a **WALLET_ENCRYPTION_KEY** in .env for production-grade keystore encryption.\n\n⚠️ Never share your seed phrase or private key with anyone, including Element.` };

    case "local_wallet":
      return { reply: `**Local Currency Wallet (NGN):**\n\nThe NGN wallet lets you hold and send Nigerian Naira (and other local currencies) within the app.\n\n• **Deposit** — use bank transfer details shown in the Deposit screen\n• **Send** — send to another RushPay account number instantly\n• **Receive** — share your account number and QR code\n• **Exchange** — convert NGN↔USDC (Exchange tab, coming soon for live rates)\n\nLocal wallet balances are separate from your crypto wallet — they are never combined.` };

    case "history":
      return { reply: `**Your Conversation History:**\n\nYour full chat history is available in the **History** tab at the top of this screen. It shows:\n• All messages with timestamps\n• Market analysis sessions\n• Any authorized actions taken\n\nHistory is stored for this session only. It is not shared with other users.` };

    default:
      return { reply: `I'm here to help with your RushPay wallet and crypto questions. Ask me about:\n\n• Prices and market movers\n• Your portfolio balance\n• How to send, receive, swap, or bridge\n• Transaction troubleshooting\n• App features and how they work\n\nType **help** to see all available commands.` };
  }
}

// ── Main chat handler ─────────────────────────────────────────────────────────

export async function handleAIChat(body: ChatRequest): Promise<ChatResponse> {
  if (!body.sessionId || !body.message?.trim()) {
    return { messageId: uid(), reply: "Missing sessionId or message.", capabilities: [] };
  }

  // Security: strip any content that looks like a private key or seed phrase
  const safeMsg = body.message
    .replace(/\b(0x[0-9a-fA-F]{64})\b/g, "[redacted-key]")
    .replace(/\b([a-z]+\s){11,23}[a-z]+\b/gi, "[possible-seed-phrase-redacted]")
    .trim();

  const sess    = getOrCreateSession(body.sessionId, body.walletId);
  const context = body.context ?? {};
  const intent  = parseIntent(safeMsg);

  // Record user message
  addMessage(sess, { role: "user", content: safeMsg, intent: intent.intent });

  let reply: string;
  let data: Record<string, unknown> | undefined;

  // Try external LLM first for general/complex intents
  const useLocalEngine = ["portfolio","price","movers","scan","history"].includes(intent.intent)
    || !LLM_AVAILABLE;

  if (!useLocalEngine) {
    const ctxJson = JSON.stringify({
      assets:  (context.assets  as unknown[] | undefined)?.slice(0, 10) ?? [],
      tickers: Object.fromEntries(
        Object.entries((context.tickers ?? {}) as Record<string, unknown>).slice(0, 20)
      ),
    });
    const llmReply = await askLLM(sess, safeMsg, ctxJson);
    if (llmReply) {
      reply = llmReply;
    } else {
      const res = buildBuiltinReply(intent, context);
      reply = res.reply;
      data  = res.data;
    }
  } else {
    const res = buildBuiltinReply(intent, context);
    reply = res.reply;
    data  = res.data;
  }

  // Record assistant reply
  const msg = addMessage(sess, { role: "assistant", content: reply, intent: intent.intent, data });

  return {
    messageId:    msg.id,
    reply,
    intent:       intent.intent,
    data,
    capabilities: LLM_AVAILABLE
      ? ["llm", "market", "portfolio", "diagnosis", "voice"]
      : ["market", "portfolio", "diagnosis", "voice"],
  };
}

// ── History handler ───────────────────────────────────────────────────────────

export function getSessionHistory(sessionId: string): ChatMessage[] {
  return SESSIONS.get(sessionId)?.messages ?? [];
}

export function clearSession(sessionId: string): void {
  SESSIONS.delete(sessionId);
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

export function getSystemDiagnostics() {
  return {
    llmAvailable:    LLM_AVAILABLE,
    llmProvider:     OPENAI_KEY ? "openai" : ANTHROPIC_KEY ? "anthropic" : "none",
    activeSessions:  SESSIONS.size,
    capabilities:    LLM_AVAILABLE
      ? ["llm", "market_analysis", "portfolio_query", "tx_diagnosis", "voice_input", "tts"]
      : ["market_analysis", "portfolio_query", "tx_diagnosis", "voice_input", "tts"],
    missingConfig: [
      !OPENAI_KEY && !ANTHROPIC_KEY ? "OPENAI_API_KEY or ANTHROPIC_API_KEY (enhanced AI responses)" : null,
    ].filter(Boolean),
  };
}

// Export a type for Bun server (unused parameter name)
export type { Server };
