/**
 * WalletPage — built-in multi-asset wallet
 * Shows balances, send/receive, swap, history, deposit/withdraw
 */
import { useState, useMemo } from "react";
import {
  Send, Download, ArrowUpDown, Plus, Eye, EyeOff,
  Copy, CheckCircle2, ChevronRight, Clock, ArrowUpRight,
  ArrowDownLeft, RefreshCw, Shield, Banknote, Coins, TrendingUp, TrendingDown,
} from "lucide-react";
import { useWalletStore, type TxRecord, type WalletAsset } from "@/store/walletStore";
import { useFiatStore, FIAT_COUNTRIES } from "@/store/fiatStore";
import { usePriceStore } from "@/store/priceStore";
import type { Page } from "@/App";
import { useFxDisplay }  from "@/hooks/useFxDisplay";
import { getAdapter, validateAddress, estimateFeeUsd, receiveUri, buildAddressUrl } from "@/lib/chainAdapters";
import { LivePriceStrip } from "@/components/LivePriceStrip";
import { P2PRateBar }     from "@/components/P2PRateBar";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { BankDepositModal } from "@/components/BankDepositModal";
import { NGNAccountPage }    from "@/pages/NGNAccountPage";
import { CryptoDashboard }  from "@/pages/CryptoDashboard";


// ── helpers ──────────────────────────────────────────────────────────────────
function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtAmt(n: number, dec = 6) {
  if (n === 0) return "0";
  if (n < 0.000001) return n.toExponential(3);
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}
function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtTs(ts: number) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = (now - ts) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TX_ICON: Record<string, React.ReactNode> = {
  send:    <ArrowUpRight size={14} />,
  receive: <ArrowDownLeft size={14} />,
  swap:    <ArrowUpDown size={14} />,
  buy:     <Plus size={14} />,
  sell:    <ArrowUpRight size={14} />,
  p2p:     <ArrowUpDown size={14} />,
  deposit: <Download size={14} />,
  withdraw:<Send size={14} />,
  escrow_lock:   <Shield size={14} />,
  escrow_release:<Shield size={14} />,
};

const TX_COLOR: Record<string, string> = {
  send: "var(--sell)", receive: "var(--buy)", swap: "var(--accent)",
  buy: "var(--buy)", sell: "var(--sell)", p2p: "var(--accent)",
  deposit: "var(--buy)", withdraw: "var(--sell)",
  escrow_lock: "var(--subtle)", escrow_release: "var(--buy)",
};

// ── AssetRow ─────────────────────────────────────────────────────────────────
function AssetRow({ a, onSelect, displayMode = "USD" }: {
  a: WalletAsset;
  onSelect: (a: WalletAsset) => void;
  displayMode?: "USD" | "LOCAL";
}) {
  const hideBalances = useWalletStore(s => s.hideBalances);
  const fx = useFxDisplay();
  const valueDisplay = displayMode === "LOCAL"
    ? fx.fmt(a.usdValue, hideBalances)
    : (hideBalances ? "••••" : `$${a.usdValue.toLocaleString("en-US",{ minimumFractionDigits:2, maximumFractionDigits:2 })}`);
  return (
    <button
      onClick={() => onSelect(a)}
      className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:opacity-80 active:opacity-60"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
        style={{ background: `${a.color}22`, color: a.color }}>
        {a.symbol.slice(0,2)}
      </div>
      <div className="flex-1 text-left">
        <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{a.name}</div>
        <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
          {hideBalances ? "••••" : `${fmtAmt(a.balance)} ${a.symbol}`}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs font-bold mono" style={{ color: "var(--ink)" }}>
          {valueDisplay}
        </div>
        <div className="text-[10px] mono" style={{ color: a.change24h >= 0 ? "var(--buy)" : "var(--sell)" }}>
          {fmtPct(a.change24h)}
        </div>
      </div>
      <ChevronRight size={14} style={{ color: "var(--subtle)", flexShrink: 0 }} />
    </button>
  );
}

// ── TxRow ─────────────────────────────────────────────────────────────────────
function TxRow({ tx }: { tx: TxRecord }) {
  const hideBalances = useWalletStore(s => s.hideBalances);
  const isOut = ["send","sell","withdraw","escrow_lock"].includes(tx.type);
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: `${TX_COLOR[tx.type]}22`, color: TX_COLOR[tx.type] }}>
        {TX_ICON[tx.type] ?? <RefreshCw size={14} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold capitalize" style={{ color: "var(--ink)" }}>
          {tx.type.replace("_"," ")} {tx.asset}
          {tx.toAsset ? ` → ${tx.toAsset}` : ""}
        </div>
        <div className="text-[10px] truncate" style={{ color: "var(--subtle)" }}>
          {tx.note ?? (tx.to ? `To ${tx.to.slice(0,10)}…` : fmtTs(tx.createdAt))}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="text-xs font-bold mono" style={{ color: isOut ? "var(--sell)" : "var(--buy)" }}>
          {isOut ? "-" : "+"}{hideBalances ? "••••" : fmtAmt(tx.amount)} {tx.asset}
        </div>
        <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium`} style={{
            background: tx.status === "completed" ? "rgba(74,222,128,0.1)"
              : tx.status === "failed" ? "rgba(248,113,113,0.1)"
              : tx.status === "pending" ? "rgba(251,191,36,0.1)"
              : "var(--surface-high)",
            color: tx.status === "completed" ? "var(--buy)"
              : tx.status === "failed" ? "var(--sell)"
              : tx.status === "pending" ? "#fbbf24"
              : "var(--subtle)",
          }}>{tx.status}</span>
        </div>
      </div>
    </div>
  );
}

// ── QuickSendModal ────────────────────────────────────────────────────────────
function QuickSendModal({ asset, onClose }: { asset: WalletAsset; onClose: () => void }) {
  const debit       = useWalletStore(s => s.debit);
  const _livePrices = useWalletStore(s => s._livePrices);
  const fx          = useFxDisplay();
  const adapter     = getAdapter(asset.network, asset.symbol);

  const [to,    setTo]    = useState("");
  const [amt,   setAmt]   = useState("");
  const [sent,  setSent]  = useState(false);
  const [err,   setErr]   = useState("");
  const [addrErr, setAddrErr] = useState("");

  const price  = _livePrices[asset.symbol] ?? asset.usdValue / (asset.balance || 1);
  const numAmt = parseFloat(amt) || 0;
  const usdVal = numAmt * price;
  const fee    = estimateFeeUsd(adapter, _livePrices);

  function handleAddrChange(v: string) {
    setTo(v);
    if (v.trim()) {
      const res = validateAddress(v, adapter);
      setAddrErr(res.valid ? "" : (res.error ?? "Invalid address"));
    } else {
      setAddrErr("");
    }
  }

  function handleSend() {
    setErr("");
    const addrCheck = validateAddress(to, adapter);
    if (!addrCheck.valid) return setErr(addrCheck.error ?? "Invalid address");
    if (numAmt <= 0) return setErr("Enter an amount");
    if (numAmt > asset.balance) return setErr("Insufficient balance");
    const id = debit(asset.symbol, numAmt, {
      type: "send", to: to.trim(),
      note: `Send ${asset.symbol} on ${adapter.name}`,
    });
    if (!id) return setErr("Insufficient balance");
    setSent(true);
    setTimeout(onClose, 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>
        {sent ? (
          <div className="text-center py-8">
            <CheckCircle2 size={44} className="mx-auto mb-3" style={{ color: "var(--buy)" }} />
            <div className="text-sm font-bold mb-1" style={{ color: "var(--ink)" }}>Sent!</div>
            <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
              {numAmt} {asset.symbol} on {adapter.name}
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Send {asset.symbol}</div>
                <div className="text-[10px] mt-0.5 px-2 py-0.5 rounded-full inline-block"
                  style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>
                  {adapter.name}
                </div>
              </div>
              <button onClick={onClose} style={{ color: "var(--subtle)" }}>✕</button>
            </div>

            <div className="space-y-3">
              {/* Address */}
              <div>
                <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                  Recipient {adapter.name} address
                </div>
                <input value={to} onChange={e => handleAddrChange(e.target.value)}
                  placeholder={adapter.addressPlaceholder}
                  className="w-full text-xs rounded-lg px-3 py-2.5"
                  style={{
                    background: "var(--surface-high)", color: "var(--ink)", outline: "none",
                    border: `1px solid ${addrErr ? "var(--sell)" : "var(--border)"}`,
                  }} />
                {addrErr && <div className="text-[10px] mt-1" style={{ color: "var(--sell)" }}>{addrErr}</div>}
                {!addrErr && to && (
                  <div className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "var(--buy)" }}>
                    <CheckCircle2 size={10} /> Valid {adapter.name} address
                  </div>
                )}
                <div className="text-[9px] mt-1" style={{ color: "var(--subtle)" }}>{adapter.addressHint}</div>
              </div>

              {/* Amount */}
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span style={{ color: "var(--subtle)" }}>Amount ({asset.symbol})</span>
                  <button onClick={() => setAmt(String(asset.balance))}
                    className="text-[10px] font-semibold" style={{ color: "var(--accent)" }}>Max</button>
                </div>
                <input value={amt} onChange={e => setAmt(e.target.value)} type="number" min="0" step="any"
                  placeholder="0.00"
                  className="w-full text-xs rounded-lg px-3 py-2.5"
                  style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)", outline: "none" }} />
                <div className="flex justify-between text-[9px] mt-1">
                  <span style={{ color: "var(--subtle)" }}>Balance: {asset.balance} {asset.symbol}</span>
                  {numAmt > 0 && <span style={{ color: "var(--subtle)" }}>≈ {fx.fmt(usdVal)}</span>}
                </div>
              </div>

              {/* Fee estimate */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg text-[10px]"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--subtle)" }}>Network fee ({adapter.name})</span>
                <span style={{ color: "var(--ink)" }}>{fee.label}</span>
              </div>

              {err && <div className="text-[10px] px-3 py-2 rounded-lg"
                style={{ background: "rgba(248,113,113,0.1)", color: "var(--sell)" }}>{err}</div>}

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                  style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Cancel</button>
                <button onClick={handleSend}
                  disabled={!!addrErr || !to || numAmt <= 0}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
                  style={{ background: "var(--accent)", color: "#fff" }}>Send {asset.symbol}</button>
              </div>

              <div className="text-[9px] text-center" style={{ color: "var(--subtle)" }}>
                Transactions on {adapter.name} are irreversible. Double-check the address before sending.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── QR Code component (pure SVG, no library) ─────────────────────────────────
// Uses a simple URL-based QR service (Google Charts API alternative via qr-server.com)
function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&margin=10&color=000000&bgcolor=ffffff&format=svg`;
  return (
    <div className="rounded-xl overflow-hidden mx-auto"
      style={{ width: size, height: size, background: "#fff", border: "3px solid #fff" }}>
      <img src={url} width={size} height={size} alt="QR code" loading="lazy"
        style={{ display: "block", imageRendering: "pixelated" }} />
    </div>
  );
}

// ── QuickReceiveModal ─────────────────────────────────────────────────────────
function QuickReceiveModal({ asset, onClose }: { asset: WalletAsset; onClose: () => void }) {
  const adapter   = getAdapter(asset.network, asset.symbol);
  const addr      = asset.address ?? "";
  const qrValue   = addr ? receiveUri(adapter, addr, asset.symbol) : "";
  const explorerUrl = addr ? buildAddressUrl(adapter, addr) : "";
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!addr) return;
    void navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Receive {asset.symbol}</div>
            <div className="text-[10px] mt-0.5 px-2 py-0.5 rounded-full inline-block"
              style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>
              {adapter.name}
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--subtle)" }}>✕</button>
        </div>

        {addr ? (
          <>
            {/* QR Code */}
            <div className="flex justify-center mb-4">
              <QRCode value={qrValue} size={180} />
            </div>

            {/* Network badge */}
            <div className="text-[10px] text-center mb-2 font-semibold" style={{ color: "var(--subtle)" }}>
              Only send <span style={{ color: "var(--ink)" }}>{asset.symbol}</span> on the{" "}
              <span style={{ color: "var(--accent)" }}>{adapter.name}</span> network to this address.
            </div>

            {/* Address box */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3"
              style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
              <span className="flex-1 text-[11px] font-mono break-all leading-relaxed"
                style={{ color: "var(--ink)" }}>{addr}</span>
              <button onClick={copy} className="flex-shrink-0 ml-2">
                {copied
                  ? <CheckCircle2 size={16} style={{ color: "var(--buy)" }} />
                  : <Copy size={16} style={{ color: "var(--subtle)" }} />}
              </button>
            </div>

            {/* Actions row */}
            <div className="flex gap-2 mb-3">
              <button onClick={copy}
                className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ background: "var(--accent)", color: "#fff" }}>
                <Copy size={12} /> {copied ? "Copied!" : "Copy address"}
              </button>
              {explorerUrl && (
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{ background: "var(--surface-high)", color: "var(--subtle)", textDecoration: "none" }}>
                  View on explorer ↗
                </a>
              )}
            </div>

            <div className="text-[9px] text-center px-2" style={{ color: "var(--subtle)" }}>
              Sending the wrong asset or using the wrong network will result in permanent loss of funds.
            </div>
          </>
        ) : (
          /* No address configured */
          <div className="text-center py-8">
            <div className="text-3xl mb-3">🔗</div>
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--ink)" }}>
              No receive address configured
            </div>
            <div className="text-[11px] mb-4" style={{ color: "var(--subtle)" }}>
              Connect an external {adapter.name} wallet or set up a custodial wallet to get a receive address for {asset.symbol}.
            </div>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-xs font-semibold"
              style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── QuickDepositModal ─────────────────────────────────────────────────────────
function QuickDepositModal({ asset, onClose }: { asset: WalletAsset; onClose: () => void }) {
  const credit      = useWalletStore(s => s.credit);
  const _livePrices = useWalletStore(s => s._livePrices);
  const fx = useFxDisplay();
  const [amt, setAmt] = useState("100");
  const [done, setDone] = useState(false);
  const price = _livePrices[asset.symbol] ?? 1;
  const num = parseFloat(amt) || 0;

  function handleDeposit() {
    if (num <= 0) return;
    credit(asset.symbol, num, { type: "deposit", note: "Manual deposit (testnet)" });
    setDone(true);
    setTimeout(onClose, 1800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: "var(--buy)" }} />
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Deposited!</div>
            <div className="text-xs mt-1" style={{ color: "var(--subtle)" }}>Testnet deposit credited</div>
          </div>
        ) : (
          <>
            <div className="text-sm font-bold mb-1" style={{ color: "var(--ink)" }}>Deposit {asset.symbol}</div>
            <div className="text-[10px] mb-4 px-3 py-2 rounded-lg" style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
              Testnet demo — funds are simulated and have no real-world value.
            </div>
            <div className="mb-3">
              <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>Amount ({asset.symbol})</div>
              <input value={amt} onChange={e => setAmt(e.target.value)} type="number" min="0"
                className="w-full text-xs rounded-lg px-3 py-2"
                style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)", outline: "none" }} />
              {num > 0 && <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>≈ {fx.fmt(num * price)}</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Cancel</button>
              <button onClick={handleDeposit} className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                style={{ background: "var(--buy)", color: "#fff" }}>Deposit</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── AssetDetailSheet ──────────────────────────────────────────────────────────
function AssetDetailSheet({ asset, onClose }: { asset: WalletAsset; onClose: () => void }) {
  const txHistory    = useWalletStore(s => s.txHistory);
  const hideBalances = useWalletStore(s => s.hideBalances);
  const tickers      = usePriceStore(s => s.tickers);
  const fx = useFxDisplay();
  const [modal, setModal] = useState<"send"|"receive"|"deposit"|null>(null);

  const assetTxs = useMemo(() =>
    txHistory.filter(t => t.asset === asset.symbol || t.toAsset === asset.symbol)
      .sort((a,b) => b.createdAt - a.createdAt)
      .slice(0, 50)
  , [txHistory, asset.symbol]);

  const livePrice = tickers[`${asset.symbol}-USD`]?.lastPrice ?? (asset.usdValue / (asset.balance || 1));
  const usdVal = asset.balance * livePrice;

  return (
    <>
      <div className="fixed inset-0 z-40 flex flex-col"
        style={{ background: "var(--bg)" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: "var(--surface)" }}>
            <ChevronRight size={16} style={{ color: "var(--ink)", transform: "rotate(180deg)" }} />
          </button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: `${asset.color}22`, color: asset.color }}>
            {asset.symbol.slice(0,2)}
          </div>
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>{asset.name}</div>
            <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{asset.symbol}</div>
          </div>
        </div>

        {/* Balance hero */}
        <div className="text-center py-6 px-4">
          <div className="text-2xl font-bold mono mb-1" style={{ color: "var(--ink)" }}>
            {hideBalances ? "••••••" : `${fmtAmt(asset.balance)} ${asset.symbol}`}
          </div>
          <div className="text-sm" style={{ color: "var(--subtle)" }}>
            {fx.fmt(usdVal, hideBalances)}
          </div>
          <div className="text-xs mt-0.5" style={{ color: asset.change24h >= 0 ? "var(--buy)" : "var(--sell)" }}>
            {fmtPct(asset.change24h)} today
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-3 px-4 pb-4">
          {([
            { label: "Send",    icon: <Send size={16}/>,     action: "send"    as const },
            { label: "Receive", icon: <Download size={16}/>, action: "receive" as const },
            { label: "Deposit", icon: <Plus size={16}/>,     action: "deposit" as const },
          ] as const).map(({ label, icon, action }) => (
            <button key={action} onClick={() => setModal(action)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "var(--surface-high)", color: "var(--accent)" }}>
                {icon}
              </div>
              {label}
            </button>
          ))}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 px-4 mb-4">
          {[
            { label: "Price",    val: fx.fmt(livePrice) },
            { label: "24h Chg",  val: fmtPct(asset.change24h) },
            { label: "Holdings", val: fx.fmt(usdVal) },
          ].map(({ label, val }) => (
            <div key={label} className="p-2.5 rounded-xl text-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-[10px] mb-0.5" style={{ color: "var(--subtle)" }}>{label}</div>
              <div className="text-xs font-bold mono" style={{ color: "var(--ink)" }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Tx history */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
            Transaction History
          </div>
          {assetTxs.length === 0 ? (
            <div className="text-center py-8">
              <Clock size={24} className="mx-auto mb-2" style={{ color: "var(--subtle)" }} />
              <div className="text-xs" style={{ color: "var(--subtle)" }}>No transactions yet</div>
            </div>
          ) : (
            assetTxs.map(tx => <TxRow key={tx.id} tx={tx} />)
          )}
        </div>
      </div>

      {modal === "send"    && <QuickSendModal    asset={asset} onClose={() => setModal(null)} />}
      {modal === "receive" && <QuickReceiveModal asset={asset} onClose={() => setModal(null)} />}
      {modal === "deposit" && <QuickDepositModal asset={asset} onClose={() => setModal(null)} />}
    </>
  );
}

// ── SplitBalanceCard ─────────────────────────────────────────────────────────
interface SplitBalanceCardProps {
  totalUsd: number;
  totalChange24h: number;
  hideBalances: boolean;
  toggleHide: () => void;
  onDeposit: (currency: string) => void;
  onSwap: () => void;
  onNgnTap?: () => void;
  onUsdTap?: () => void;
}
function SplitBalanceCard({ totalUsd, totalChange24h, hideBalances, toggleHide, onDeposit, onSwap, onNgnTap, onUsdTap }: SplitBalanceCardProps) {
  const fiatBalances = useFiatStore(s => s.balances);

  // Use walletStore country to find the right fiat balance dynamically
  const userCountry  = useWalletStore(s => s.userCountry);
  const primaryFiat  = useWalletStore(s => s.primaryFiat);
  const primaryFiatBalance = fiatBalances.find(b => b.currency === primaryFiat)
    ?? fiatBalances.find(b => b.currency !== "USD")
    ?? fiatBalances[0];
  const fiatCurrency = primaryFiatBalance?.currency ?? primaryFiat;
  const fiatBal = primaryFiatBalance?.balance ?? 0;
  const fiatConfig = FIAT_COUNTRIES.find(c => c.currency === fiatCurrency)
    ?? FIAT_COUNTRIES.find(c => c.countryCode === userCountry);
  const fiatSymbol = fiatConfig?.symbol ?? primaryFiatBalance?.symbol ?? "₦";

  // Approximate USD equiv of fiat balance (display only)
  const APPROX_RATE: Record<string, number> = {
    NGN:1650, GHS:15.5, KES:130, ZAR:18.5, GBP:0.79, EUR:0.92, USD:1, TZS:2650, UGX:3750,
  };
  const fiatUsdApprox = fiatBal / (APPROX_RATE[fiatCurrency] ?? 1);

  const mask = (v: string) => hideBalances ? "••••••" : v;

  return (
    <div className="px-4 pt-4 pb-3" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>

      {/* Controls row — eye + currency switcher */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
          Balances
        </div>
        <div className="flex items-center gap-2">
          <CurrencySwitcher variant="fab" />
          <button onClick={toggleHide} className="p-1.5 rounded-lg" style={{ background: "var(--surface-high)" }}>
            {hideBalances
              ? <EyeOff size={14} style={{ color: "var(--subtle)" }} />
              : <Eye   size={14} style={{ color: "var(--subtle)" }} />}
          </button>
        </div>
      </div>

      {/* Split card */}
      <div className="flex rounded-2xl overflow-hidden" style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>

        {/* LEFT — USD (crypto portfolio) */}
        <div className="flex-1 px-3 py-3 min-w-0">
          <div className="text-[10px] font-semibold mb-1.5 flex items-center gap-1" style={{ color: "var(--subtle)" }}>
            USD
          </div>
          <div className="text-lg font-bold mono leading-tight truncate" style={{ color: "var(--ink)" }}>
            {mask(`$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
          </div>
          <div className="text-[10px] mono font-semibold mt-1"
            style={{ color: totalChange24h >= 0 ? "var(--buy)" : "var(--sell)" }}>
            {hideBalances ? "••" : `${totalChange24h >= 0 ? "+" : ""}${totalChange24h.toFixed(2)}% (24h)`}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch" style={{ background: "var(--border)" }} />

        {/* RIGHT — Local fiat (NGN etc.) — tap to open NGN account */}
        <button onClick={onNgnTap} className="flex-1 px-3 py-3 min-w-0 text-left transition-opacity hover:opacity-80 active:opacity-60"
          style={{ background: "transparent" }}>
          <div className="text-[10px] font-semibold mb-1.5 flex items-center gap-1.5" style={{ color: "var(--subtle)" }}>
            {fiatConfig && (
              <img
                src={`https://flagcdn.com/w20/${fiatConfig.countryCode.toLowerCase()}.png`}
                srcSet={`https://flagcdn.com/w40/${fiatConfig.countryCode.toLowerCase()}.png 2x`}
                alt={fiatCurrency}
                className="w-4 h-3 rounded-[2px] object-cover shrink-0"
                onError={e => { e.currentTarget.style.display = "none"; }}
              />
            )}
            {fiatCurrency}
          </div>
          <div className="text-lg font-bold mono leading-tight truncate" style={{ color: "var(--ink)" }}>
            {mask(`${fiatSymbol}${fiatBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
          </div>
          <div className="text-[10px] mono mt-1" style={{ color: "var(--subtle)" }}>
            {hideBalances ? "••" : `≈ ${fmtUsd(fiatUsdApprox)}`}
          </div>
          {onNgnTap && <div className="text-[9px] mt-1.5" style={{ color: "var(--accent)" }}>Tap to manage →</div>}
        </button>
      </div>

      {/* Disclaimer */}
      <div className="text-[9px] mt-1.5 mb-2.5" style={{ color: "var(--subtle)" }}>
        Crypto and fiat balances are separate and never combined into a single spendable pool.
      </div>

      {/* Deposit button under right half + quick actions */}
      <div className="flex items-center gap-2">
        {/* Quick actions aligned to left */}
        {[
          { icon: <Send size={14}/>,        label: "Send",    color: "var(--sell)",   fn: () => {} },
          { icon: <Download size={14}/>,    label: "Receive", color: "var(--buy)",    fn: () => {} },
          { icon: <ArrowUpDown size={14}/>, label: "Swap",    color: "var(--accent)", fn: onSwap   },
          { icon: <Plus size={14}/>,        label: "Buy",     color: "#fbbf24",       fn: () => onDeposit(fiatCurrency) },
        ].map(({ icon, label, color, fn }) => (
          <button key={label} onClick={fn}
            className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl text-[10px] font-semibold"
            style={{ background: "var(--surface-high)", color: "var(--ink)" }}>
            <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${color}22`, color }}>
              {icon}
            </div>
            {label}
          </button>
        ))}
      </div>

      {/* Deposit fiat CTA — aligned under right half */}
      <div className="flex justify-end mt-2">
        <button
          onClick={() => onDeposit(fiatCurrency)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold"
          style={{ background: "rgba(99,102,241,0.12)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <Banknote size={11} />
          Deposit {fiatCurrency}
        </button>
      </div>
    </div>
  );
}

// ── WalletPage ────────────────────────────────────────────────────────────────
interface WalletPageProps {
  onNavigate?: (p: Page) => void;
  onDefiTab?:  (tab: string) => void;
}
export function WalletPage({ onNavigate, onDefiTab }: WalletPageProps = {}) {
  const assets         = useWalletStore(s => s.assets);
  const txHistory      = useWalletStore(s => s.txHistory);
  const totalUsd       = useWalletStore(s => s.totalUsd);
  const totalChange24h = useWalletStore(s => s.totalChange24h);
  const hideBalances   = useWalletStore(s => s.hideBalances);
  const toggleHide     = useWalletStore(s => s.toggleHide);
  const primaryFiat    = useWalletStore(s => s.primaryFiat);
  const alerts         = useWalletStore(s => s.alerts);
  const markAlertsRead = useWalletStore(s => s.markAlertsRead);
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset|null>(null);
  const [tab, setTab] = useState<"assets"|"history"|"alerts"|"market">("assets");
  const [swapOpen, setSwapOpen] = useState(false);
  const [depositCurrency, setDepositCurrency] = useState<string|null>(null);
  const [ngnOpen, setNgnOpen] = useState(false);
  const [usdOpen, setUsdOpen] = useState(false);
  const [cryptoDisplay, setCryptoDisplay] = useState<"USD"|"LOCAL">("USD");
  const unreadAlerts = alerts.filter(a => !a.read).length;

  const tickers      = usePriceStore(s => s.tickers);
  const fxPage       = useFxDisplay();

  const sortedAssets = useMemo(() =>
    [...assets].sort((a,b) => b.usdValue - a.usdValue)
  , [assets]);

  // Market movers for the home-style strip (top 6 by abs % change)
  const movers = useMemo(() => {
    return Object.entries(tickers)
      .filter(([, t]) => t && typeof t.priceChangePct === "number")
      .sort(([, a], [, b]) => Math.abs(b.priceChangePct) - Math.abs(a.priceChangePct))
      .slice(0, 8)
      .map(([key, t]) => ({ key, ticker: t }));
  }, [tickers]);

  const recentTx = useMemo(() =>
    [...txHistory].sort((a,b) => b.createdAt - a.createdAt).slice(0, 100)
  , [txHistory]);

  if (selectedAsset) {
    return <AssetDetailSheet asset={selectedAsset} onClose={() => setSelectedAsset(null)} />;
  }

  if (usdOpen) {
    return (
      <CryptoDashboard
        onClose={() => setUsdOpen(false)}
        onNavigate={onNavigate}
        onDefiTab={onDefiTab}
      />
    );
  }

  if (ngnOpen) {
    return (
      <NGNAccountPage
        onBack={() => setNgnOpen(false)}
        onNavigateP2P={() => { setNgnOpen(false); onNavigate?.("p2p"); }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* ── Split balance card (USD | NGN) ── */}
      <SplitBalanceCard
        totalUsd={totalUsd}
        totalChange24h={totalChange24h}
        hideBalances={hideBalances}
        toggleHide={toggleHide}
        onDeposit={(cur) => setDepositCurrency(cur || primaryFiat)}
        onSwap={() => setSwapOpen(true)}
        onNgnTap={() => setNgnOpen(true)}
        onUsdTap={() => setUsdOpen(true)}
      />

      {/* ── Crypto section label ── */}
      <div className="px-4 pt-2 pb-1 flex items-center justify-between" style={{ background: "var(--bg)" }}>
        <div className="flex items-center gap-1.5">
          <Coins size={12} style={{ color: "var(--accent)" }} />
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
            Crypto Assets
          </span>
        </div>
        {/* Currency display toggle */}
        <div className="flex items-center rounded-full overflow-hidden border text-[10px] font-semibold"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <button
            onClick={() => setCryptoDisplay("USD")}
            className="px-2.5 py-0.5 transition-colors"
            style={{
              background: cryptoDisplay === "USD" ? "var(--accent)" : "transparent",
              color: cryptoDisplay === "USD" ? "#fff" : "var(--subtle)",
            }}>
            $ USD
          </button>
          <button
            onClick={() => setCryptoDisplay("LOCAL")}
            className="px-2.5 py-0.5 transition-colors"
            style={{
              background: cryptoDisplay === "LOCAL" ? "var(--accent)" : "transparent",
              color: cryptoDisplay === "LOCAL" ? "#fff" : "var(--subtle)",
            }}>
            {fxPage.symbol} {fxPage.currency}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {(["assets","market","history","alerts"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-xs font-semibold relative capitalize transition-colors"
            style={{ color: tab === t ? "var(--accent)" : "var(--subtle)" }}>
            {t}{t === "alerts" && unreadAlerts > 0 && (
              <span className="ml-1 px-1 py-0.5 rounded-full text-[9px] font-bold"
                style={{ background: "var(--sell)", color: "#fff" }}>{unreadAlerts}</span>
            )}
            {tab === t && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: "var(--accent)" }} />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "assets" && (
          <div>
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
                Assets ({sortedAssets.length})
              </span>
              <div className="flex items-center gap-1">
                <Coins size={11} style={{ color: "var(--subtle)" }} />
                <span className="text-[10px]" style={{ color: "var(--subtle)" }}>Crypto</span>
              </div>
            </div>
            {sortedAssets.map(a => <AssetRow key={a.symbol} a={a} onSelect={setSelectedAsset} displayMode={cryptoDisplay} />)}
            <div className="px-4 py-3 text-center">
              <button className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                + Add asset
              </button>
            </div>

            {/* ── Market Movers strip ── */}
            {movers.length > 0 && (
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
                    Market Movers
                  </span>
                  {onNavigate && (
                    <button onClick={() => { onDefiTab?.("swap"); onNavigate("defi"); }}
                      className="text-[10px] flex items-center gap-0.5" style={{ color: "var(--accent)" }}>
                      Trade <ChevronRight size={10} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {movers.map(({ key, ticker }) => {
                    const sym = key.replace("-USD","");
                    const up  = ticker.priceChangePct >= 0;
                    return (
                      <div key={key} className="rounded-lg p-2.5 flex items-center justify-between"
                        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div>
                          <div className="text-xs font-bold" style={{ color: "var(--ink)" }}>{sym}</div>
                          <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                            ${ticker.lastPrice.toLocaleString(undefined, { maximumFractionDigits: ticker.lastPrice < 1 ? 5 : 2 })}
                          </div>
                        </div>
                        <div className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded`}
                          style={{ background: up ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                                   color: up ? "#22c55e" : "#ef4444" }}>
                          {up ? <TrendingUp size={9}/> : <TrendingDown size={9}/>}
                          {up ? "+" : ""}{ticker.priceChangePct.toFixed(2)}%
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "market" && (
          <div className="p-4 flex flex-col gap-4">
            <LivePriceStrip />
            <P2PRateBar />
          </div>
        )}

        {tab === "history" && (
          <div>
            <div className="px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
                All Transactions ({recentTx.length})
              </span>
            </div>
            {recentTx.length === 0 ? (
              <div className="text-center py-12">
                <Clock size={28} className="mx-auto mb-3" style={{ color: "var(--subtle)" }} />
                <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>No transactions yet</div>
                <div className="text-xs mt-1" style={{ color: "var(--subtle)" }}>Your activity will appear here</div>
              </div>
            ) : (
              recentTx.map(tx => <TxRow key={tx.id} tx={tx} />)
            )}
          </div>
        )}

        {tab === "alerts" && (
          <div>
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
                Notifications ({alerts.length})
              </span>
              {unreadAlerts > 0 && (
                <button onClick={markAlertsRead}
                  className="text-[10px]" style={{ color: "var(--accent)" }}>Mark all read</button>
              )}
            </div>
            {alerts.length === 0 ? (
              <div className="text-center py-12">
                <Banknote size={28} className="mx-auto mb-3" style={{ color: "var(--subtle)" }} />
                <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>No alerts</div>
              </div>
            ) : (
              [...alerts].sort((a,b)=>b.ts-a.ts).map(alert => (
                <div key={alert.id}
                  className="px-4 py-3 flex items-start gap-3 cursor-pointer hover:opacity-80"
                  style={{ borderBottom:"1px solid var(--border)", opacity: alert.read ? 0.6 : 1 }}
                  onClick={markAlertsRead}>
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: !alert.read ? (alert.type === "error" ? "var(--sell)" : alert.type === "success" ? "var(--buy)" : "var(--accent)") : "var(--surface-high)" }} />
                  <div className="flex-1">
                    <div className="text-xs" style={{ color: "var(--ink)" }}>{alert.msg}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>{fmtTs(alert.ts)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {swapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setSwapOpen(false)}>
          <div className="w-full max-w-md p-5 rounded-2xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
            onClick={e => e.stopPropagation()}>
            <div className="text-sm font-bold mb-3" style={{ color: "var(--ink)" }}>Quick Swap</div>
            <QuickSwap onClose={() => setSwapOpen(false)} />
          </div>
        </div>
      )}

      {depositCurrency !== null && (
        <BankDepositModal
          defaultCurrency={depositCurrency || undefined}
          onClose={() => setDepositCurrency(null)}
        />
      )}
    </div>
  );
}

// ── QuickSwap ─────────────────────────────────────────────────────────────────
function QuickSwap({ onClose }: { onClose: () => void }) {
  const assets      = useWalletStore(s => s.assets);
  const swap        = useWalletStore(s => s.swap);
  const _livePrices = useWalletStore(s => s._livePrices);
  const [fromSym, setFromSym] = useState("USDC");
  const [toSym,   setToSym]   = useState("ETH");
  const [amt, setAmt] = useState("100");
  const [done, setDone] = useState(false);

  const fromAsset = assets.find(a => a.symbol === fromSym);
  const fromPrice = _livePrices[fromSym] ?? 1;
  const toPrice   = _livePrices[toSym]   ?? 1;
  const num = parseFloat(amt) || 0;
  const toAmount = num * fromPrice / (toPrice || 1);

  function handleSwap() {
    if (num <= 0 || !fromAsset) return;
    const fee = num * fromPrice * 0.003;
    const ok = swap(fromSym, toSym, num, toAmount, fee);
    if (ok) { setDone(true); setTimeout(onClose, 1800); }
  }

  if (done) return (
    <div className="text-center py-6">
      <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: "var(--buy)" }} />
      <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Swapped!</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select value={fromSym} onChange={e=>setFromSym(e.target.value)}
          className="flex-1 text-xs rounded-lg px-3 py-2"
          style={{ background:"var(--surface-high)", color:"var(--ink)", border:"1px solid var(--border)" }}>
          {assets.map(a=><option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
        </select>
        <ArrowUpDown size={16} style={{ color:"var(--subtle)", flexShrink:0, alignSelf:"center" }} />
        <select value={toSym} onChange={e=>setToSym(e.target.value)}
          className="flex-1 text-xs rounded-lg px-3 py-2"
          style={{ background:"var(--surface-high)", color:"var(--ink)", border:"1px solid var(--border)" }}>
          {assets.filter(a=>a.symbol!==fromSym).map(a=><option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
        </select>
      </div>
      <input value={amt} onChange={e=>setAmt(e.target.value)} type="number" min="0"
        placeholder="Amount"
        className="w-full text-xs rounded-lg px-3 py-2"
        style={{ background:"var(--surface-high)", color:"var(--ink)", border:"1px solid var(--border)", outline:"none" }} />
      {num > 0 && toAmount > 0 && (
        <div className="text-[10px] px-3 py-2 rounded-lg" style={{ background:"var(--surface-high)", color:"var(--subtle)" }}>
          ≈ {toAmount.toFixed(6)} {toSym} (1 {fromSym} = {(fromPrice/toPrice).toFixed(6)} {toSym})
        </div>
      )}
      {fromAsset && num > fromAsset.balance && (
        <div className="text-[10px]" style={{ color:"var(--sell)" }}>Insufficient {fromSym} balance</div>
      )}
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
          style={{ background:"var(--surface-high)", color:"var(--subtle)" }}>Cancel</button>
        <button onClick={handleSwap} disabled={num<=0||!fromAsset||num>fromAsset.balance}
          className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
          style={{ background:"var(--accent)", color:"#fff" }}>Swap</button>
      </div>
    </div>
  );
}
