/**
 * NanopaymentStatus — shows Circle Nanopayments readiness + payment history
 * Used as a floating status badge and inside the DeFi / Wallet pages.
 */
import { useEffect, useState } from "react";
import { Zap, CheckCircle2, AlertCircle, Clock, ExternalLink } from "lucide-react";
import { fetchNanopaymentConfig, fetchPaymentHistory, type NanopaymentConfig } from "@/lib/nanopayments";
import { useAccount } from "wagmi";

// ── Badge (compact, shows in DeFi header) ────────────────────────────────────
export function NanopayBadge() {
  const [cfg, setCfg] = useState<NanopaymentConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchNanopaymentConfig().then(c => { if (!cancelled) setCfg(c); });
    return () => { cancelled = true; };
  }, []);

  if (!cfg) return null;

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
      style={{
        background: cfg.enabled ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
        color: cfg.enabled ? "var(--buy)" : "var(--subtle)",
        border: `1px solid ${cfg.enabled ? "rgba(34,197,94,0.2)" : "rgba(100,116,139,0.2)"}`,
      }}
      title={cfg.note}
    >
      <Zap size={9} />
      {cfg.enabled ? "NANO ⚡" : "NANO OFF"}
    </div>
  );
}

// ── Full status panel (in DeFi page or Wallet page) ──────────────────────────
export function NanopayPanel() {
  const { address, isConnected } = useAccount();
  const [cfg, setCfg] = useState<NanopaymentConfig | null>(null);
  const [history, setHistory] = useState<unknown[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchNanopaymentConfig().then(c => { if (!cancelled) setCfg(c); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void (async () => {
      const h = await fetchPaymentHistory(address);
      if (!cancelled) { setHistory(h); setLoadingHistory(false); }
    })();
    return () => { cancelled = true; };
  }, [address]);

  const payments = history as Array<{
    id: string; type: string; amount: string; payer: string;
    ref: string; status: string; createdAt: number; txHash?: string;
  }>;

  return (
    <div className="flex flex-col gap-4">
      {/* Status card */}
      <div className="rounded-xl p-4" style={{ background: "var(--surface-mid)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: cfg?.enabled ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)" }}>
              <Zap size={16} style={{ color: cfg?.enabled ? "var(--buy)" : "var(--subtle)" }} />
            </div>
            <div>
              <div className="text-[13px] font-semibold">Circle Nanopayments</div>
              <div className="text-[10px]" style={{ color: "var(--subtle)" }}>Gateway x402 · Arc Testnet</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold"
            style={{
              background: cfg?.enabled ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)",
              color: cfg?.enabled ? "var(--buy)" : "#ca8a04",
            }}>
            {cfg?.enabled
              ? <><CheckCircle2 size={10} /> Active</>
              : <><AlertCircle size={10} /> Setup Required</>
            }
          </div>
        </div>

        {cfg?.enabled ? (
          <>
            <div className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
              Seller: <span className="mono" style={{ color: "var(--text)" }}>{cfg.sellerAddress?.slice(0,10)}...{cfg.sellerAddress?.slice(-6)}</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(cfg.prices).map(([type, price]) => (
                <div key={type} className="rounded-lg p-2 text-center" style={{ background: "var(--surface-high)" }}>
                  <div className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--subtle)" }}>{type.toUpperCase()}</div>
                  <div className="text-[12px] font-bold mono">${price}</div>
                  <div className="text-[9px]" style={{ color: "var(--muted)" }}>USDC</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px]" style={{ color: "var(--muted)" }}>
              {cfg?.note ?? "Checking backend..."}
            </p>
            <div className="rounded-lg p-3 text-[11px]" style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>
              <p className="font-semibold mb-1">To enable Circle Nanopayments:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Add <code className="mono px-1 py-0.5 rounded" style={{ background: "var(--surface-muted)" }}>SELLER_ADDRESS=0x...</code> to <code className="mono">.env</code></li>
                <li>Restart the backend server (<code className="mono">bun run server</code>)</li>
                <li>The <code className="mono">/pay/*</code> endpoints activate automatically</li>
              </ol>
              <a href="https://developers.circle.com/gateway/nanopayments"
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 mt-2"
                style={{ color: "var(--accent)" }}>
                Circle Nanopayments docs <ExternalLink size={10} />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* What gets paid */}
      <div className="rounded-xl p-4" style={{ background: "var(--surface-mid)", border: "1px solid var(--border)" }}>
        <div className="text-[12px] font-semibold mb-3">Nanopayments Coverage</div>
        <div className="space-y-2">
          {[
            { action: "Token Swap",       route: "POST /pay/swap",     fee: "$0.05", detail: "DeFi swap fee via Gateway" },
            { action: "P2P Order",        route: "POST /pay/p2p",      fee: "$0.02", detail: "Order creation fee" },
            { action: "AI Signal",        route: "POST /pay/signal",   fee: "$0.01", detail: "Premium signal per request" },
            { action: "Transfer",         route: "POST /pay/transfer", fee: "$0.03", detail: "Cross-chain transfer fee" },
          ].map(item => (
            <div key={item.action} className="flex items-center justify-between py-2"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <div className="text-[12px]">{item.action}</div>
                <div className="text-[10px] mono" style={{ color: "var(--subtle)" }}>{item.route}</div>
                <div className="text-[10px]" style={{ color: "var(--muted)" }}>{item.detail}</div>
              </div>
              <div className="text-[13px] font-bold mono" style={{ color: "var(--buy)" }}>{item.fee}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] mt-2" style={{ color: "var(--muted)" }}>
          Operations incompatible with Nanopayments (on-chain swaps, cross-chain bridge, wallet signing)
          use their existing protocols automatically.
        </p>
      </div>

      {/* Payment history */}
      {isConnected && (
        <div className="rounded-xl p-4" style={{ background: "var(--surface-mid)", border: "1px solid var(--border)" }}>
          <div className="text-[12px] font-semibold mb-3">Payment History</div>
          {loadingHistory ? (
            <div className="text-center py-4 text-[11px]" style={{ color: "var(--subtle)" }}>Loading...</div>
          ) : payments.length === 0 ? (
            <div className="text-center py-4 text-[11px]" style={{ color: "var(--subtle)" }}>
              No payments yet. Payments appear here after using paid features.
            </div>
          ) : (
            <div className="space-y-2">
              {payments.slice(0, 20).map(p => (
                <div key={p.id} className="flex items-center justify-between py-2"
                  style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: p.status === "settled" ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.1)" }}>
                      {p.status === "settled" ? <CheckCircle2 size={12} style={{ color: "var(--buy)" }} /> : <Clock size={12} style={{ color: "#ca8a04" }} />}
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold capitalize">{p.type}</div>
                      <div className="text-[10px] mono" style={{ color: "var(--subtle)" }}>
                        {new Date(p.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12px] font-bold mono">${p.amount} USDC</div>
                    <div className="text-[10px] capitalize" style={{ color: p.status === "settled" ? "var(--buy)" : "var(--subtle)" }}>{p.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
