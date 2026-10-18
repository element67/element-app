/**
 * LivePriceStrip — horizontal scrolling ticker with green/red flash on price change.
 * Uses real Binance data from priceStore (WebSocket + REST fallback).
 * Never fabricates prices.
 */
import { useRef, useEffect, useState } from "react";
import { usePriceStore } from "@/store/priceStore";
import { useFxDisplay }  from "@/hooks/useFxDisplay";

const STRIP_ASSETS = [
  "BTC-USD","ETH-USD","SOL-USD","BNB-USD","XRP-USD",
  "DOGE-USD","ADA-USD","AVAX-USD","ARB-USD","OP-USD",
  "LINK-USD","UNI-USD","AAVE-USD","POL-USD","TON-USD",
];

type FlashDir = "up" | "down" | "none";

function PricePill({ sym }: { sym: string }) {
  const ticker   = usePriceStore(s => s.tickers[sym]);
  const prevPrice = usePriceStore(s => s.prevPrices[sym]);
  const fx       = useFxDisplay();
  const [flash, setFlash] = useState<FlashDir>("none");
  const prevRef  = useRef<number | null>(null);

  useEffect(() => {
    if (!ticker) return;
    const cur = ticker.lastPrice;
    const prev = prevRef.current;
    if (prev !== null && cur !== prev) {
      setFlash(cur > prev ? "up" : "down");
      const t = setTimeout(() => setFlash("none"), 800);
      return () => clearTimeout(t);
    }
    prevRef.current = cur;
  }, [ticker?.lastPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also update prevRef when prevPrice changes
  useEffect(() => {
    if (prevPrice !== undefined) prevRef.current = prevPrice;
  }, [prevPrice]);

  if (!ticker) return null;

  const label = sym.replace("-USD", "");
  const pct   = ticker.priceChangePct;
  const isUp  = pct >= 0;

  const flashBg = flash === "up"
    ? "rgba(74,222,128,0.18)"
    : flash === "down"
    ? "rgba(248,113,113,0.18)"
    : "transparent";

  return (
    <div
      className="flex flex-col items-center px-3 py-1.5 rounded-xl flex-shrink-0 transition-colors"
      style={{
        background: flashBg,
        minWidth: 72,
        border: "1px solid var(--border)",
        transition: "background 0.3s ease",
      }}
    >
      <div className="text-[10px] font-bold" style={{ color: "var(--ink)" }}>{label}</div>
      <div className="text-[11px] font-bold mono" style={{ color: flash === "up" ? "var(--buy)" : flash === "down" ? "var(--sell)" : "var(--ink)" }}>
        {fx.fmt(ticker.lastPrice)}
      </div>
      <div className="text-[9px] mono" style={{ color: isUp ? "var(--buy)" : "var(--sell)" }}>
        {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
      </div>
    </div>
  );
}

export function LivePriceStrip() {
  const lastFetch = usePriceStore(s => s.lastFetch);
  const loading   = usePriceStore(s => s.loading);

  const lastUpdated = lastFetch > 0
    ? new Date(lastFetch).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* scrollable row */}
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {STRIP_ASSETS.map(sym => <PricePill key={sym} sym={sym} />)}
      </div>
      {/* status row */}
      <div className="flex items-center gap-1.5 px-0.5">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: loading ? "#fbbf24" : lastFetch > 0 ? "var(--buy)" : "var(--subtle)" }}
        />
        <span className="text-[9px]" style={{ color: "var(--subtle)" }}>
          {loading ? "Updating…" : lastUpdated ? `Live · updated ${lastUpdated}` : "Fetching prices…"}
        </span>
      </div>
    </div>
  );
}
