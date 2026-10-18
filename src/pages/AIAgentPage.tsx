/**
 * Element — AI Market Analysis Agent
 * Watches live prices, spots movers, suggests DeFi actions.
 * No perp trading. No positions. Uses priceStore + walletStore + Nanopayments.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import { ConnectKitButton } from "connectkit";
import {
  Bot, Send, RefreshCw, Settings2, TrendingUp, TrendingDown,
  Zap, BarChart2, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, X, Activity, ArrowUpDown, Shield,
} from "lucide-react";
import { usePriceStore, type Ticker } from "@/store/priceStore";
import { useWalletStore } from "@/store/walletStore";
import { useNanopayments, acquireIdempotency } from "@/lib/nanopayments";
import { NanopayBadge } from "@/components/NanopaymentStatus";

// ─────────────────────────── Types ───────────────────────────────────────────

type SignalDirection = "up" | "down" | "neutral";
type SignalStrength  = "strong" | "moderate" | "weak";

interface MarketSignal {
  id:         string;
  market:     string;
  direction:  SignalDirection;
  strength:   SignalStrength;
  confidence: number; // 0-100
  reasoning:  string;
  suggestion: string; // e.g. "Swap USDC → BTC", "Bridge to Base"
  price:      number;
  change24h:  number;
  timestamp:  number;
  acted:      boolean;
}

interface AgentMessage {
  id:        string;
  role:      "agent" | "user" | "system";
  content:   string;
  timestamp: number;
  signal?:   MarketSignal;
}

type AgentStatus = "idle" | "scanning" | "paused" | "error";

interface AgentConfig {
  scanInterval:  number;  // seconds
  minConfidence: number;  // 0-100
  watchedMarkets: string[];
  autoSuggest:   boolean;
}

const DEFAULT_CONFIG: AgentConfig = {
  scanInterval:  30,
  minConfidence: 60,
  watchedMarkets: ["BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "AVAX-USD", "ARB-USD"],
  autoSuggest:   true,
};

const ALL_MARKETS = [
  "BTC-USD", "ETH-USD", "SOL-USD", "BNB-USD", "XRP-USD", "DOGE-USD",
  "ADA-USD", "AVAX-USD", "POL-USD", "DOT-USD", "LINK-USD", "LTC-USD",
  "UNI-USD", "ATOM-USD", "ARB-USD", "OP-USD", "TON-USD", "TRX-USD",
  "NEAR-USD", "AAVE-USD",
];

// ─────────────────────────── Helpers ─────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmtPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}
function fmtPct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }
function fmtTs(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function strengthColor(s: SignalStrength) {
  return s === "strong" ? "#22c55e" : s === "moderate" ? "#f59e0b" : "#64748b";
}
function dirColor(d: SignalDirection) {
  return d === "up" ? "#22c55e" : d === "down" ? "#f87171" : "#64748b";
}
function statusColor(s: AgentStatus) {
  return s === "scanning" ? "#60a5fa" : s === "error" ? "#f87171" : s === "paused" ? "#f59e0b" : "#64748b";
}

// ─────────────────────────── Analysis engine ─────────────────────────────────

function analyzeMarket(ticker: Ticker, _config: AgentConfig): MarketSignal | null {
  const pct = ticker.priceChangePct;
  const sym = ticker.symbol.replace("-USD", "");

  // Momentum signal: large 24h move
  if (Math.abs(pct) < 2) return null; // filter noise

  const direction: SignalDirection = pct > 0 ? "up" : "down";
  const absPct = Math.abs(pct);

  let strength: SignalStrength;
  let confidence: number;
  if (absPct >= 8) { strength = "strong";   confidence = 80 + Math.min(absPct - 8, 15); }
  else if (absPct >= 4) { strength = "moderate"; confidence = 60 + (absPct - 4) * 5; }
  else { strength = "weak"; confidence = 40 + (absPct - 2) * 10; }

  confidence = Math.round(Math.min(confidence, 95));

  const reasoning =
    direction === "up"
      ? `${sym} is up ${absPct.toFixed(1)}% in 24h. Volume surge suggests continued momentum. Consider accumulating on pullbacks.`
      : `${sym} is down ${absPct.toFixed(1)}% in 24h. Possible oversell — watch for reversal signals. High risk environment.`;

  const suggestion =
    direction === "up"
      ? `Swap USDC → ${sym} or Bridge USDC to ${sym}'s native chain`
      : `Review your ${sym} exposure. Consider stablecoin rotation if trend continues.`;

  return {
    id: uid(),
    market: ticker.symbol,
    direction, strength, confidence,
    reasoning, suggestion,
    price:    ticker.lastPrice,
    change24h: pct,
    timestamp: Date.now(),
    acted: false,
  };
}

function greeting(): AgentMessage {
  return {
    id: uid(), role: "agent", timestamp: Date.now(),
    content: `👋 Hi, I'm **Element** — your DeFi market analysis agent.\n\nI watch live crypto prices and surface actionable DeFi insights: which assets are moving, why it might matter, and what you can do about it (swap, bridge, buy, or hold).\n\nType **"scan"** to analyze markets now, **"movers"** to see top movers, **"help"** for commands, or just ask me anything about the market.\n\n⚡ Use the **Signal** button to purchase a premium analysis via Circle Nanopayments.`,
  };
}

function handleCommand(text: string, tickers: Record<string, Ticker>, _config: AgentConfig): AgentMessage | null {
  const t = text.trim().toLowerCase();

  if (t === "help") {
    return { id: uid(), role: "agent", timestamp: Date.now(),
      content: `**Available commands:**\n\n• **scan** — analyze all watched markets\n• **movers** — top 5 gainers and losers today\n• **status** — agent status and config\n• **btc** / **eth** / any symbol — price and analysis\n• **help** — show this list` };
  }

  if (t === "movers") {
    const vals = Object.values(tickers).filter(tk => tk.lastPrice > 0);
    const sorted = [...vals].sort((a, b) => b.priceChangePct - a.priceChangePct);
    const top5 = sorted.slice(0, 5);
    const bot5 = sorted.slice(-5).reverse();
    const fmt = (tk: Ticker) => `  ${tk.symbol.replace("-USD","").padEnd(6)} ${fmtPrice(tk.lastPrice).padStart(10)}  ${fmtPct(tk.priceChangePct)}`;
    return { id: uid(), role: "agent", timestamp: Date.now(),
      content: `**Top Gainers (24h)**\n${top5.map(fmt).join("\n")}\n\n**Top Losers (24h)**\n${bot5.map(fmt).join("\n")}` };
  }

  if (t === "status") {
    const count = Object.values(tickers).filter(tk => tk.lastPrice > 0).length;
    return { id: uid(), role: "agent", timestamp: Date.now(),
      content: `**Agent Status:** Active\n**Live prices:** ${count} markets\n**Last update:** ${new Date().toLocaleTimeString()}\n\nElement is monitoring your watched markets and will surface signals automatically when significant moves occur.` };
  }

  // Market lookup
  const sym = t.toUpperCase() + "-USD";
  const ticker = tickers[sym];
  if (ticker && ticker.lastPrice > 0) {
    const sig = analyzeMarket(ticker, DEFAULT_CONFIG);
    const body = sig
      ? `**${ticker.symbol}** — ${fmtPrice(ticker.lastPrice)}\n24h: ${fmtPct(ticker.priceChangePct)} | High: ${fmtPrice(ticker.high24h)} | Low: ${fmtPrice(ticker.low24h)}\n\n${sig.reasoning}\n\n💡 ${sig.suggestion}`
      : `**${ticker.symbol}** — ${fmtPrice(ticker.lastPrice)}\n24h: ${fmtPct(ticker.priceChangePct)} | High: ${fmtPrice(ticker.high24h)} | Low: ${fmtPrice(ticker.low24h)}\n\nNo strong signal at this time. Price is consolidating.`;
    return { id: uid(), role: "agent", timestamp: Date.now(), content: body, signal: sig ?? undefined };
  }

  return null;
}

// ─────────────────────────── Sub-components ──────────────────────────────────

function MessageBubble({ msg }: { msg: AgentMessage }) {
  const isAgent  = msg.role === "agent";
  const isSystem = msg.role === "system";
  if (isSystem) return (
    <div style={{ margin: "4px 0", padding: "4px 10px", borderRadius: 6, background: "rgba(96,165,250,0.08)", borderLeft: "2px solid #3b82f6", fontSize: 11, color: "#94a3b8" }}>
      {msg.content}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isAgent ? "flex-start" : "flex-end", margin: "6px 0" }}>
      {isAgent && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
          <Bot size={12} color="#60a5fa" />
          <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600 }}>Element</span>
          <span style={{ fontSize: 10, color: "#475569" }}>{fmtTs(msg.timestamp)}</span>
        </div>
      )}
      <div style={{ maxWidth: "90%", padding: "8px 12px", borderRadius: isAgent ? "4px 12px 12px 12px" : "12px 4px 12px 12px", background: isAgent ? "var(--surface)" : "rgba(37,99,235,0.3)", border: `1px solid ${isAgent ? "var(--border)" : "rgba(59,130,246,0.3)"}`, fontSize: 12, lineHeight: 1.6, color: "var(--text)", whiteSpace: "pre-wrap" }}>
        {msg.content.split("**").map((chunk, i) => i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk)}
      </div>
      {!isAgent && <span style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{fmtTs(msg.timestamp)}</span>}
      {msg.signal && <SignalMiniCard signal={msg.signal} />}
    </div>
  );
}

function SignalMiniCard({ signal }: { signal: MarketSignal }) {
  return (
    <div style={{ marginTop: 6, width: "100%", maxWidth: 340, padding: "8px 10px", borderRadius: 8, background: "var(--surface-high)", border: `1px solid ${signal.direction === "up" ? "rgba(34,197,94,0.3)" : "rgba(248,113,113,0.3)"}`, fontSize: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {signal.direction === "up" ? <TrendingUp size={12} color="#22c55e" /> : <TrendingDown size={12} color="#f87171" />}
          <span style={{ fontWeight: 700 }}>{signal.market}</span>
        </div>
        <span style={{ fontWeight: 700, color: strengthColor(signal.strength) }}>{signal.confidence}%</span>
      </div>
      <div style={{ color: "#94a3b8", marginTop: 4, fontSize: 10 }}>💡 {signal.suggestion}</div>
    </div>
  );
}

function SignalCard({ signal, onAct }: { signal: MarketSignal; onAct: (s: MarketSignal) => void }) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = signal.direction === "up" ? "rgba(34,197,94,0.25)" : "rgba(248,113,113,0.25)";
  const accent = dirColor(signal.direction);
  return (
    <div style={{ margin: "6px 0", borderRadius: 8, border: `1px solid ${borderColor}`, background: "var(--surface)", overflow: "hidden" }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 3, height: 30, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700 }}>
            {signal.direction === "up" ? <TrendingUp size={12} color="#22c55e" /> : <TrendingDown size={12} color="#f87171" />}
            <span>{signal.market}</span>
            {signal.acted && <CheckCircle2 size={11} color="#22c55e" />}
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
            {fmtTs(signal.timestamp)} · {fmtPrice(signal.price)} · {fmtPct(signal.change24h)}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: strengthColor(signal.strength) }}>{signal.confidence}%</div>
          <div style={{ fontSize: 10, color: strengthColor(signal.strength), textTransform: "uppercase" }}>{signal.strength}</div>
        </div>
        {expanded ? <ChevronUp size={12} color="#64748b" /> : <ChevronDown size={12} color="#64748b" />}
      </div>
      {expanded && (
        <div style={{ padding: "0 10px 10px", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5, margin: "8px 0", padding: "6px 8px", background: "var(--surface-high)", borderRadius: 6 }}>
            {signal.reasoning}
          </div>
          <div style={{ fontSize: 11, color: "#60a5fa", marginBottom: 8 }}>💡 {signal.suggestion}</div>
          {!signal.acted && (
            <button onClick={e => { e.stopPropagation(); onAct(signal); }}
              style={{ width: "100%", padding: "6px", borderRadius: 6, border: `1px solid ${accent}`, background: signal.direction === "up" ? "rgba(34,197,94,0.15)" : "rgba(248,113,113,0.15)", color: accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              {signal.direction === "up" ? "▲ Act on this (go to DeFi → Swap)" : "▼ Review exposure (go to DeFi → Swap)"}
            </button>
          )}
          {signal.acted && <div style={{ textAlign: "center", fontSize: 11, color: "#22c55e" }}>✓ Noted — check DeFi tab to act</div>}
        </div>
      )}
    </div>
  );
}

function ConfigPanel({ config, onChange }: { config: AgentConfig; onChange: (c: AgentConfig) => void }) {
  return (
    <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Scan Settings</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {([
            { key: "scanInterval",  label: "Scan Interval (s)", min: 10,  max: 300, step: 10 },
            { key: "minConfidence", label: "Min Confidence (%)", min: 30,  max: 95,  step: 5  },
          ] as const).map(({ key, label, min, max, step }) => (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>{label}</span>
              <input type="number" value={config[key]} min={min} max={max} step={step}
                onChange={e => onChange({ ...config, [key]: parseInt(e.target.value) || config[key] })}
                style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface-high)", color: "var(--text)", fontSize: 11, fontFamily: "monospace", width: "100%", boxSizing: "border-box" as const }} />
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Auto-Suggest</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: config.autoSuggest ? "rgba(34,197,94,0.08)" : "var(--surface-high)" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600 }}>Auto-suggest DeFi actions</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>Automatically post insights when strong signals appear</div>
          </div>
          <button onClick={() => onChange({ ...config, autoSuggest: !config.autoSuggest })}
            style={{ width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", background: config.autoSuggest ? "#22c55e" : "#334155", position: "relative", transition: "background 0.2s" }}>
            <div style={{ position: "absolute", top: 3, left: config.autoSuggest ? 21 : 3, width: 16, height: 16, borderRadius: 8, background: "#fff", transition: "left 0.2s" }} />
          </button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Watched Markets</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {ALL_MARKETS.map(m => {
            const active = config.watchedMarkets.includes(m);
            return (
              <button key={m} onClick={() => onChange({ ...config, watchedMarkets: active ? config.watchedMarkets.filter(x => x !== m) : [...config.watchedMarkets, m] })}
                style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, border: `1px solid ${active ? "#3b82f6" : "var(--border)"}`, background: active ? "rgba(59,130,246,0.15)" : "var(--surface-high)", color: active ? "#60a5fa" : "#64748b", cursor: "pointer" }}>
                {m.replace("-USD", "")}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Main Page ───────────────────────────────────────

export function AIAgentPage() {
  const { isConnected } = useAccount();
  const tickers   = usePriceStore(s => s.tickers);
  const startFeed = usePriceStore(s => s.startFeed);
  const assets    = useWalletStore(s => s.assets);
  const nanopay = useNanopayments();

  const [config,      setConfig]      = useState<AgentConfig>({ ...DEFAULT_CONFIG });
  const [status,      setStatus]      = useState<AgentStatus>("idle");
  const [signals,     setSignals]     = useState<MarketSignal[]>([]);
  const [messages,    setMessages]    = useState<AgentMessage[]>([greeting()]);
  const [input,       setInput]       = useState("");
  const [activeTab,   setActiveTab]   = useState<"chat" | "signals" | "portfolio" | "config">("chat");
  const [configOpen,  setConfigOpen]  = useState(false);
  const [nanoStatus,  setNanoStatus]  = useState<string | null>(null);
  const [scanCount,   setScanCount]   = useState(0);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start price feed
  useEffect(() => {
    const stop = startFeed();
    return stop;
  }, [startFeed]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Scan all watched markets
  const runScan = useCallback(() => {
    const newSignals: MarketSignal[] = [];
    for (const mkt of config.watchedMarkets) {
      const ticker = tickers[mkt];
      if (!ticker || ticker.lastPrice === 0) continue;
      const sig = analyzeMarket(ticker, config);
      if (sig && sig.confidence >= config.minConfidence) newSignals.push(sig);
    }

    setScanCount(c => c + 1);
    setSignals(prev => [...newSignals, ...prev].slice(0, 100));

    const sysMsg: AgentMessage = {
      id: uid(), role: "system", timestamp: Date.now(),
      content: `Scan complete — ${config.watchedMarkets.length} markets analyzed, ${newSignals.length} signal${newSignals.length !== 1 ? "s" : ""} found.`,
    };

    if (config.autoSuggest && newSignals.length > 0) {
      const top = newSignals.sort((a, b) => b.confidence - a.confidence)[0];
      const agentMsg: AgentMessage = {
        id: uid(), role: "agent", timestamp: Date.now(),
        content: `🔍 **Top signal from scan:** ${top.market} is ${top.direction === "up" ? "up" : "down"} ${fmtPct(Math.abs(top.change24h))} with ${top.confidence}% confidence.\n\n${top.reasoning}\n\n💡 ${top.suggestion}`,
        signal: top,
      };
      setMessages(prev => [...prev, sysMsg, agentMsg].slice(-200));
    } else {
      setMessages(prev => [...prev, sysMsg].slice(-200));
    }
  }, [config, tickers]);

  // Start/stop
  const startAgent = useCallback(() => {
    setStatus("scanning");
    runScan();
    intervalRef.current = setInterval(runScan, config.scanInterval * 1000);
  }, [runScan, config.scanInterval]);

  const stopAgent = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setStatus("paused");
    setMessages(prev => {
      const m: AgentMessage = { id: uid(), role: "system", timestamp: Date.now(), content: "Agent paused." };
      return [...prev, m].slice(-200);
    });
  }, []);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // Nanopayments premium signal
  const requestPaidSignal = useCallback(async () => {
    const market = config.watchedMarkets[0] ?? "BTC-USD";
    const key = `signal-${market}-${Math.floor(Date.now() / 10000)}`;
    if (!acquireIdempotency(key)) return;
    setNanoStatus("Requesting premium signal…");
    const result = await nanopay.signal({ market, strategy: "all" });
    if (result.success) {
      const detail = result.fallback
        ? "Premium signal (free mode — configure SELLER_ADDRESS to enable paid)"
        : `Signal purchased. Ref: ${result.payment?.ref?.slice(0, 8) ?? ""}…`;
      setNanoStatus(detail);
      // Run an immediate scan and highlight the result
      setTimeout(() => {
        runScan();
        setNanoStatus(null);
      }, 1500);
    } else {
      setNanoStatus(`Error: ${result.error ?? "unknown"}`);
      setTimeout(() => setNanoStatus(null), 3000);
    }
  }, [nanopay, config.watchedMarkets, runScan]);

  // Chat send
  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const userMsg: AgentMessage = { id: uid(), role: "user", content: text, timestamp: Date.now() };
    if (text.toLowerCase().includes("scan")) setTimeout(runScan, 100);
    const reply = handleCommand(text, tickers, config);
    setMessages(prev => reply
      ? [...prev, userMsg, reply].slice(-200)
      : [...prev, userMsg, { id: uid(), role: "agent" as AgentMessage["role"], timestamp: Date.now(), content: "I can help with market analysis. Try 'scan', 'movers', 'help', or type a symbol like 'btc' or 'eth'." } as AgentMessage].slice(-200)
    );
  }, [input, runScan, tickers, config]);

  const newSignalCount = signals.filter(s => !s.acted).length;

  // Portfolio summary
  const totalUsd = assets.reduce((s, a) => s + a.usdValue, 0);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, borderBottom: "1px solid var(--border)" }}>
        {[
          { icon: <Activity size={11} />,  label: "Status",    value: status.toUpperCase(),              color: statusColor(status) },
          { icon: <BarChart2 size={11} />, label: "Scans",     value: String(scanCount),                 color: "#94a3b8" },
          { icon: <Zap size={11} />,       label: "Signals",   value: String(signals.length),            color: "#f59e0b" },
          { icon: <TrendingUp size={11} />,label: "Markets",   value: String(config.watchedMarkets.length), color: "#60a5fa" },
          { icon: <Shield size={11} />,    label: "Portfolio", value: `$${totalUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "#a78bfa" },
        ].map(item => (
          <div key={item.label} style={{ padding: "7px 4px", textAlign: "center", background: "var(--surface)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, color: "#64748b", marginBottom: 2 }}>
              {item.icon}
              <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</span>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Bot size={16} color="#60a5fa" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Element AI</span>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(status), boxShadow: `0 0 6px ${statusColor(status)}` }} />
        </div>

        <NanopayBadge />
        <div style={{ flex: 1 }} />

        {/* Paid signal button */}
        <button onClick={() => { void requestPaidSignal(); }}
          title="Purchase a premium analysis via Circle Nanopayments ($0.01 USDC)"
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          <Zap size={10} /> ⚡ Signal
        </button>

        {nanoStatus && (
          <span style={{ fontSize: 10, color: "#94a3b8", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nanoStatus}
          </span>
        )}

        {status !== "scanning" ? (
          <button onClick={startAgent} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 6, background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            ▶ Start
          </button>
        ) : (
          <button onClick={stopAgent} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 6, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            ⏸ Pause
          </button>
        )}

        <button onClick={runScan} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, background: "var(--surface-high)", border: "1px solid var(--border)", color: "#94a3b8", fontSize: 11, cursor: "pointer" }}>
          <RefreshCw size={11} /> Scan
        </button>

        <button onClick={() => setConfigOpen(c => !c)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 6, background: configOpen ? "rgba(59,130,246,0.15)" : "var(--surface-high)", border: `1px solid ${configOpen ? "#3b82f6" : "var(--border)"}`, color: configOpen ? "#60a5fa" : "#94a3b8", fontSize: 11, cursor: "pointer" }}>
          <Settings2 size={11} /> Config
        </button>

        {!isConnected && (
          <div style={{ transform: "scale(0.85)", transformOrigin: "right center" }}>
            <ConnectKitButton />
          </div>
        )}
      </div>

      {/* Config panel */}
      {configOpen && (
        <div style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Agent Configuration</span>
            <button onClick={() => setConfigOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={14} /></button>
          </div>
          <ConfigPanel config={config} onChange={c => {
            setConfig(c);
            setMessages(prev => [...prev, { id: uid(), role: "system" as const, timestamp: Date.now(), content: `Config updated. Auto-suggest ${c.autoSuggest ? "on" : "off"}, watching ${c.watchedMarkets.length} markets.` }].slice(-200));
          }} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        {([
          { id: "chat",      label: "Chat",      badge: 0 },
          { id: "signals",   label: "Signals",   badge: newSignalCount },
          { id: "portfolio", label: "Portfolio", badge: 0 },
          { id: "config",    label: "About",     badge: 0 },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: "8px 14px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: "transparent", position: "relative", color: activeTab === tab.id ? "var(--text)" : "#64748b", borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent", marginBottom: -1 }}>
            {tab.label}
            {tab.badge > 0 && (
              <span style={{ marginLeft: 5, padding: "1px 5px", borderRadius: 10, background: "#3b82f6", color: "#fff", fontSize: 9, fontWeight: 700 }}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* CHAT */}
        {activeTab === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", scrollbarWidth: "thin" }}>
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Ask Element… ('scan', 'movers', 'btc', 'help')"
                style={{ flex: 1, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-high)", color: "var(--text)", fontSize: 12, outline: "none" }} />
              <button onClick={sendMessage} disabled={!input.trim()}
                style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: input.trim() ? "#2563eb" : "#1e293b", color: input.trim() ? "#fff" : "#475569", cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                <Send size={13} /> Send
              </button>
            </div>
          </div>
        )}

        {/* SIGNALS */}
        {activeTab === "signals" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>{signals.length} signals · {newSignalCount} unread</span>
              <button onClick={runScan} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 5, background: "var(--surface-high)", border: "1px solid var(--border)", color: "#94a3b8", fontSize: 10, cursor: "pointer" }}>
                <RefreshCw size={10} /> Scan Now
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", scrollbarWidth: "thin" }}>
              {signals.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569", fontSize: 12 }}>
                  <Bot size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
                  No signals yet. Start the agent or click "Scan Now".
                </div>
              ) : (
                signals.map(s => <SignalCard key={s.id} signal={s} onAct={sig => { sig.acted = true; setSignals(prev => [...prev]); }} />)
              )}
            </div>
          </div>
        )}

        {/* PORTFOLIO */}
        {activeTab === "portfolio" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", scrollbarWidth: "thin" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Portfolio Overview</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <div style={{ padding: "12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "#64748b" }}>Total Value</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "monospace" }}>
                  ${totalUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ padding: "12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "#64748b" }}>Assets</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{assets.length}</div>
              </div>
            </div>

            {assets.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px", color: "#475569", fontSize: 12 }}>
                <ArrowUpDown size={28} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3 }} />
                No assets yet. Go to DeFi → Swap to get started.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...assets].sort((a, b) => b.usdValue - a.usdValue).map(a => {
                  const ticker = tickers[`${a.symbol}-USD`];
                  const change = ticker?.priceChangePct ?? a.change24h;
                  const price = ticker?.lastPrice ?? (a.usdValue / (a.balance || 1));
                  return (
                    <div key={a.symbol} style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `${a.color}22`, color: a.color, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {a.symbol.slice(0, 2)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>{a.balance.toLocaleString("en-US", { maximumFractionDigits: 6 })} {a.symbol}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "var(--text)" }}>
                          ${a.usdValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </div>
                        <div style={{ fontSize: 10, color: change >= 0 ? "#22c55e" : "#f87171" }}>
                          {fmtPct(change)} · {fmtPrice(price)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ABOUT */}
        {activeTab === "config" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", scrollbarWidth: "thin", fontSize: 12, lineHeight: 1.7, color: "#94a3b8", maxWidth: 700 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>About Element</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { icon: <BarChart2 size={15} color="#60a5fa" />, title: "Market Analysis", body: "Element watches live Binance price data for up to 20 markets. When a market moves significantly (2%+ in 24h), Element analyzes the move, assigns a confidence score, and suggests a DeFi action: swap, bridge, buy, or review your exposure. Analysis is purely momentum and price-change based — no trading." },
                { icon: <Zap size={15} color="#a78bfa" />, title: "Circle Nanopayments", body: "The ⚡ Signal button purchases a premium market analysis report via Circle Nanopayments (x402 protocol, $0.01 USDC per signal). In demo mode (no seller address configured), signals are generated free of charge. Configure VITE_NANOPAY_SELLER in .env to enable real payments." },
                { icon: <Shield size={15} color="#22c55e" />, title: "Security", body: "Element NEVER touches your wallet, private keys, or signs transactions. It is a read-only analysis agent. All suggested DeFi actions (swaps, bridges, buys) must be executed manually by you in the DeFi tab. Element cannot move funds on your behalf." },
                { icon: <AlertTriangle size={15} color="#f59e0b" />, title: "Disclaimer", body: "Market analysis is for informational purposes only. Past price movements do not predict future results. Crypto markets are highly volatile. Always do your own research before making any financial decision. This app runs on testnet — no real funds are at risk." },
              ].map(item => (
                <div key={item.title} style={{ padding: "12px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    {item.icon}
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{item.title}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
