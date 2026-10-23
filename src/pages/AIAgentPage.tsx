/**
 * Element — AI Assistant
 *
 * Fully functional AI assistant with:
 * - Real backend chat via /api/ai/chat (built-in intent engine + optional LLM)
 * - Voice input via Web Speech API (speech-to-text)
 * - Spoken responses via Web Speech Synthesis API (TTS)
 * - Persistent conversation history (per session, server-side)
 * - Market signals tab (live analysis engine)
 * - Portfolio tab
 * - System diagnostics tab
 */

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import {
  Bot, Send, Mic, MicOff, Volume2, VolumeX, RefreshCw,
  Settings2, TrendingUp, TrendingDown, Zap, BarChart2,
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  X, Activity, ArrowUpDown, Shield, Clock, Trash2,
  Wifi, WifiOff, Info,
} from "lucide-react";
import { usePriceStore, type Ticker } from "@/store/priceStore";
import { useWalletStore }              from "@/store/walletStore";
import { useNanopayments, acquireIdempotency } from "@/lib/nanopayments";
import { NanopayBadge }               from "@/components/NanopaymentStatus";
import { CryptoIcon }                 from "@/components/AssetIcons";

// ─── Types ───────────────────────────────────────────────────────────────────

type MsgRole     = "user" | "assistant" | "system";
type VoiceState  = "idle" | "listening" | "processing" | "speaking" | "error";
type ActiveTab   = "chat" | "signals" | "portfolio" | "history" | "status" | "engineer";

interface UIMessage {
  id:        string;
  role:      MsgRole;
  content:   string;
  timestamp: number;
  intent?:   string;
  pending?:  boolean;
}

type SignalDirection = "up" | "down";
type SignalStrength  = "strong" | "moderate" | "weak";

interface MarketSignal {
  id:         string;
  market:     string;
  direction:  SignalDirection;
  strength:   SignalStrength;
  confidence: number;
  reasoning:  string;
  suggestion: string;
  price:      number;
  change24h:  number;
  timestamp:  number;
  acted:      boolean;
}

interface AgentStatus {
  scanning:    boolean;
  scanCount:   number;
}

interface DiagStatus {
  llmAvailable:  boolean;
  llmProvider:   string;
  activeSessions: number;
  capabilities:  string[];
  missingConfig: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function fmtTs(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function fmtPrice(p: number) {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (p >= 1)    return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}
function fmtPct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`; }

// ─── Session ID — stable per browser tab ─────────────────────────────────────

function getSessionId(): string {
  let id = sessionStorage.getItem("element-session");
  if (!id) { id = `sess_${uid()}`; sessionStorage.setItem("element-session", id); }
  return id;
}

// ─── Backend API ─────────────────────────────────────────────────────────────

interface ChatRequest {
  sessionId: string;
  message:   string;
  walletId?: string;
  context?:  Record<string, unknown>;
}

interface ChatResponse {
  messageId:    string;
  reply:        string;
  intent?:      string;
  capabilities: string[];
}

async function apiFetch<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// ─── Voice helpers (Web Speech API) ──────────────────────────────────────────

// ── Speech API types (not in all lib.dom versions) ──────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWindow = Window & typeof globalThis & Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRec = any;

const SPEECH_SUPPORTED = typeof window !== "undefined" &&
  ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
const TTS_SUPPORTED = typeof window !== "undefined" && "speechSynthesis" in window;

function createRecognition(): SpeechRec | null {
  if (!SPEECH_SUPPORTED) return null;
  const w = window as AnyWindow;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  const r: SpeechRec = new R();
  r.continuous     = false;
  r.interimResults = false;
  r.lang           = "en-US";
  return r;
}

function speak(text: string, onEnd?: () => void) {
  if (!TTS_SUPPORTED) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  // Strip markdown before speaking
  const plain = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/#{1,3} /g, "")
    .replace(/• /g, "")
    .slice(0, 500); // limit length
  const utt = new SpeechSynthesisUtterance(plain);
  utt.rate  = 1.05;
  utt.pitch = 1.0;
  if (onEnd) utt.onend = onEnd;
  window.speechSynthesis.speak(utt);
}

// ─── Market analysis engine ───────────────────────────────────────────────────

function analyzeMarket(ticker: Ticker): MarketSignal | null {
  const pct   = ticker.priceChangePct;
  const sym   = ticker.symbol.replace("-USD", "");
  if (Math.abs(pct) < 2) return null;

  const direction: SignalDirection = pct > 0 ? "up" : "down";
  const absPct = Math.abs(pct);
  let strength: SignalStrength;
  let confidence: number;
  if (absPct >= 8)      { strength = "strong";   confidence = 80 + Math.min(absPct - 8, 15); }
  else if (absPct >= 4) { strength = "moderate"; confidence = 60 + (absPct - 4) * 5; }
  else                  { strength = "weak";      confidence = 40 + (absPct - 2) * 10; }
  confidence = Math.round(Math.min(confidence, 95));

  const reasoning = direction === "up"
    ? `${sym} is up ${absPct.toFixed(1)}% in 24h. Volume surge suggests continued momentum.`
    : `${sym} is down ${absPct.toFixed(1)}% in 24h. Possible oversell — watch for reversal.`;

  const suggestion = direction === "up"
    ? `Consider Swap USDC → ${sym} or Bridge USDC to ${sym}'s native chain.`
    : `Review your ${sym} exposure. Consider stablecoin rotation if trend continues.`;

  return {
    id: uid(), market: ticker.symbol, direction, strength, confidence,
    reasoning, suggestion, price: ticker.lastPrice,
    change24h: pct, timestamp: Date.now(), acted: false,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MsgBubble({ msg }: { msg: UIMessage }) {
  const isUser    = msg.role === "user";
  const isSystem  = msg.role === "system";

  if (isSystem) return (
    <div className="mx-2 my-1 px-3 py-1.5 rounded text-xs"
      style={{ background: "rgba(96,165,250,0.08)", borderLeft: "2px solid #3b82f6", color: "#94a3b8" }}>
      {msg.content}
    </div>
  );

  return (
    <div className={`flex flex-col my-2 ${isUser ? "items-end" : "items-start"} px-3`}>
      {!isUser && (
        <div className="flex items-center gap-1 mb-1">
          <Bot size={11} color="#60a5fa" />
          <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700 }}>Element</span>
          <span style={{ fontSize: 10, color: "#475569" }}>{fmtTs(msg.timestamp)}</span>
        </div>
      )}
      <div className="max-w-xs sm:max-w-sm rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap"
        style={{
          background:  isUser ? "rgba(37,99,235,0.35)" : "var(--surface)",
          border:      `1px solid ${isUser ? "rgba(59,130,246,0.3)" : "var(--border)"}`,
          borderRadius: isUser ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
          color: "var(--text)",
          opacity: msg.pending ? 0.6 : 1,
        }}>
        {msg.pending
          ? <span className="animate-pulse">Thinking…</span>
          : msg.content.split("**").map((chunk, i) =>
              i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk
            )
        }
      </div>
      {isUser && <span style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{fmtTs(msg.timestamp)}</span>}
    </div>
  );
}

function SignalCard({ signal, onAct }: { signal: MarketSignal; onAct: (s: MarketSignal) => void }) {
  const [open, setOpen] = useState(false);
  const accent = signal.direction === "up" ? "#22c55e" : "#f87171";
  const border = signal.direction === "up" ? "rgba(34,197,94,0.2)" : "rgba(248,113,113,0.2)";

  return (
    <div className="mx-3 my-1.5 rounded-lg overflow-hidden"
      style={{ border: `1px solid ${border}`, background: "var(--surface)" }}>
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div style={{ width: 3, height: 28, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            {signal.direction === "up" ? <TrendingUp size={11} color="#22c55e" /> : <TrendingDown size={11} color="#f87171" />}
            <span>{signal.market}</span>
            {signal.acted && <CheckCircle2 size={10} color="#22c55e" />}
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
            {fmtTs(signal.timestamp)} · {fmtPrice(signal.price)} · {fmtPct(signal.change24h)}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>{signal.confidence}%</div>
          <div style={{ fontSize: 9, color: accent, textTransform: "uppercase" }}>{signal.strength}</div>
        </div>
        {open ? <ChevronUp size={12} color="#64748b" /> : <ChevronDown size={12} color="#64748b" />}
      </div>
      {open && (
        <div className="px-3 pb-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="text-xs leading-relaxed mt-2 mb-2 px-2 py-1.5 rounded"
            style={{ background: "var(--surface-high)", color: "#94a3b8" }}>{signal.reasoning}</div>
          <div className="text-xs mb-2" style={{ color: "#60a5fa" }}>💡 {signal.suggestion}</div>
          {!signal.acted ? (
            <button onClick={e => { e.stopPropagation(); onAct(signal); }}
              className="w-full py-1.5 rounded text-xs font-semibold"
              style={{ border: `1px solid ${accent}`, background: signal.direction === "up" ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.12)", color: accent, cursor: "pointer" }}>
              {signal.direction === "up" ? "▲ Go to DeFi → Swap" : "▼ Review in DeFi"}
            </button>
          ) : (
            <div className="text-center text-xs" style={{ color: "#22c55e" }}>✓ Noted — check DeFi tab</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AIAgentPage() {
  const tickers   = usePriceStore(s => s.tickers);
  const startFeed = usePriceStore(s => s.startFeed);
  const assets    = useWalletStore(s => s.assets);
  // walletId is managed by the native wallet hook; pass undefined when not available
  const walletId: string | undefined = undefined;
  const nanopay   = useNanopayments();

  const sessionId = useMemo(() => getSessionId(), []);

  // ── Chat state ────────────────────────────────────────────────────────────
  const [messages,   setMessages]   = useState<UIMessage[]>([]);
  const [input,      setInput]      = useState("");
  const [sending,    setSending]    = useState(false);
  const [backendUp,  setBackendUp]  = useState<boolean | null>(null);
  const [diagStatus, setDiagStatus] = useState<DiagStatus | null>(null);

  // ── Voice state ────────────────────────────────────────────────────────────
  const [voiceState,  setVoiceState]  = useState<VoiceState>("idle");
  const [ttsEnabled,  setTtsEnabled]  = useState(false);
  const [voiceError,  setVoiceError]  = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRec | null>(null);

  // ── Signals state ─────────────────────────────────────────────────────────
  const [signals,     setSignals]     = useState<MarketSignal[]>([]);
  const [agentSt,     setAgentSt]     = useState<AgentStatus>({ scanning: false, scanCount: 0 });
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Tab + misc ─────────────────────────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState<ActiveTab>("chat");
  const [nanoStatus,  setNanoStatus]  = useState<string | null>(null);
  const chatEndRef    = useRef<HTMLDivElement>(null);

  // ── Boot ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const stop = startFeed();
    return stop;
  }, [startFeed]);

  // Check backend and load diagnostics
  useEffect(() => {
    void apiFetch<DiagStatus>("/api/ai/status", "GET").then(d => {
      setBackendUp(d !== null);
      if (d) setDiagStatus(d);
    });
  }, []);

  // Load conversation history from server on mount
  useEffect(() => {
    void apiFetch<{ messages: { id: string; role: MsgRole; content: string; timestamp: number; intent?: string }[] }>(
      `/api/ai/history/${sessionId}`, "GET"
    ).then(data => {
      if (data?.messages?.length) {
        setMessages(data.messages.map(m => ({ ...m })));
      } else {
        // First time — show greeting
        setMessages([{
          id: uid(), role: "assistant", timestamp: Date.now(),
          content: `👋 Hi, I'm **Element** — your RushPay AI assistant.\n\nI can help with:\n• Crypto prices and market analysis\n• Your portfolio and balances\n• How to use any feature\n• Transaction troubleshooting\n• App diagnostics\n\nType a message or tap the mic to speak. Try **"scan markets"**, **"show my portfolio"**, or **"how do I send crypto?"**.`,
        }]);
      }
    });
  }, [sessionId]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);

    const userMsg: UIMessage = { id: uid(), role: "user", content: msg, timestamp: Date.now() };
    const pendingMsg: UIMessage = { id: uid(), role: "assistant", content: "", timestamp: Date.now(), pending: true };
    setMessages(prev => [...prev, userMsg, pendingMsg]);

    const req: ChatRequest = {
      sessionId,
      message: msg,
      walletId,
      context: {
        assets: assets.slice(0, 15).map(a => ({ symbol: a.symbol, name: a.name, balance: a.balance, usdValue: a.usdValue, network: a.network })),
        tickers: Object.fromEntries(
          Object.entries(tickers).filter(([, t]) => t.lastPrice > 0).slice(0, 25)
        ),
      },
    };

    const res = await apiFetch<ChatResponse>("/api/ai/chat", "POST", req);
    const reply = res?.reply ?? "I'm having trouble connecting to the AI backend. Make sure the server is running on port 3001.";

    const replyMsg: UIMessage = {
      id: res?.messageId ?? uid(),
      role: "assistant",
      content: reply,
      timestamp: Date.now(),
      intent: res?.intent,
    };

    setMessages(prev => [...prev.filter(m => !m.pending), replyMsg]);
    setSending(false);

    if (ttsEnabled && voiceState !== "speaking") {
      setVoiceState("speaking");
      speak(reply, () => setVoiceState("idle"));
    }
  }, [input, sending, sessionId, walletId, assets, tickers, ttsEnabled, voiceState]);

  // ── Voice input ────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!SPEECH_SUPPORTED) {
      setVoiceError("Speech recognition not supported in this browser. Try Chrome.");
      return;
    }
    if (voiceState === "listening") {
      recognitionRef.current?.stop();
      setVoiceState("idle");
      return;
    }

    setVoiceError(null);
    const rec = createRecognition();
    if (!rec) return;
    recognitionRef.current = rec;

    rec.onstart   = () => setVoiceState("listening");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult  = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const transcript = (e.results[0]?.[0]?.transcript as string | undefined)?.trim() ?? "";
      if (transcript) {
        setVoiceState("processing");
        void sendMessage(transcript);
      } else {
        setVoiceState("idle");
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror   = (e: any) => {
      setVoiceState("error");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      setVoiceError(`Voice error: ${String(e.error ?? "unknown")}. Try again or type your message.`);
      setTimeout(() => setVoiceState("idle"), 3000);
    };
    rec.onend     = () => { setVoiceState(s => s === "listening" ? "idle" : s); };
    rec.start();
  }, [voiceState, sendMessage]);

  const stopSpeaking = useCallback(() => {
    if (TTS_SUPPORTED) window.speechSynthesis.cancel();
    setVoiceState("idle");
  }, []);

  // ── Market scan ────────────────────────────────────────────────────────────

  const runScan = useCallback(() => {
    const newSigs: MarketSignal[] = [];
    for (const [, ticker] of Object.entries(tickers)) {
      if (!ticker.lastPrice) continue;
      const sig = analyzeMarket(ticker);
      if (sig && sig.confidence >= 60) newSigs.push(sig);
    }
    setSignals(prev => [...newSigs, ...prev].slice(0, 100));
    setAgentSt(s => ({ ...s, scanCount: s.scanCount + 1 }));
  }, [tickers]);

  const toggleScan = useCallback(() => {
    if (agentSt.scanning) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      setAgentSt(s => ({ ...s, scanning: false }));
    } else {
      runScan();
      intervalRef.current = setInterval(runScan, 30_000);
      setAgentSt(s => ({ ...s, scanning: true }));
    }
  }, [agentSt.scanning, runScan]);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  // ── Premium signal ─────────────────────────────────────────────────────────

  const requestPaidSignal = useCallback(async () => {
    const market = "BTC-USD";
    const key    = `signal-${market}-${Math.floor(Date.now() / 10000)}`;
    if (!acquireIdempotency(key)) return;
    setNanoStatus("Requesting premium signal…");
    const result = await nanopay.signal({ market, strategy: "all" });
    if (result.success) {
      setNanoStatus(result.fallback ? "Free mode — configure VITE_NANOPAY_SELLER to enable paid" : `Signal purchased. Ref: ${result.payment?.ref?.slice(0, 8) ?? ""}…`);
      setTimeout(() => { runScan(); setNanoStatus(null); }, 1500);
    } else {
      setNanoStatus(`Error: ${result.error ?? "unknown"}`);
      setTimeout(() => setNanoStatus(null), 3000);
    }
  }, [nanopay, runScan]);

  // ── Clear history ──────────────────────────────────────────────────────────

  const clearHistory = useCallback(async () => {
    await apiFetch("/api/ai/clear", "POST", { sessionId });
    setMessages([{
      id: uid(), role: "assistant", timestamp: Date.now(),
      content: "Conversation cleared. How can I help you?",
    }]);
  }, [sessionId]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalUsd      = assets.reduce((s, a) => s + a.usdValue, 0);
  const newSignalCount = signals.filter(s => !s.acted).length;

  const voiceIcon  = voiceState === "listening" ? <MicOff size={15} color="#f87171" /> : <Mic size={15} color="#60a5fa" />;
  const voiceColor = voiceState === "listening" ? "rgba(248,113,113,0.15)" : voiceState === "error" ? "rgba(248,113,113,0.08)" : "var(--surface-high)";
  const voiceBorder = voiceState === "listening" ? "1px solid rgba(248,113,113,0.4)" : "1px solid var(--border)";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)" }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface)", flexWrap: "wrap" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Bot size={16} color="#60a5fa" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Element AI</span>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: backendUp === null ? "#f59e0b" : backendUp ? "#22c55e" : "#f87171",
            boxShadow: `0 0 6px ${backendUp ? "#22c55e" : "#f87171"}`,
          }} title={backendUp === null ? "Connecting…" : backendUp ? "Backend connected" : "Backend offline"} />
        </div>

        <NanopayBadge />
        <div style={{ flex: 1 }} />

        {/* TTS toggle */}
        {TTS_SUPPORTED && (
          <button onClick={() => { if (ttsEnabled) stopSpeaking(); setTtsEnabled(e => !e); }}
            title={ttsEnabled ? "Mute spoken responses" : "Enable spoken responses"}
            style={{ padding: "4px 8px", borderRadius: 6, background: ttsEnabled ? "rgba(96,165,250,0.12)" : "var(--surface-high)", border: `1px solid ${ttsEnabled ? "#3b82f6" : "var(--border)"}`, color: ttsEnabled ? "#60a5fa" : "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
            {ttsEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            {ttsEnabled ? "TTS On" : "TTS Off"}
          </button>
        )}

        {/* Stop speaking */}
        {voiceState === "speaking" && (
          <button onClick={stopSpeaking}
            style={{ padding: "4px 8px", borderRadius: 6, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <X size={11} /> Stop
          </button>
        )}

        {/* Premium signal */}
        <button onClick={() => { void requestPaidSignal(); }}
          title="Purchase premium signal via Nanopayments"
          style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <Zap size={10} /> Signal
        </button>

        {/* Scan toggle */}
        <button onClick={toggleScan}
          style={{ padding: "4px 10px", borderRadius: 6, background: agentSt.scanning ? "rgba(34,197,94,0.12)" : "var(--surface-high)", border: `1px solid ${agentSt.scanning ? "rgba(34,197,94,0.4)" : "var(--border)"}`, color: agentSt.scanning ? "#22c55e" : "#94a3b8", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
          {agentSt.scanning ? "⏸ Pause" : "▶ Scan"}
        </button>
      </div>

      {/* nano status */}
      {nanoStatus && (
        <div style={{ padding: "3px 12px", fontSize: 10, color: "#94a3b8", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          {nanoStatus}
        </div>
      )}

      {/* voice error */}
      {voiceError && (
        <div style={{ padding: "4px 12px", fontSize: 11, color: "#fbbf24", background: "rgba(245,158,11,0.08)", borderBottom: "1px solid rgba(245,158,11,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠ {voiceError}</span>
          <button onClick={() => setVoiceError(null)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}><X size={12} /></button>
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        {([
          { id: "chat" as const,      label: "Chat",      badge: 0 },
          { id: "signals" as const,   label: "Signals",   badge: newSignalCount },
          { id: "portfolio" as const, label: "Portfolio", badge: 0 },
          { id: "engineer" as const,  label: "Control",   badge: 0 },
          { id: "status" as const,    label: "Status",    badge: 0 },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ flex: 1, padding: "7px 4px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: "transparent", color: activeTab === tab.id ? "var(--text)" : "#64748b", borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent", marginBottom: -1, position: "relative" }}>
            {tab.label}
            {tab.badge > 0 && (
              <span style={{ marginLeft: 3, padding: "1px 4px", borderRadius: 8, background: "#3b82f6", color: "#fff", fontSize: 9 }}>{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderBottom: "1px solid var(--border)" }}>
        {[
          { icon: <Activity size={10} />, label: "Status",   value: backendUp ? "Online" : "Offline", color: backendUp ? "#22c55e" : "#f87171" },
          { icon: <BarChart2 size={10} />, label: "Scans",   value: String(agentSt.scanCount),         color: "#94a3b8" },
          { icon: <Zap size={10} />,       label: "Signals", value: String(signals.length),            color: "#f59e0b" },
          { icon: <Shield size={10} />,    label: "Portfolio",value: `$${totalUsd.toFixed(0)}`,        color: "#a78bfa" },
        ].map(item => (
          <div key={item.label} style={{ padding: "5px 4px", textAlign: "center", background: "var(--surface)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, color: "#64748b", marginBottom: 1 }}>
              {item.icon}
              <span style={{ fontSize: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: item.color }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* CHAT TAB */}
        {activeTab === "chat" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, overflowY: "auto", paddingTop: 8, scrollbarWidth: "thin" }}>
              {messages.map(m => <MsgBubble key={m.id} msg={m} />)}
              <div ref={chatEndRef} />
            </div>

            {/* Voice listening indicator */}
            {voiceState === "listening" && (
              <div style={{ padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, background: "rgba(248,113,113,0.06)", borderTop: "1px solid rgba(248,113,113,0.2)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", animation: "pulse 1s infinite" }} />
                <span style={{ fontSize: 11, color: "#f87171" }}>Listening… speak now</span>
                <button onClick={() => { recognitionRef.current?.stop(); setVoiceState("idle"); }}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 11 }}>Cancel</button>
              </div>
            )}

            {/* Processing indicator */}
            {voiceState === "processing" && (
              <div style={{ padding: "4px 12px", fontSize: 11, color: "#60a5fa", background: "rgba(96,165,250,0.06)", borderTop: "1px solid rgba(96,165,250,0.15)" }}>
                Processing voice input…
              </div>
            )}

            {/* Input bar */}
            <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 6, alignItems: "flex-end" }}>
              {/* Mic button */}
              {SPEECH_SUPPORTED && (
                <button onClick={startListening} disabled={sending || voiceState === "processing"}
                  title={voiceState === "listening" ? "Stop listening" : "Speak a message"}
                  style={{ padding: "7px", borderRadius: 8, background: voiceColor, border: voiceBorder, cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0 }}>
                  {voiceIcon}
                </button>
              )}

              <textarea value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                placeholder="Ask Element… prices, portfolio, how-to, troubleshoot"
                rows={1}
                style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-high)", color: "var(--text)", fontSize: 12, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.4 }} />

              <button onClick={() => { void sendMessage(); }}
                disabled={!input.trim() || sending}
                style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: input.trim() && !sending ? "#2563eb" : "rgba(100,116,139,0.12)", color: input.trim() && !sending ? "#fff" : "var(--subtle)", cursor: input.trim() && !sending ? "pointer" : "default", display: "flex", alignItems: "center", gap: 4, fontSize: 12, flexShrink: 0 }}>
                {sending ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
          </div>
        )}

        {/* SIGNALS TAB */}
        {activeTab === "signals" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>{signals.length} signals · {newSignalCount} unread</span>
              <button onClick={runScan}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, background: "var(--surface-high)", border: "1px solid var(--border)", color: "#94a3b8", fontSize: 10, cursor: "pointer" }}>
                <RefreshCw size={10} /> Scan Now
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", paddingTop: 4, paddingBottom: 8 }}>
              {signals.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569", fontSize: 12 }}>
                  <Bot size={32} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
                  No signals yet. Start scanning or click Scan Now.
                </div>
              ) : (
                signals.map(s => (
                  <SignalCard key={s.id} signal={s}
                    onAct={sig => { sig.acted = true; setSignals(prev => [...prev]); }} />
                ))
              )}
            </div>
          </div>
        )}

        {/* PORTFOLIO TAB */}
        {activeTab === "portfolio" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", scrollbarWidth: "thin" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <div style={{ padding: "10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "#64748b" }}>Total Value</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "monospace" }}>
                  ${totalUsd.toFixed(2)}
                </div>
              </div>
              <div style={{ padding: "10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, color: "#64748b" }}>Assets</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{assets.length}</div>
              </div>
            </div>
            {assets.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px", color: "#475569", fontSize: 12 }}>
                <ArrowUpDown size={28} style={{ margin: "0 auto 10px", display: "block", opacity: 0.3 }} />
                No assets yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[...assets].sort((a, b) => b.usdValue - a.usdValue).map(a => {
                  const tick   = tickers[`${a.symbol}-USD`];
                  const change = tick?.priceChangePct ?? a.change24h;
                  const price  = tick?.lastPrice ?? (a.usdValue / (a.balance || 1));
                  return (
                    <div key={a.symbol} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 8 }}>
                      <CryptoIcon symbol={a.symbol} size={32} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>{a.balance.toLocaleString("en", { maximumFractionDigits: 6 })} {a.symbol}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "var(--text)" }}>
                          ${a.usdValue.toFixed(2)}
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

        {/* HISTORY TAB */}
        {activeTab === "history" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>{messages.filter(m => m.role !== "system").length} messages this session</span>
              <button onClick={() => { void clearHistory(); }}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171", fontSize: 10, cursor: "pointer" }}>
                <Trash2 size={10} /> Clear
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", padding: "8px 12px" }}>
              {messages.filter(m => m.role !== "system").length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569", fontSize: 12 }}>
                  <Clock size={28} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
                  No conversation history yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {messages.filter(m => m.role !== "system").map(m => (
                    <div key={m.id} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: m.role === "user" ? "#60a5fa" : "#a78bfa", fontSize: 10, textTransform: "uppercase" }}>
                          {m.role === "user" ? "You" : "Element"}
                          {m.intent && <span style={{ color: "#475569", fontWeight: 400, marginLeft: 6 }}>· {m.intent}</span>}
                        </span>
                        <span style={{ fontSize: 10, color: "#475569" }}>{fmtTs(m.timestamp)}</span>
                      </div>
                      <div style={{ color: "#94a3b8", lineHeight: 1.5 }}>
                        {m.content.slice(0, 200)}{m.content.length > 200 ? "…" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STATUS TAB */}
        {activeTab === "status" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", scrollbarWidth: "thin", fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Element AI Status</div>

            {/* Backend */}
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                {backendUp ? <Wifi size={13} color="#22c55e" /> : <WifiOff size={13} color="#f87171" />}
                <span style={{ fontWeight: 700 }}>Backend Server</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: backendUp ? "#22c55e" : "#f87171", fontWeight: 600 }}>{backendUp ? "Connected" : "Offline"}</span>
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                {backendUp ? "Chat, portfolio queries, and diagnostics are available." : "Start the backend with: bun run server"}
              </div>
            </div>

            {/* LLM */}
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Bot size={13} color={diagStatus?.llmAvailable ? "#22c55e" : "#f59e0b"} />
                <span style={{ fontWeight: 700 }}>AI Engine</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: diagStatus?.llmAvailable ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>
                  {diagStatus?.llmAvailable ? diagStatus.llmProvider.toUpperCase() : "Built-in"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                {diagStatus?.llmAvailable
                  ? `Using ${diagStatus.llmProvider} for enhanced responses.`
                  : "Using built-in intent engine. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env for enhanced AI responses."}
              </div>
            </div>

            {/* Voice */}
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Mic size={13} color={SPEECH_SUPPORTED ? "#22c55e" : "#f87171"} />
                <span style={{ fontWeight: 700 }}>Voice Input</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: SPEECH_SUPPORTED ? "#22c55e" : "#f87171", fontWeight: 600 }}>
                  {SPEECH_SUPPORTED ? "Available" : "Not Supported"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                {SPEECH_SUPPORTED ? "Web Speech API ready. Tap the mic button to speak." : "Use Chrome on desktop or Android for voice input."}
              </div>
            </div>

            {/* TTS */}
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <Volume2 size={13} color={TTS_SUPPORTED ? "#22c55e" : "#f87171"} />
                <span style={{ fontWeight: 700 }}>Text-to-Speech</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: TTS_SUPPORTED ? "#22c55e" : "#f87171", fontWeight: 600 }}>
                  {TTS_SUPPORTED ? (ttsEnabled ? "Enabled" : "Disabled") : "Not Supported"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                {TTS_SUPPORTED ? "Toggle the TTS button in the header to hear spoken responses." : "Speech synthesis not available in this browser."}
              </div>
            </div>

            {/* Missing config */}
            {diagStatus?.missingConfig && diagStatus.missingConfig.length > 0 && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Info size={13} color="#f59e0b" />
                  <span style={{ fontWeight: 700, color: "#f59e0b" }}>Optional Configuration</span>
                </div>
                {diagStatus.missingConfig.map((item, i) => (
                  <div key={i} style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>• {item}</div>
                ))}
              </div>
            )}

            {/* Capabilities */}
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Active Capabilities</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(diagStatus?.capabilities ?? ["market_analysis","portfolio_query","voice_input","tts"]).map(c => (
                  <span key={c} style={{ padding: "2px 8px", borderRadius: 10, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e", fontSize: 10 }}>
                    ✓ {c.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>

            {/* Security note */}
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.2)", marginTop: 8, fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <Shield size={12} color="#60a5fa" />
                <span style={{ fontWeight: 700, color: "#60a5fa" }}>Security</span>
              </div>
              Element cannot access private keys, initiate transfers, or act without your explicit confirmation. All financial operations require a separate confirmation step. Conversation history is session-only and isolated per user.
            </div>
          </div>
        )}

        {/* ── Control Center tab ────────────────────────────────────────── */}
        {activeTab === "engineer" && <EngineerControlCenter />}

      </div>
    </div>
  );
}

// ── Engineer Control Center ───────────────────────────────────────────────────

interface EngHealth {
  overall: string; serverUptime: number; memoryUsedMb: number;
  openIssues: number; criticalIssues: number; threatsDetected: number;
  lastScanAt: number | null; scanInProgress: boolean; configWarnings: string[];
}
interface EngIssue {
  id: string; title: string; description: string; severity: string;
  status: string; category: string; detectedAt: number; requiresApproval: boolean;
  autoRepair?: string; repairLog?: string;
}
interface EngThreat {
  id: string; type: string; description: string; level: string;
  timestamp: number; blocked: boolean; endpoint?: string;
}
interface EngUpdate { id: string; name: string; type: string; current: string; available: string; riskLevel: string; description: string; }
type ETab = "overview" | "issues" | "threats" | "audit" | "updates";

function severityColor(s: string) {
  return s === "critical" ? "#ef4444" : s === "high" ? "#f97316" : s === "medium" ? "#f59e0b" : "#22c55e";
}
function statusColor(s: string) {
  return s === "open" ? "#f97316" : s === "resolved" || s === "auto-repaired" ? "#22c55e" : "#60a5fa";
}

function EngineerControlCenter() {
  const [etab, setEtab]           = useState<ETab>("overview");
  const [health, setHealth]       = useState<EngHealth | null>(null);
  const [issues, setIssues]       = useState<EngIssue[]>([]);
  const [threats, setThreats]     = useState<EngThreat[]>([]);
  const [updates, setUpdates]     = useState<EngUpdate[]>([]);
  const [audit, setAudit]         = useState<{id:string;action:string;result:string;detail:string;timestamp:number}[]>([]);
  const [scanning, setScanning]   = useState(false);
  const [repairMsg, setRepairMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, i, t, a, u] = await Promise.all([
        fetch("/api/engineer/status").then(r => r.json()),
        fetch("/api/engineer/issues").then(r => r.json()),
        fetch("/api/engineer/threats").then(r => r.json()),
        fetch("/api/engineer/audit").then(r => r.json()),
        fetch("/api/engineer/updates").then(r => r.json()),
      ]);
      setHealth(h);
      setIssues(i.issues ?? []);
      setThreats(t.threats ?? []);
      setAudit(a.audit ?? []);
      setUpdates(u.updates ?? []);
    } catch { /* network error */ }
  }, []);

  // eslint-disable-next-line react-compiler/react-compiler
  useEffect(() => { void load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const runScan = async () => {
    setScanning(true);
    try {
      const r = await fetch("/api/engineer/scan", { method: "POST" });
      const d = await r.json() as { ok: boolean; newIssues: number; issues: EngIssue[] };
      setIssues(d.issues ?? []);
      await load();
    } finally { setScanning(false); }
  };

  const repair = async (id: string) => {
    const r = await fetch("/api/engineer/repair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issueId: id }) });
    const d = await r.json() as { ok: boolean; message: string };
    setRepairMsg(d.message);
    setTimeout(() => setRepairMsg(null), 5000);
    await load();
  };

  const ETABS: { id: ETab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "issues",   label: `Issues${issues.filter(i=>i.status==="open").length ? ` (${issues.filter(i=>i.status==="open").length})` : ""}` },
    { id: "threats",  label: "Threats" },
    { id: "updates",  label: "Updates" },
    { id: "audit",    label: "Audit Log" },
  ];

  const S: Record<string, React.CSSProperties> = {
    wrap:   { padding: "12px 0", display: "flex", flexDirection: "column", gap: 10 },
    card:   { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" },
    row:    { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
    label:  { fontSize: 11, color: "var(--subtle)", fontWeight: 600 },
    val:    { fontSize: 13, fontWeight: 700, color: "var(--ink)" },
    badge:  { padding: "2px 8px", borderRadius: 8, fontSize: 10, fontWeight: 700 },
    btn:    { padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12 },
    etab:   { padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700 },
  };

  function uptime(ms: number) {
    const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={{ ...S.card, background: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(59,130,246,0.08))" }}>
        <div style={{ ...S.row, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Shield size={16} color="#6366f1" />
            <span style={{ fontWeight: 800, color: "var(--ink)", fontSize: 14 }}>Element Control Center</span>
          </div>
          {health && (
            <span style={{ ...S.badge, background: health.overall === "healthy" ? "rgba(34,197,94,0.12)" : health.overall === "degraded" ? "rgba(249,115,22,0.12)" : "rgba(239,68,68,0.12)", color: health.overall === "healthy" ? "#22c55e" : health.overall === "degraded" ? "#f97316" : "#ef4444" }}>
              {health.overall.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ETABS.map(t => (
            <button key={t.id} style={{ ...S.etab, background: etab === t.id ? "#6366f1" : "var(--surface-high)", color: etab === t.id ? "#fff" : "var(--ink)" }} onClick={() => setEtab(t.id)}>{t.label}</button>
          ))}
          <button style={{ ...S.btn, background: scanning ? "rgba(99,102,241,0.2)" : "#6366f1", color: "#fff", marginLeft: "auto" }} onClick={runScan} disabled={scanning}>
            {scanning ? "Scanning…" : "Run Scan"}
          </button>
        </div>
        {repairMsg && <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 6, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", fontSize: 11, color: "#22c55e" }}>{repairMsg}</div>}
      </div>

      {/* Overview */}
      {etab === "overview" && health && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {([["Uptime", uptime(health.serverUptime)], ["Memory", `${health.memoryUsedMb} MB`], ["Open Issues", String(health.openIssues)], ["Threats (1h)", String(health.threatsDetected)]] as [string,string][]).map(([l, v]) => (
              <div key={l} style={S.card}>
                <div style={S.label}>{l}</div>
                <div style={S.val}>{v}</div>
              </div>
            ))}
          </div>
          {health.configWarnings.length > 0 && (
            <div style={{ ...S.card, background: "rgba(245,158,11,0.04)", borderColor: "rgba(245,158,11,0.25)" }}>
              <div style={{ fontWeight: 700, color: "#f59e0b", fontSize: 12, marginBottom: 6 }}>Configuration Warnings</div>
              {health.configWarnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: "var(--subtle)", marginTop: 3 }}>• {w}</div>)}
            </div>
          )}
          <div style={{ ...S.card, fontSize: 11, color: "var(--subtle)", lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>What Element can do</div>
            <div>• Scan every API endpoint for errors, slow responses, and outages</div>
            <div>• Detect missing configuration that blocks financial features</div>
            <div>• Monitor memory usage and alert on degraded server health</div>
            <div>• Detect API abuse, rate-limit violations, and suspicious payloads</div>
            <div>• Apply safe auto-repairs (cache clearing, configuration hints)</div>
            <div>• Maintain an immutable audit log of every action taken</div>
            <div style={{ marginTop: 6, color: "#6366f1" }}>
              High-risk actions (server restart, financial ops) require your explicit approval.
            </div>
          </div>
        </>
      )}

      {/* Issues */}
      {etab === "issues" && (
        issues.length === 0
          ? <div style={{ ...S.card, textAlign: "center", color: "var(--subtle)", fontSize: 12 }}>No issues detected. Run a scan to check.</div>
          : issues.map(issue => (
            <div key={issue.id} style={{ ...S.card, borderLeft: `3px solid ${severityColor(issue.severity)}` }}>
              <div style={S.row}>
                <span style={{ fontWeight: 700, fontSize: 12, color: "var(--ink)" }}>{issue.title}</span>
                <span style={{ ...S.badge, background: `${severityColor(issue.severity)}18`, color: severityColor(issue.severity) }}>{issue.severity}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 3 }}>{issue.description}</div>
              <div style={{ ...S.row, marginTop: 8 }}>
                <span style={{ ...S.badge, background: `${statusColor(issue.status)}18`, color: statusColor(issue.status) }}>{issue.status}</span>
                <span style={{ fontSize: 10, color: "var(--subtle)" }}>{issue.category}</span>
                {issue.autoRepair && issue.status === "open" && (
                  <button style={{ ...S.btn, background: "#6366f1", color: "#fff", padding: "4px 10px" }} onClick={() => repair(issue.id)}>Auto-Repair</button>
                )}
              </div>
              {issue.repairLog && <div style={{ marginTop: 6, fontSize: 10, color: "#22c55e" }}>✓ {issue.repairLog}</div>}
            </div>
          ))
      )}

      {/* Threats */}
      {etab === "threats" && (
        threats.length === 0
          ? <div style={{ ...S.card, textAlign: "center", color: "var(--subtle)", fontSize: 12 }}>No threats detected in the last hour.</div>
          : threats.slice(0, 50).map(t => (
            <div key={t.id} style={{ ...S.card, borderLeft: `3px solid ${severityColor(t.level)}` }}>
              <div style={S.row}>
                <span style={{ fontWeight: 700, fontSize: 12, color: "var(--ink)" }}>{t.type.replace(/-/g, " ")}</span>
                {t.blocked && <span style={{ ...S.badge, background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>BLOCKED</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 3 }}>{t.description}</div>
              {t.endpoint && <div style={{ fontSize: 10, color: "var(--subtle)", marginTop: 2 }}>Endpoint: {t.endpoint}</div>}
              <div style={{ fontSize: 10, color: "var(--subtle)", marginTop: 2 }}>{fmtTs(t.timestamp)}</div>
            </div>
          ))
      )}

      {/* Updates */}
      {etab === "updates" && updates.map(u => (
        <div key={u.id} style={S.card}>
          <div style={S.row}>
            <span style={{ fontWeight: 700, fontSize: 12, color: "var(--ink)" }}>{u.name}</span>
            <span style={{ ...S.badge, background: u.riskLevel === "low" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)", color: u.riskLevel === "low" ? "#22c55e" : "#f59e0b" }}>{u.riskLevel} risk</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--subtle)", marginTop: 3 }}>{u.description}</div>
          <div style={{ fontSize: 10, color: "var(--subtle)", marginTop: 2 }}>Type: {u.type} · Current: {u.current} · Available: {u.available}</div>
        </div>
      ))}

      {/* Audit log */}
      {etab === "audit" && (
        audit.length === 0
          ? <div style={{ ...S.card, textAlign: "center", color: "var(--subtle)", fontSize: 12 }}>No audit entries yet. Run a scan to generate entries.</div>
          : audit.slice(0, 100).map(e => (
            <div key={e.id} style={{ ...S.card, padding: "8px 12px" }}>
              <div style={S.row}>
                <span style={{ fontWeight: 700, fontSize: 11, color: "var(--ink)" }}>{e.action}</span>
                <span style={{ ...S.badge, background: e.result === "success" ? "rgba(34,197,94,0.1)" : e.result === "failed" ? "rgba(239,68,68,0.1)" : "rgba(148,163,184,0.1)", color: e.result === "success" ? "#22c55e" : e.result === "failed" ? "#ef4444" : "#94a3b8" }}>{e.result}</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--subtle)", marginTop: 2 }}>{e.detail}</div>
              <div style={{ fontSize: 10, color: "var(--subtle)", marginTop: 1 }}>{fmtTs(e.timestamp)}</div>
            </div>
          ))
      )}
    </div>
  );
}
