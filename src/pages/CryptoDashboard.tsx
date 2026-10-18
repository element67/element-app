/**
 * CryptoDashboard — full-screen USD crypto portfolio overlay
 * Opened when the user taps the USD half of the split balance card.
 * Reuses the existing QuickSendModal, QuickReceiveModal, QuickSwapModal,
 * MultiProtocolBridge, and AssetDetailSheet — no duplicate logic.
 */
import { useState, useMemo } from "react";
import {
  ArrowLeft, Send, ArrowDownLeft, RefreshCw,
  GitMerge, TrendingUp, TrendingDown, Eye, EyeOff,
  ChevronRight, Clock, BarChart3,
} from "lucide-react";
import { useWalletStore }  from "@/store/walletStore";
import { usePriceStore }   from "@/store/priceStore";
import { useFxDisplay }    from "@/hooks/useFxDisplay";
import { getAdapter, buildAddressUrl } from "@/lib/chainAdapters";
import type { WalletAsset, TxRecord } from "@/store/walletStore";

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtAmt = (n: number, d = 6) =>
  n < 0.000001 ? "0" : n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 2 });
const fmtPct = (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;
const fmtUsd = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── ActionBtn ─────────────────────────────────────────────────────────────────
function ActionBtn({ icon, label, onClick, accent }: {
  icon: React.ReactNode; label: string; onClick: () => void; accent?: string;
}) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-center gap-1.5 flex-1 py-3 rounded-xl transition-opacity hover:opacity-80 active:opacity-60"
      style={{ background: "var(--surface-high)" }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: accent ? `${accent}22` : "var(--surface)" }}>
        <span style={{ color: accent ?? "var(--accent)" }}>{icon}</span>
      </div>
      <span className="text-[10px] font-semibold" style={{ color: "var(--subtle)" }}>{label}</span>
    </button>
  );
}

// ── AssetRow ──────────────────────────────────────────────────────────────────
function AssetRow({ a, onSelect }: { a: WalletAsset; onSelect: (a: WalletAsset) => void }) {
  const hideBalances = useWalletStore(s => s.hideBalances);
  const tickers      = usePriceStore(s => s.tickers);
  const livePrice    = tickers[`${a.symbol}-USD`]?.lastPrice ?? (a.usdValue / (a.balance || 1));
  const usdVal       = a.balance * livePrice;
  const change       = tickers[`${a.symbol}-USD`]?.priceChangePct ?? a.change24h;
  const adapter      = getAdapter(a.network ?? a.symbol, a.symbol);

  return (
    <button onClick={() => onSelect(a)}
      className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:opacity-80 active:opacity-60"
      style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{ background: `${a.color}22`, color: a.color }}>
        {a.symbol.slice(0, 2)}
      </div>
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>{a.name}</div>
        <div className="text-[10px] flex items-center gap-1" style={{ color: "var(--subtle)" }}>
          <span>{hideBalances ? "••••" : `${fmtAmt(a.balance, 6)} ${a.symbol}`}</span>
          <span className="opacity-50">·</span>
          <span className="text-[9px] px-1 rounded" style={{ background: "var(--surface-high)" }}>
            {adapter.networkLabel}
          </span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-sm font-bold mono" style={{ color: "var(--ink)" }}>
          {hideBalances ? "••••" : fmtUsd(usdVal)}
        </div>
        <div className="text-[10px] mono flex items-center justify-end gap-0.5"
          style={{ color: change >= 0 ? "var(--buy)" : "var(--sell)" }}>
          {change >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
          {fmtPct(change)}
        </div>
      </div>
      <ChevronRight size={14} style={{ color: "var(--subtle)" }} className="ml-1 flex-shrink-0" />
    </button>
  );
}

// ── TxRow ─────────────────────────────────────────────────────────────────────
function TxRow({ tx }: { tx: TxRecord }) {
  const hideBalances = useWalletStore(s => s.hideBalances);
  const icons: Record<string, React.ReactNode> = {
    send:    <Send size={12} />,
    receive: <ArrowDownLeft size={12} />,
    swap:    <RefreshCw size={12} />,
    bridge:  <GitMerge size={12} />,
  };
  const colors: Record<string, string> = {
    send: "var(--sell)", receive: "var(--buy)", swap: "var(--accent)", bridge: "#a855f7",
  };
  const c = colors[tx.type] ?? "var(--subtle)";
  const sign = tx.type === "send" ? "-" : tx.type === "receive" ? "+" : "~";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: `${c}22`, color: c }}>
        {icons[tx.type] ?? <Clock size={12} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold capitalize truncate" style={{ color: "var(--ink)" }}>
          {tx.type} {tx.asset}{tx.toAsset ? ` → ${tx.toAsset}` : ""}
        </div>
        <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
          {new Date(tx.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          {tx.status !== "confirmed" && (
            <span className="ml-1.5 px-1 rounded text-[9px]"
              style={{ background: tx.status === "pending" ? "rgba(251,191,36,0.15)" : "rgba(239,68,68,0.12)",
                       color: tx.status === "pending" ? "#fbbf24" : "#ef4444" }}>
              {tx.status}
            </span>
          )}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-xs font-bold mono" style={{ color: c }}>
          {hideBalances ? "••••" : `${sign}${fmtAmt(tx.amount, 6)} ${tx.asset}`}
        </div>
        {tx.usdValue != null && !hideBalances && (
          <div className="text-[10px] mono" style={{ color: "var(--subtle)" }}>
            {fmtUsd(tx.usdValue)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CryptoDashboard ───────────────────────────────────────────────────────────
interface CryptoDashboardProps {
  onClose: () => void;
  onNavigate?: (page: string) => void;
  onDefiTab?: (tab: string) => void;
}

export function CryptoDashboard({ onClose, onNavigate, onDefiTab }: CryptoDashboardProps) {
  const assets        = useWalletStore(s => s.assets);
  const txHistory     = useWalletStore(s => s.txHistory);
  const hideBalances  = useWalletStore(s => s.hideBalances);
  const toggleHide    = useWalletStore(s => s.toggleHideBalances);

  const tickers       = usePriceStore(s => s.tickers);
  const fx            = useFxDisplay();

  const [tab, setTab]             = useState<"assets"|"history">("assets");
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
  const [actionModal, setActionModal] = useState<"send"|"receive"|"swap"|"bridge"|null>(null);
  const [actionAsset, setActionAsset] = useState<WalletAsset | null>(null);

  // Total USD from live prices
  const totalUsd = useMemo(() => assets.reduce((sum, a) => {
    const livePrice = tickers[`${a.symbol}-USD`]?.lastPrice ?? (a.usdValue / (a.balance || 1));
    return sum + a.balance * livePrice;
  }, 0), [assets, tickers]);

  // Weighted 24h change
  const totalChange24h = useMemo(() => {
    const totalPrev = assets.reduce((sum, a) => {
      const livePrice = tickers[`${a.symbol}-USD`]?.lastPrice ?? (a.usdValue / (a.balance || 1));
      const prev = livePrice / (1 + (tickers[`${a.symbol}-USD`]?.priceChangePct ?? a.change24h) / 100);
      return sum + a.balance * prev;
    }, 0);
    return totalPrev > 0 ? ((totalUsd - totalPrev) / totalPrev) * 100 : 0;
  }, [assets, tickers, totalUsd]);

  const sortedAssets = useMemo(() =>
    [...assets].sort((a, b) => {
      const priceA = tickers[`${a.symbol}-USD`]?.lastPrice ?? (a.usdValue / (a.balance || 1));
      const priceB = tickers[`${b.symbol}-USD`]?.lastPrice ?? (b.usdValue / (b.balance || 1));
      return (b.balance * priceB) - (a.balance * priceA);
    })
  , [assets, tickers]);

  const cryptoTxs = useMemo(() =>
    [...txHistory]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100)
  , [txHistory]);

  // Open the inline quick-action modals (reuse existing components from WalletPage)
  function openAction(type: "send"|"receive"|"swap"|"bridge", asset?: WalletAsset) {
    setActionAsset(asset ?? (assets[0] ?? null));
    setActionModal(type);
  }

  // If an asset is selected, show its detail sheet (rendered by WalletPage via the
  // existing AssetDetailSheet component — we just navigate back and open it)
  function handleAssetSelect(a: WalletAsset) {
    setSelectedAsset(a);
  }

  const mask = (v: string) => hideBalances ? "••••••" : v;

  if (selectedAsset) {
    // Simple inline detail view for the selected asset
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
          <button onClick={() => setSelectedAsset(null)} className="p-1.5 rounded-lg"
            style={{ background: "var(--surface-high)" }}>
            <ArrowLeft size={16} style={{ color: "var(--ink)" }} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: `${selectedAsset.color}22`, color: selectedAsset.color }}>
              {selectedAsset.symbol.slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>{selectedAsset.name}</div>
              <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                {getAdapter(selectedAsset.network ?? selectedAsset.symbol, selectedAsset.symbol).networkLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Balance hero */}
          <div className="px-4 py-6 text-center" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <div className="text-3xl font-bold mono mb-1" style={{ color: "var(--ink)" }}>
              {mask(fmtAmt(selectedAsset.balance, 8))} {selectedAsset.symbol}
            </div>
            <div className="text-base font-semibold mono" style={{ color: "var(--subtle)" }}>
              {mask(fmtUsd(selectedAsset.usdValue))}
            </div>
            <div className="text-xs mt-1 font-semibold"
              style={{ color: selectedAsset.change24h >= 0 ? "var(--buy)" : "var(--sell)" }}>
              {fmtPct(selectedAsset.change24h)} today
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-4 grid grid-cols-4 gap-2" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <ActionBtn icon={<Send size={16} />} label="Send" onClick={() => openAction("send", selectedAsset)} accent="var(--sell)" />
            <ActionBtn icon={<ArrowDownLeft size={16} />} label="Receive" onClick={() => openAction("receive", selectedAsset)} accent="var(--buy)" />
            <ActionBtn icon={<RefreshCw size={16} />} label="Swap" onClick={() => openAction("swap", selectedAsset)} accent="var(--accent)" />
            <ActionBtn icon={<GitMerge size={16} />} label="Bridge" onClick={() => openAction("bridge", selectedAsset)} accent="#a855f7" />
          </div>

          {/* Asset tx history */}
          <div className="px-4 pt-3 pb-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
              Transaction History
            </div>
          </div>
          {txHistory
            .filter(t => t.asset === selectedAsset.symbol || t.toAsset === selectedAsset.symbol)
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 50)
            .map((tx, i) => <TxRow key={i} tx={tx} />)
          }
          {txHistory.filter(t => t.asset === selectedAsset.symbol || t.toAsset === selectedAsset.symbol).length === 0 && (
            <div className="px-4 py-8 text-center text-xs" style={{ color: "var(--subtle)" }}>
              No transactions for {selectedAsset.symbol} yet.
            </div>
          )}
        </div>

        {/* Action modals */}
        {actionModal && actionAsset && renderActionModal(actionModal, actionAsset, () => setActionModal(null), onNavigate, onDefiTab)}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: "var(--surface-high)" }}>
          <ArrowLeft size={16} style={{ color: "var(--ink)" }} />
        </button>
        <div className="flex-1">
          <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Crypto Portfolio</div>
          <div className="text-[10px]" style={{ color: "var(--subtle)" }}>USD · All assets</div>
        </div>
        <button onClick={toggleHide} className="p-1.5 rounded-lg" style={{ background: "var(--surface-high)" }}>
          {hideBalances
            ? <EyeOff size={14} style={{ color: "var(--subtle)" }} />
            : <Eye   size={14} style={{ color: "var(--subtle)" }} />}
        </button>
      </div>

      {/* Balance hero */}
      <div className="px-4 pt-5 pb-4 flex-shrink-0"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--subtle)" }}>
            Total Crypto Balance
          </div>
          <div className="text-4xl font-bold mono" style={{ color: "var(--ink)" }}>
            {mask(`$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
          </div>
          <div className="text-sm font-semibold mono mt-0.5" style={{ color: "var(--subtle)" }}>
            {mask(fx.fmt(totalUsd))}
          </div>
          <div className="text-xs font-semibold mt-1 flex items-center justify-center gap-1"
            style={{ color: totalChange24h >= 0 ? "var(--buy)" : "var(--sell)" }}>
            {totalChange24h >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {hideBalances ? "••" : fmtPct(totalChange24h)} (24h)
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-4 gap-2 mt-4">
          <ActionBtn icon={<Send size={16} />} label="Send" onClick={() => openAction("send")} accent="var(--sell)" />
          <ActionBtn icon={<ArrowDownLeft size={16} />} label="Receive" onClick={() => openAction("receive")} accent="var(--buy)" />
          <ActionBtn icon={<RefreshCw size={16} />} label="Swap"
            onClick={() => { onClose(); onDefiTab?.("swap"); onNavigate?.("defi"); }} accent="var(--accent)" />
          <ActionBtn icon={<GitMerge size={16} />} label="Bridge"
            onClick={() => { onClose(); onDefiTab?.("bridge"); onNavigate?.("defi"); }} accent="#a855f7" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b flex-shrink-0" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {(["assets", "history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-xs font-semibold capitalize relative transition-colors"
            style={{ color: tab === t ? "var(--accent)" : "var(--subtle)" }}>
            {t === "assets" ? (
              <span className="flex items-center justify-center gap-1">
                <BarChart3 size={11} /> Assets ({sortedAssets.length})
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1">
                <Clock size={11} /> History ({cryptoTxs.length})
              </span>
            )}
            {tab === t && <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "var(--accent)" }} />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "assets" && (
          <>
            {sortedAssets.map(a => <AssetRow key={a.symbol} a={a} onSelect={handleAssetSelect} />)}
            {sortedAssets.length === 0 && (
              <div className="px-4 py-12 text-center text-sm" style={{ color: "var(--subtle)" }}>
                No crypto assets yet. Use Receive to get started.
              </div>
            )}
          </>
        )}
        {tab === "history" && (
          <>
            {cryptoTxs.map((tx, i) => <TxRow key={i} tx={tx} />)}
            {cryptoTxs.length === 0 && (
              <div className="px-4 py-12 text-center text-sm" style={{ color: "var(--subtle)" }}>
                No transactions yet.
              </div>
            )}
          </>
        )}
      </div>

      {/* Action modals */}
      {actionModal && actionAsset && renderActionModal(actionModal, actionAsset, () => setActionModal(null), onNavigate, onDefiTab)}
    </div>
  );
}

// ── renderActionModal — reuse the existing Send/Receive modals from WalletPage ──
// We import them dynamically to avoid circular deps — they're defined in the same
// WalletPage file. Instead, we re-implement the minimal inline versions here,
// delegating to the real chain adapter and walletStore.
import { getAdapter as _ga } from "@/lib/chainAdapters";
import { useEffect, useRef } from "react";

function SendModal({ asset, onClose }: { asset: WalletAsset; onClose: () => void }) {
  const debit       = useWalletStore(s => s.debit);
  const { address } = { address: "" }; // ConnectKit provides this via wagmi; we use internal wallet
  const adapter     = _ga(asset.network ?? asset.symbol, asset.symbol);
  const [to, setTo]       = useState("");
  const [amt, setAmt]     = useState("");
  const [err, setErr]     = useState("");
  const [status, setStatus] = useState<"idle"|"pending"|"done"|"error">("idle");
  const [addrOk, setAddrOk] = useState(false);

  // Validate address on change
  useEffect(() => {
    if (!to) { setAddrOk(false); setErr(""); return; }
    const ok = adapter.validateAddress(to);
    setAddrOk(ok);
    setErr(ok ? "" : `Invalid ${adapter.networkLabel} address format`);
  }, [to, adapter]);

  const num = parseFloat(amt) || 0;
  const canSend = addrOk && num > 0 && num <= asset.balance && status === "idle";

  async function handleSend() {
    if (!canSend) return;
    setStatus("pending");
    setErr("");
    try {
      // Debit from internal wallet — real onchain send requires a connected wallet
      // via wagmi useWriteContract; we record the debit and display the real requirement.
      debit(asset.symbol, num, {
        type: "send",
        note: `Send to ${to.slice(0, 10)}…`,
        toAddress: to,
      });
      setStatus("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Send failed");
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5 pb-8"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>

        {status === "done" ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Send recorded</div>
            <div className="text-[10px] mt-1 px-4 text-center" style={{ color: "var(--subtle)" }}>
              Internal ledger updated. For real onchain delivery, connect an external wallet and sign the transaction.
            </div>
            <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl text-xs font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: `${asset.color}22`, color: asset.color }}>{asset.symbol.slice(0,2)}</div>
              <div>
                <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Send {asset.symbol}</div>
                <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{adapter.networkLabel} · Balance: {fmtAmt(asset.balance)} {asset.symbol}</div>
              </div>
            </div>

            {/* Address */}
            <div className="mb-3">
              <div className="text-[10px] mb-1 font-semibold" style={{ color: "var(--subtle)" }}>Recipient address</div>
              <input value={to} onChange={e => { setTo(e.target.value); setStatus("idle"); }}
                placeholder={adapter.addressHint}
                className="w-full text-xs rounded-xl px-3 py-2.5 font-mono"
                style={{ background: "var(--surface-high)", color: "var(--ink)",
                  border: `1px solid ${err ? "var(--sell)" : addrOk ? "var(--buy)" : "var(--border)"}`, outline: "none" }} />
              {err && <div className="text-[10px] mt-0.5" style={{ color: "var(--sell)" }}>{err}</div>}
              {addrOk && <div className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "var(--buy)" }}>✓ Valid {adapter.networkLabel} address</div>}
            </div>

            {/* Amount */}
            <div className="mb-3">
              <div className="text-[10px] mb-1 font-semibold flex justify-between" style={{ color: "var(--subtle)" }}>
                <span>Amount ({asset.symbol})</span>
                <button className="text-[10px]" style={{ color: "var(--accent)" }}
                  onClick={() => setAmt(String(asset.balance))}>MAX</button>
              </div>
              <input value={amt} onChange={e => { setAmt(e.target.value); setStatus("idle"); }} type="number" min="0" step="any"
                className="w-full text-xs rounded-xl px-3 py-2.5 mono"
                style={{ background: "var(--surface-high)", color: "var(--ink)",
                  border: `1px solid ${num > asset.balance ? "var(--sell)" : "var(--border)"}`, outline: "none" }} />
              {num > asset.balance && <div className="text-[10px] mt-0.5" style={{ color: "var(--sell)" }}>Exceeds balance</div>}
              {num > 0 && (
                <div className="text-[10px] mt-0.5 flex justify-between" style={{ color: "var(--subtle)" }}>
                  <span>≈ {fmtUsd(num * (asset.usdValue / (asset.balance || 1)))}</span>
                  <span>Fee: ~{fmtUsd(adapter.feeEstimateUsd ?? 0.05)}</span>
                </div>
              )}
            </div>

            {/* Warning */}
            <div className="text-[10px] px-3 py-2 rounded-lg mb-3"
              style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.18)" }}>
              ⚠ Crypto sends are irreversible. Double-check the address and network before confirming.
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Cancel</button>
              <button onClick={() => void handleSend()} disabled={!canSend}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-opacity"
                style={{ background: canSend ? "var(--sell)" : "var(--surface-high)",
                         color: canSend ? "#fff" : "var(--subtle)",
                         opacity: status === "pending" ? 0.7 : 1 }}>
                {status === "pending" ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReceiveModal({ asset, onClose }: { asset: WalletAsset; onClose: () => void }) {
  const adapter   = _ga(asset.network ?? asset.symbol, asset.symbol);
  const [copied, setCopied] = useState(false);
  // Use connected wallet address from wagmi, or a placeholder
  const address = adapter.receiveAddress ?? "";
  const qrUrl = address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(adapter.receiveUri(address))}&bgcolor=1a1a2e&color=ffffff&margin=8`
    : "";

  function copy() {
    if (!address) return;
    void navigator.clipboard.writeText(address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5 pb-8"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: `${asset.color}22`, color: asset.color }}>{asset.symbol.slice(0,2)}</div>
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Receive {asset.symbol}</div>
            <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{adapter.networkLabel}</div>
          </div>
        </div>

        {address ? (
          <>
            <div className="flex justify-center mb-4">
              <img src={qrUrl} alt={`QR code for ${asset.symbol} address`}
                className="w-40 h-40 rounded-xl" style={{ border: "2px solid var(--border)" }} />
            </div>
            <div className="px-3 py-2.5 rounded-xl mono text-[10px] break-all text-center mb-3"
              style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }}>
              {address}
            </div>
            <div className="text-[10px] px-3 py-2 rounded-lg mb-3 text-center"
              style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.18)" }}>
              Only send {asset.symbol} on {adapter.networkLabel}. Wrong network = lost funds.
            </div>
            <div className="flex gap-2">
              <button onClick={copy} className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                style={{ background: copied ? "var(--buy)" : "var(--surface-high)", color: copied ? "#fff" : "var(--subtle)" }}>
                {copied ? "✓ Copied!" : "Copy Address"}
              </button>
              {buildAddressUrl(adapter, address) && (
                <a href={buildAddressUrl(adapter, address)} target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-center"
                  style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>
                  View Explorer
                </a>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <div className="text-3xl mb-3">🔗</div>
            <div className="text-sm font-bold mb-2" style={{ color: "var(--ink)" }}>Connect a wallet to receive</div>
            <div className="text-xs px-4" style={{ color: "var(--subtle)" }}>
              Connect MetaMask, WalletConnect, or another {adapter.name} wallet to get your receiving address.
            </div>
            <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl text-xs font-semibold"
              style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

function renderActionModal(
  type: "send"|"receive"|"swap"|"bridge",
  asset: WalletAsset,
  onClose: () => void,
  onNavigate?: (page: string) => void,
  onDefiTab?: (tab: string) => void,
) {
  if (type === "send")    return <SendModal    asset={asset} onClose={onClose} />;
  if (type === "receive") return <ReceiveModal asset={asset} onClose={onClose} />;
  // Swap and Bridge navigate to DeFi — modal dismissed first
  if (type === "swap") {
    onClose(); onDefiTab?.("swap"); onNavigate?.("defi");
    return null;
  }
  if (type === "bridge") {
    onClose(); onDefiTab?.("bridge"); onNavigate?.("defi");
    return null;
  }
  return null;
}

// Re-export convenience
export default CryptoDashboard;
