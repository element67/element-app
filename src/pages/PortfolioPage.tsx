import { useMemo } from "react";
import { useWalletStore } from "@/store/walletStore";
import { usePriceStore } from "@/store/priceStore";
import { useFxDisplay } from "@/hooks/useFxDisplay";
import { useSharedWallet as useNativeWallet } from "@/context/NativeWalletContext";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import { CryptoIcon } from "@/components/AssetIcons";

function fmt(n: number, dec = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--ink-2)" }}>{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function PortfolioPage() {
  const assets        = useWalletStore(s => s.assets);
  const totalUsd      = useWalletStore(s => s.totalUsd);
  const totalChange24h = useWalletStore(s => s.totalChange24h);
  const txHistory     = useWalletStore(s => s.txHistory);
  const tickers       = usePriceStore(s => s.tickers);
  const nw = useNativeWallet();
  const nativeAddress = nw.addresses?.["Ethereum"];
  const fx = useFxDisplay();

  // Build enriched asset list with live prices
  const enriched = useMemo(() => assets.map(a => {
    const livePrice = tickers[`${a.symbol}-USD`]?.lastPrice ?? (a.usdValue / (a.balance || 1));
    const priceChangePct = tickers[`${a.symbol}-USD`]?.priceChangePct ?? a.change24h;
    const usdValue = a.balance * livePrice;
    return { ...a, livePrice, priceChangePct, usdValue };
  }).sort((a, b) => b.usdValue - a.usdValue), [assets, tickers]);

  // Sparkline data based on total portfolio value
  const sparkData = useMemo(() => {
    const base = totalUsd;
    return Array.from({ length: 20 }, (_, i) =>
      base * (1 + (i - 10) * 0.005 + (i % 3 === 0 ? 0.003 : -0.002))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.sign(totalChange24h)]);

  const sparkMax = Math.max(...sparkData);
  const sparkMin = Math.min(...sparkData);
  const sparkRange = sparkMax - sparkMin || 1;

  // Recent transactions
  const recentTx = useMemo(() =>
    [...txHistory].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10)
  , [txHistory]);

  const stats = [
    { label: "Total Value",     value: fx.fmt(totalUsd),                              color: "var(--ink)" },
    { label: "24h Change",      value: pct(totalChange24h),                            color: totalChange24h >= 0 ? "var(--green)" : "var(--red)" },
    { label: "Assets",          value: String(assets.length),                          color: "var(--ink)" },
    { label: "Transactions",    value: String(txHistory.length),                       color: "var(--ink)" },
  ];

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto" style={{ minHeight: "calc(100vh - 44px)", background: "var(--bg)" }}>
      {/* Header */}
      <div>
        <div className="text-lg font-bold" style={{ color: "var(--ink)" }}>Portfolio</div>
        {nativeAddress && (
          <div className="text-xs mono mt-0.5" style={{ color: "var(--subtle)" }}>
            {nativeAddress.slice(0, 6)}…{nativeAddress.slice(-4)}
          </div>
        )}
      </div>



      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="rounded p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-xs mb-1" style={{ color: "var(--subtle)" }}>{s.label}</div>
            <div className="text-base font-bold mono" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Equity curve sparkline */}
      <Section title="Portfolio Value (estimated)">
        <svg width="100%" height="60" viewBox={`0 0 ${sparkData.length - 1} 60`} preserveAspectRatio="none">
          <polyline
            fill="none"
            strokeWidth="1.5"
            stroke={totalChange24h >= 0 ? "var(--green)" : "var(--red)"}
            points={sparkData.map((v, i) => `${i},${60 - ((v - sparkMin) / sparkRange) * 55}`).join(" ")}
          />
        </svg>
      </Section>

      {/* Asset breakdown */}
      <Section title={`Assets (${enriched.length})`}>
        {enriched.length === 0 ? (
          <div className="text-center py-6 text-xs" style={{ color: "var(--subtle)" }}>No assets — add funds via the Wallet page</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "var(--subtle)" }}>
                  {["Asset", "Balance", "Price", "24h", "Value"].map(h => (
                    <th key={h} className="text-left pb-2 font-medium pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.map(a => (
                  <tr key={a.symbol} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="py-1.5 pr-3">
                      <div className="flex items-center gap-2">
                        <CryptoIcon symbol={a.symbol} size={20} />
                        <span className="font-semibold" style={{ color: "var(--ink)" }}>{a.symbol}</span>
                      </div>
                    </td>
                    <td className="mono pr-3" style={{ color: "var(--ink)" }}>{fmt(a.balance, 4)}</td>
                    <td className="mono pr-3" style={{ color: "var(--ink-2)" }}>{fx.fmt(a.livePrice)}</td>
                    <td className="mono pr-3">
                      <span style={{ color: a.priceChangePct >= 0 ? "var(--green)" : "var(--red)" }}>
                        {a.priceChangePct >= 0 ? <TrendingUp size={10} style={{ display: "inline", marginRight: 2 }} /> : <TrendingDown size={10} style={{ display: "inline", marginRight: 2 }} />}
                        {pct(a.priceChangePct)}
                      </span>
                    </td>
                    <td className="mono font-semibold" style={{ color: "var(--ink)" }}>{fx.fmt(a.usdValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Recent transactions */}
      <Section title="Recent Activity">
        {recentTx.length === 0 ? (
          <div className="text-center py-4 text-xs" style={{ color: "var(--subtle)" }}>
            No transactions yet — activity appears here
          </div>
        ) : (
          <div className="space-y-2">
            {recentTx.map(tx => {
              const isOut = ["send","sell","withdraw","escrow_lock"].includes(tx.type);
              return (
                <div key={tx.id} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: isOut ? "var(--red)" : "var(--green)" }} />
                    <span className="capitalize" style={{ color: "var(--ink-2)" }}>
                      {tx.type.replace("_"," ")} {tx.asset}
                      {tx.toAsset ? ` → ${tx.toAsset}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: "var(--subtle)", fontSize: 10 }}>
                      {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="mono font-semibold" style={{ color: isOut ? "var(--red)" : "var(--green)" }}>
                      {isOut ? "-" : "+"}{tx.amount} {tx.asset}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Info note */}
      <div className="text-xs px-3 py-2 rounded" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--subtle)" }}>
        <Activity size={10} style={{ display: "inline", marginRight: 4 }} />
        Balances shown are from your built-in RushPay wallet. Use the Wallet page to deposit or send crypto.
      </div>
    </div>
  );
}
