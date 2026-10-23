/**
 * Lightweight price store — replaces perpStore for all non-trading screens.
 * Fetches 24h ticker data from Binance via a CORS proxy, refreshes every 10s.
 * Exposes tickers keyed "BTC-USD", "ETH-USD" etc. for backward compatibility.
 */
import { create } from "zustand";

export interface Ticker {
  symbol:       string;   // e.g. "BTC-USD"
  lastPrice:    number;
  priceChange:  number;   // absolute 24h change
  priceChangePct: number; // percent 24h change
  high24h:      number;
  low24h:       number;
  volume24h:    number;   // base asset volume
  quoteVolume:  number;   // USDT volume
  updatedAt:    number;   // ms
}

// Markets we care about — Binance symbols mapped to our "-USD" keys
const MARKET_MAP: Record<string, string> = {
  BTCUSDT:  "BTC-USD",
  ETHUSDT:  "ETH-USD",
  SOLUSDT:  "SOL-USD",
  BNBUSDT:  "BNB-USD",
  XRPUSDT:  "XRP-USD",
  DOGEUSDT: "DOGE-USD",
  ADAUSDT:  "ADA-USD",
  AVAXUSDT: "AVAX-USD",
  MATICUSDT:"POL-USD",
  DOTUSDT:  "DOT-USD",
  LINKUSDT: "LINK-USD",
  LTCUSDT:  "LTC-USD",
  UNIUSDT:  "UNI-USD",
  ATOMUSDT: "ATOM-USD",
  ARBUSDT:  "ARB-USD",
  OPUSDT:   "OP-USD",
  TONUSDT:  "TON-USD",
  TRXUSDT:  "TRX-USD",
  FTMUSDT:  "FTM-USD",
  NEARUSDT: "NEAR-USD",
  AAVEUSDT: "AAVE-USD",
  MKRUSDT:  "MKR-USD",
};

// Seed prices so the app renders immediately before the first fetch
const SEED: Record<string, number> = {
  "BTC-USD": 67500, "ETH-USD": 3450, "SOL-USD": 185,
  "BNB-USD": 580,   "XRP-USD": 0.62, "DOGE-USD": 0.14,
  "ADA-USD": 0.48,  "AVAX-USD": 36,  "POL-USD": 0.88,
  "DOT-USD": 7.2,   "LINK-USD": 14,  "LTC-USD": 82,
  "UNI-USD": 9.5,   "ATOM-USD": 8.8, "ARB-USD": 1.1,
  "OP-USD":  2.1,   "TON-USD": 6.4,  "TRX-USD": 0.12,
  "FTM-USD": 0.72,  "NEAR-USD": 5.8, "AAVE-USD": 210,
  "MKR-USD": 1850,
};

function seedTickers(): Record<string, Ticker> {
  const out: Record<string, Ticker> = {};
  for (const [sym, price] of Object.entries(SEED)) {
    out[sym] = {
      symbol: sym, lastPrice: price,
      priceChange: 0, priceChangePct: 0,
      high24h: price * 1.02, low24h: price * 0.98,
      volume24h: 0, quoteVolume: 0, updatedAt: Date.now(),
    };
  }
  return out;
}

interface PriceState {
  tickers:    Record<string, Ticker>;
  prevPrices: Record<string, number>; // previous lastPrice for flash direction
  loading:    boolean;
  lastFetch:  number;
  startFeed: () => () => void;
}

const BASE_URL = "https://api.binance.com/api/v3/ticker/24hr";

// In-flight dedup: if a fetch is already running, return the same promise
let _inflightFetch: Promise<Record<string, Ticker>> | null = null;

async function fetchTickers(): Promise<Record<string, Ticker>> {
  if (_inflightFetch) return _inflightFetch;
  const symbols = Object.keys(MARKET_MAP);
  const qs = `symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
  const directUrl = `${BASE_URL}?${qs}`;

  _inflightFetch = (async () => {
    try {
      // Try server-side proxy first (avoids CORS + Binance geo-blocking)
      let raw: Response | null = null;
      try {
        raw = await fetch("/api/prices", { signal: AbortSignal.timeout(8000) });
        if (!raw.ok) raw = null;
      } catch { raw = null; }

      // Fall back to direct Binance if proxy unavailable
      if (!raw) {
        try {
          raw = await fetch(directUrl, { signal: AbortSignal.timeout(6000) });
          if (!raw.ok) raw = null;
        } catch { raw = null; }
      }

      if (!raw?.ok) throw new Error("price fetch failed");
      interface BinanceTicker24 {
        symbol: string; lastPrice: string; priceChange: string; priceChangePercent: string;
        highPrice: string; lowPrice: string; volume: string; quoteVolume: string;
      }
      const data = await raw.json() as BinanceTicker24[];
      const out: Record<string, Ticker> = {};
      for (const row of data) {
        const key = MARKET_MAP[row.symbol];
        if (!key) continue;
        out[key] = {
          symbol:         key,
          lastPrice:      parseFloat(row.lastPrice),
          priceChange:    parseFloat(row.priceChange),
          priceChangePct: parseFloat(row.priceChangePercent),
          high24h:        parseFloat(row.highPrice),
          low24h:         parseFloat(row.lowPrice),
          volume24h:      parseFloat(row.volume),
          quoteVolume:    parseFloat(row.quoteVolume),
          updatedAt:      Date.now(),
        };
      }
      return out;
    } finally {
      _inflightFetch = null;
    }
  })();
  return _inflightFetch;
}

// Merge new tickers, recording previous prices for flash animations
function applyTickers(
  prev: PriceState,
  incoming: Record<string, Ticker>,
): Partial<PriceState> {
  const prevPrices: Record<string, number> = { ...prev.prevPrices };
  for (const [key, t] of Object.entries(incoming)) {
    prevPrices[key] = prev.tickers[key]?.lastPrice ?? t.lastPrice;
  }
  return { tickers: { ...prev.tickers, ...incoming }, prevPrices, lastFetch: Date.now(), loading: false };
}

export const usePriceStore = create<PriceState>((set, _get) => ({
  tickers:    seedTickers(),
  prevPrices: {},
  loading:    false,
  lastFetch:  0,

  startFeed() {
    let alive = true;
    let ws: WebSocket | null = null;

    // ── Binance mini-ticker WebSocket (real-time, throttled to 1 batch/2s) ──────
    // Raw WS fires ~1msg/s × 22 symbols = 22 Zustand updates/s, which re-renders
    // every price-watching component 22×/s. We buffer all ticks and flush as a
    // single merged state update every 2s instead.
    function startWs() {
      const streams = Object.keys(MARKET_MAP).map(s => `${s.toLowerCase()}@miniTicker`).join("/");
      // Pending batch: accumulate ticks, flush every 2s
      const pending: Record<string, Ticker> = {};
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      function scheduledFlush() {
        flushTimer = null;
        if (!alive || Object.keys(pending).length === 0) return;
        const batch = { ...pending };
        // Clear pending before set() to avoid holding stale refs
        for (const k of Object.keys(pending)) delete pending[k];
        set(prev => applyTickers(prev, batch));
        // Schedule next flush
        flushTimer = setTimeout(scheduledFlush, 2000);
      }

      try {
        ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
        ws.onmessage = (evt: MessageEvent) => {
          if (!alive) return;
          try {
            interface MiniTicker { e: string; s: string; c: string; o: string; h: string; l: string; v: string; q: string; }
            const msg = JSON.parse(evt.data as string) as { data: MiniTicker };
            const d = msg.data;
            const key = MARKET_MAP[d.s];
            if (!key) return;
            const lastPrice = parseFloat(d.c);
            const open      = parseFloat(d.o);
            // Accumulate into pending batch — no setState here
            pending[key] = {
              symbol:         key,
              lastPrice,
              priceChange:    lastPrice - open,
              priceChangePct: open > 0 ? ((lastPrice - open) / open) * 100 : 0,
              high24h:        parseFloat(d.h),
              low24h:         parseFloat(d.l),
              volume24h:      parseFloat(d.v),
              quoteVolume:    parseFloat(d.q),
              updatedAt:      Date.now(),
            };
            // Start flush timer on first message if not already running
            if (!flushTimer) flushTimer = setTimeout(scheduledFlush, 2000);
          } catch { /* ignore parse errors */ }
        };
        ws.onerror = () => { ws?.close(); };
        ws.onclose = () => {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          if (alive) setTimeout(startWs, 5000);
        };
      } catch { /* WS not available */ }
    }

    // ── REST fallback — seed immediately, then every 10s ─────────────────────
    async function tick() {
      if (!alive) return;
      try {
        const incoming = await fetchTickers();
        if (alive) set(prev => applyTickers(prev, incoming));
      } catch { /* ignore */ }
    }

    startWs();
    void tick(); // immediate seed
    // 60s REST poll matches the server-side Binance cache TTL — no point polling faster
    const id = setInterval(() => { void tick(); }, 60_000);

    return () => {
      alive = false;
      clearInterval(id);
      ws?.close();
      ws = null;
    };
  },
}));
