/**
 * P2PRateBar — shows best live P2P buy/sell rates for USDC/USDT/BTC
 * in the user's local currency.
 * Rates come from actual p2pStore advertisements (not fabricated).
 */
import { useMemo } from "react";
import { useP2PStore }   from "@/store/p2pStore";
import { useWalletStore } from "@/store/walletStore";
import { CURRENCY_META }  from "@/hooks/useFxDisplay";

const PAIRS: { asset: "USDC" | "USDT" | "BTC" | "ETH"; label: string }[] = [
  { asset: "USDC", label: "USDC" },
  { asset: "USDT", label: "USDT" },
  { asset: "BTC",  label: "BTC"  },
  { asset: "ETH",  label: "ETH"  },
];

interface RatePair {
  asset:    string;
  fiat:     string;
  symbol:   string;
  bestBuy:  number | null; // best price to buy crypto (lowest fiat per crypto = cheapest for buyer)
  bestSell: number | null; // best price to sell crypto (highest fiat per crypto = best for seller)
  offers:   number;
}

export function P2PRateBar() {
  const fiat        = useWalletStore(s => s.primaryFiat);
  const rankedAds   = useP2PStore(s => s.rankedAds);
  const currMeta    = CURRENCY_META[fiat] ?? CURRENCY_META["USD"];

  const rates = useMemo<RatePair[]>(() => {
    return PAIRS.map(({ asset, label }) => {
      const buySide  = rankedAds("buy",  asset, fiat);
      const sellSide = rankedAds("sell", asset, fiat);

      // For a user wanting to BUY crypto: they want the seller's price (lowest = cheapest)
      const sellOffers = sellSide.filter(a => a.status === "active");
      const bestBuy    = sellOffers.length > 0
        ? Math.min(...sellOffers.map(a => a.price))
        : null;

      // For a user wanting to SELL crypto: they want the buyer's price (highest = best return)
      const buyOffers  = buySide.filter(a => a.status === "active");
      const bestSell   = buyOffers.length > 0
        ? Math.max(...buyOffers.map(a => a.price))
        : null;

      return {
        asset: label,
        fiat,
        symbol: currMeta.symbol,
        bestBuy,
        bestSell,
        offers: sellOffers.length + buyOffers.length,
      };
    }).filter(r => r.bestBuy !== null || r.bestSell !== null);
  }, [fiat, rankedAds, currMeta.symbol]);

  if (rates.length === 0) return null;

  function fmtRate(n: number | null, asset: string): string {
    if (n === null) return "—";
    // For stablecoins, show whole number; for BTC show commas
    if (asset === "BTC" || asset === "ETH") {
      return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    }
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
          P2P Rates · {fiat}
        </span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
          style={{ background: "rgba(74,222,128,0.12)", color: "var(--buy)" }}>
          Live Offers
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {rates.map(r => (
          <div key={r.asset} className="rounded-lg p-2"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-[10px] font-bold mb-1" style={{ color: "var(--ink)" }}>
              {r.asset}/{r.fiat}
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <div className="text-[9px] uppercase" style={{ color: "var(--subtle)" }}>Buy</div>
                <div className="text-[10px] font-bold mono" style={{ color: "var(--buy)" }}>
                  {r.bestBuy !== null ? `${r.symbol}${fmtRate(r.bestBuy, r.asset)}` : "—"}
                </div>
              </div>
              <div className="w-px" style={{ background: "var(--border)" }} />
              <div className="flex-1">
                <div className="text-[9px] uppercase" style={{ color: "var(--subtle)" }}>Sell</div>
                <div className="text-[10px] font-bold mono" style={{ color: "var(--sell)" }}>
                  {r.bestSell !== null ? `${r.symbol}${fmtRate(r.bestSell, r.asset)}` : "—"}
                </div>
              </div>
            </div>
            <div className="text-[9px] mt-1" style={{ color: "var(--subtle)" }}>
              {r.offers} active offer{r.offers !== 1 ? "s" : ""}
            </div>
          </div>
        ))}
      </div>

      <div className="text-[9px] mt-1.5 text-center" style={{ color: "var(--subtle)" }}>
        P2P rates from live merchant offers · may differ from market price
      </div>
    </div>
  );
}
