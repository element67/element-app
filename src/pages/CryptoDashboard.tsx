/**
 * CryptoDashboard — full-screen USD crypto portfolio overlay
 * Opened when the user taps the USD half of the split balance card.
 *
 * Send / Receive: connected to useNativeWallet (server-side HD wallet).
 *   No external wallet required — works with the app's built-in wallet.
 * Swap:   inline price-store-based swap (same-chain, updates local ledger).
 * Bridge: inline Relay-powered bridge via the MultiProtocolBridge component.
 */
import { useState, useMemo, useCallback } from "react";
import {
  ArrowLeft, Send, ArrowDownLeft, RefreshCw,
  GitMerge, TrendingUp, TrendingDown, Eye, EyeOff,
  ChevronRight, Clock, BarChart3, Copy, CheckCircle2,
  Loader2, AlertTriangle, X, Search, ChevronDown, ArrowLeftRight,
} from "lucide-react";
import { MultiProtocolBridge } from "@/components/MultiProtocolBridge";
import { ExchangeScreen }      from "@/components/ExchangeScreen";
import { useWalletStore }     from "@/store/walletStore";
import { usePriceStore }      from "@/store/priceStore";
import { useFxDisplay }       from "@/hooks/useFxDisplay";
import { useSharedWallet as useNativeWallet, type UseNativeWalletReturn } from "@/context/NativeWalletContext";
import { CryptoIcon } from "@/components/AssetIcons";
import {
  getAdapter, buildAddressUrl, validateAddress,
  estimateFeeUsd, receiveUri,
} from "@/lib/chainAdapters";
import type { WalletAsset, TxRecord } from "@/store/walletStore";

// ── Helpers ───────────────────────────────────────────────────────────────────
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
      <CryptoIcon symbol={a.symbol} size={40} />
      <div className="flex-1 text-left min-w-0">
        <div className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>{a.name}</div>
        <div className="text-[10px] flex items-center gap-1" style={{ color: "var(--subtle)" }}>
          <span>{hideBalances ? "••••" : `${fmtAmt(a.balance, 6)} ${a.symbol}`}</span>
          <span className="opacity-50">·</span>
          <span className="text-[9px] px-1 rounded" style={{ background: "var(--surface-high)" }}>
            {adapter.name}
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
          {tx.status !== "completed" && (
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
        {tx.note && !hideBalances && (
          <div className="text-[10px] mono truncate max-w-[80px]" style={{ color: "var(--subtle)" }}>
            {tx.note}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ASSET_NETWORKS — which networks each asset can be sent/received on ────────
// For single-chain assets the list has one entry; for multi-chain tokens (USDC,
// USDT) the user picks their preferred network before seeing the address.
const ASSET_NETWORKS: Record<string, string[]> = {
  BTC:  ["Bitcoin"],
  ETH:  ["Ethereum"],
  SOL:  ["Solana"],
  BNB:  ["BNB"],
  ARB:  ["Arbitrum"],
  ARC:  ["Arc Testnet"],
  USDC: ["Arc Testnet", "Ethereum", "Arbitrum", "Base", "Optimism", "Polygon"],
  USDT: ["Ethereum", "BNB", "Polygon", "Arbitrum"],
  DOGE: ["Dogecoin"],
  LTC:  ["Litecoin"],
  TRX:  ["TRON"],
  XRP:  ["XRP"],
};

// Resolve the server-side address-map key for a given network string.
// walletStore uses "Arc" as the network name; the server keys it "Arc Testnet".
function resolveNetworkKey(network: string): string {
  if (network === "Arc") return "Arc Testnet";
  return network;
}

// ── AssetPickerSheet — full-height sheet to pick an asset before send/receive ──
function AssetPickerSheet({ mode, assets, onPick, onClose }: {
  mode: "send" | "receive";
  assets: WalletAsset[];
  onPick: (asset: WalletAsset) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = assets.filter(a =>
    !q || a.symbol.toLowerCase().includes(q.toLowerCase()) || a.name.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl flex flex-col"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)", maxHeight: "80vh" }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Select asset to {mode}
          </div>
          <button onClick={onClose} style={{ color: "var(--subtle)" }}><X size={16} /></button>
        </div>

        <div className="px-4 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
            <Search size={13} style={{ color: "var(--subtle)" }} />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search assets…" autoFocus
              className="flex-1 bg-transparent text-xs outline-none"
              style={{ color: "var(--ink)" }} />
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {filtered.map(a => {
            const adapter = getAdapter(a.network ?? a.symbol, a.symbol);
            const networks = ASSET_NETWORKS[a.symbol] ?? [a.network ?? "Ethereum"];
            return (
              <button key={a.symbol} onClick={() => onPick(a)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:opacity-80 active:opacity-60 transition-opacity"
                style={{ borderBottom: "1px solid var(--border)" }}>
                <CryptoIcon symbol={a.symbol} size={38} />
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{a.name}</div>
                  <div className="text-[10px] flex items-center gap-1 flex-wrap" style={{ color: "var(--subtle)" }}>
                    <span>{a.symbol}</span>
                    <span className="opacity-40">·</span>
                    {networks.length > 1
                      ? <span>{networks.length} networks</span>
                      : <span>{adapter.name}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xs font-bold mono" style={{ color: "var(--ink)" }}>
                    {fmtAmt(a.balance, 4)}
                  </div>
                  <div className="text-[9px]" style={{ color: "var(--subtle)" }}>{a.symbol}</div>
                </div>
                <ChevronRight size={13} style={{ color: "var(--subtle)" }} className="ml-1" />
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-xs" style={{ color: "var(--subtle)" }}>No assets match "{q}"</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SendModal — uses native wallet for real on-chain send ─────────────────────
function SendModal({ initialAsset, allAssets, onClose, nativeWallet }: {
  initialAsset: WalletAsset | null; allAssets: WalletAsset[];
  onClose: () => void; nativeWallet: UseNativeWalletReturn;
}) {
  const [asset, setAsset]     = useState<WalletAsset | null>(initialAsset);
  const [picking, setPicking] = useState(!initialAsset);
  const [network, setNetwork] = useState<string>(() => {
    if (!initialAsset) return "";
    const nets = ASSET_NETWORKS[initialAsset.symbol] ?? [initialAsset.network ?? "Ethereum"];
    return resolveNetworkKey(nets[0]);
  });

  function pickAsset(a: WalletAsset) {
    const nets = ASSET_NETWORKS[a.symbol] ?? [a.network ?? "Ethereum"];
    setNetwork(resolveNetworkKey(nets[0]));
    setAsset(a);
    setPicking(false);
    nativeWallet.resetSend();
  }

  if (picking || !asset) {
    return <AssetPickerSheet mode="send" assets={allAssets} onPick={pickAsset} onClose={onClose} />;
  }

  return <SendForm asset={asset} network={network} onNetworkChange={setNetwork} allAssets={allAssets} onClose={onClose} onChangeAsset={() => setPicking(true)} nativeWallet={nativeWallet} />;
}

function SendForm({ asset, network, onNetworkChange, allAssets: _allAssets, onClose, onChangeAsset, nativeWallet }: {
  asset: WalletAsset; network: string; onNetworkChange: (n: string) => void; allAssets: WalletAsset[];
  onClose: () => void; onChangeAsset: () => void; nativeWallet: UseNativeWalletReturn;
}) {
  const debit    = useWalletStore(s => s.debit);
  const prices   = useWalletStore(s => s._livePrices);

  // Network selection — for multi-chain assets let the user choose
  const networks  = ASSET_NETWORKS[asset.symbol] ?? [asset.network ?? "Ethereum"];
  const adapter  = getAdapter(network, asset.symbol);

  const [tab, setTab]         = useState<"onchain" | "internal">("onchain");
  const [to, setTo]           = useState("");
  const [amt, setAmt]         = useState("");
  const [addrErr, setAddrErr] = useState("");

  const price  = prices[asset.symbol] ?? (asset.usdValue / (asset.balance || 1));
  const numAmt = parseFloat(amt) || 0;
  const usdVal = numAmt * price;
  const fee    = estimateFeeUsd(adapter, prices);

  function handleAddrChange(v: string) {
    setTo(v);
    if (v.trim()) {
      const res = validateAddress(v, adapter);
      setAddrErr(res.valid ? "" : (res.error ?? "Invalid address"));
    } else { setAddrErr(""); }
  }

  function handleSend() {
    nativeWallet.resetSend();
    const check = validateAddress(to, adapter);
    if (!check.valid) return;
    if (numAmt <= 0 || numAmt > asset.balance) return;
    if (tab === "onchain" && nativeWallet.walletId) {
      void nativeWallet.sendCrypto({ network, symbol: asset.symbol, to: to.trim(), amount: String(numAmt) });
    } else {
      debit(asset.symbol, numAmt, { type: "send", to: to.trim(), note: `Send ${asset.symbol} on ${adapter.name}` });
    }
  }

  const isSending   = nativeWallet.sendStatus === "submitting";
  const isSubmitted = nativeWallet.sendStatus === "submitted";
  const sendErr     = nativeWallet.sendError;
  const result      = nativeWallet.sendResult;

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5 pb-8"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>

        {/* Success state */}
        {isSubmitted && result ? (
          <div className="text-center py-8 space-y-3">
            <CheckCircle2 size={44} className="mx-auto" style={{ color: "var(--buy)" }} />
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Transaction Submitted</div>
            <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
              {numAmt} {asset.symbol} → {to.slice(0, 6)}…{to.slice(-4)}
            </div>
            {result.txHash && (
              <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer"
                className="block text-[10px] font-mono px-3 py-2 rounded-lg truncate"
                style={{ background: "var(--surface-high)", color: "var(--accent)" }}>
                {result.txHash.slice(0, 20)}… ↗ Explorer
              </a>
            )}
            {result.simulated && (
              <div className="text-[9px] px-3 py-2 rounded-lg"
                style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
                Signing not yet implemented for {network}. Ledger updated locally only.
              </div>
            )}
            {result.fee && <div className="text-[10px]" style={{ color: "var(--subtle)" }}>Fee: {result.fee}</div>}
            <button onClick={onClose} className="w-full py-2.5 rounded-xl text-xs font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}>Done</button>
          </div>
        ) : (
          <>
            {/* Header with asset switcher */}
            <div className="flex items-center justify-between mb-3">
              <button onClick={onChangeAsset}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:opacity-80 transition-opacity"
                style={{ background: "var(--surface-high)" }}>
                <CryptoIcon symbol={asset.symbol} size={24} />
                <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Send {asset.symbol}</div>
                <ChevronDown size={13} style={{ color: "var(--subtle)" }} />
              </button>
              <button onClick={onClose} style={{ color: "var(--subtle)" }}><X size={16} /></button>
            </div>

            {/* Network selector — shown only when asset is available on >1 network */}
            {networks.length > 1 && (
              <div className="mb-3">
                <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>Network</div>
                <div className="flex flex-wrap gap-1.5">
                  {networks.map(n => {
                    const rn = resolveNetworkKey(n);
                    return (
                      <button key={rn} onClick={() => { onNetworkChange(rn); setTo(""); setAddrErr(""); }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                        style={{
                          background: network === rn ? "var(--accent)" : "var(--surface-high)",
                          color: network === rn ? "#fff" : "var(--subtle)",
                          border: `1px solid ${network === rn ? "var(--accent)" : "var(--border)"}`,
                        }}>
                        {getAdapter(rn, asset.symbol).name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: "var(--surface-high)" }}>
              {(["onchain", "internal"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors capitalize"
                  style={{
                    background: tab === t ? (t === "onchain" ? "var(--accent)" : "var(--surface)") : "transparent",
                    color: tab === t ? (t === "onchain" ? "#fff" : "var(--ink)") : "var(--subtle)",
                  }}>
                  {t === "onchain" ? "On-chain" : "Internal"}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div className="text-[10px] px-2 py-0.5 rounded-full inline-block"
                style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>
                {asset.symbol} · {adapter.name}
                {tab === "internal" && " · Local ledger only (no blockchain)"}
              </div>

              {/* Address */}
              <div>
                <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                  Recipient {adapter.name} address
                </div>
                <input value={to} onChange={e => handleAddrChange(e.target.value)}
                  placeholder={adapter.addressPlaceholder}
                  className="w-full text-xs rounded-lg px-3 py-2.5 font-mono"
                  style={{ background: "var(--surface-high)", color: "var(--ink)", outline: "none",
                    border: `1px solid ${addrErr ? "var(--sell)" : (to && !addrErr ? "var(--buy)" : "var(--border)")}` }} />
                {addrErr && <div className="text-[10px] mt-1" style={{ color: "var(--sell)" }}>{addrErr}</div>}
                {!addrErr && to && (
                  <div className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "var(--buy)" }}>
                    <CheckCircle2 size={10} /> Valid {adapter.name} address
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span style={{ color: "var(--subtle)" }}>Amount ({asset.symbol})</span>
                  <button onClick={() => setAmt(String(asset.balance))}
                    className="text-[10px] font-semibold" style={{ color: "var(--accent)" }}>Max</button>
                </div>
                <input value={amt} onChange={e => setAmt(e.target.value)} type="number" min="0" step="any"
                  placeholder="0.00" className="w-full text-xs rounded-lg px-3 py-2.5"
                  style={{ background: "var(--surface-high)", color: "var(--ink)",
                    border: `1px solid ${numAmt > asset.balance ? "var(--sell)" : "var(--border)"}`, outline: "none" }} />
                <div className="flex justify-between text-[9px] mt-1">
                  <span style={{ color: "var(--subtle)" }}>Balance: {fmtAmt(asset.balance, 6)} {asset.symbol}</span>
                  {numAmt > 0 && <span style={{ color: "var(--subtle)" }}>≈ {fmtUsd(usdVal)}</span>}
                </div>
                {numAmt > asset.balance && <div className="text-[10px] mt-0.5" style={{ color: "var(--sell)" }}>Exceeds balance</div>}
              </div>

              {/* Fee row */}
              <div className="flex items-center justify-between px-3 py-2 rounded-lg text-[10px]"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                <span style={{ color: "var(--subtle)" }}>Network fee</span>
                <span style={{ color: "var(--ink)" }}>{tab === "internal" ? "Free" : fee.label}</span>
              </div>

              {sendErr && (
                <div className="text-[10px] px-3 py-2 rounded-lg flex items-center gap-1.5"
                  style={{ background: "rgba(248,113,113,0.1)", color: "var(--sell)" }}>
                  <AlertTriangle size={11} /> {sendErr}
                </div>
              )}

              {tab === "onchain" && !nativeWallet.walletId && (
                <div className="text-[10px] px-3 py-2 rounded-lg"
                  style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.15)" }}>
                  {nativeWallet.loading ? "Initializing wallet…" : "Wallet unavailable — using internal ledger."}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                  style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Cancel</button>
                <button onClick={handleSend}
                  disabled={!!addrErr || !to || numAmt <= 0 || numAmt > asset.balance || isSending}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1"
                  style={{ background: "var(--accent)", color: "#fff" }}>
                  {isSending ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : `Send ${asset.symbol}`}
                </button>
              </div>
              <div className="text-[9px] text-center" style={{ color: "var(--subtle)" }}>
                {tab === "onchain"
                  ? `Transactions on ${adapter.name} are irreversible. Verify the address before sending.`
                  : "Internal transfer updates your local balance only — no blockchain broadcast."}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ReceiveModal — asset picker + address display ─────────────────────────────
function ReceiveModal({ initialAsset, allAssets, onClose, nativeWallet }: {
  initialAsset: WalletAsset | null; allAssets: WalletAsset[];
  onClose: () => void; nativeWallet: UseNativeWalletReturn;
}) {
  const [asset, setAsset]     = useState<WalletAsset | null>(initialAsset);
  const [picking, setPicking] = useState(!initialAsset);
  const [network, setNetwork] = useState<string>(() => {
    if (!initialAsset) return "";
    const nets = ASSET_NETWORKS[initialAsset.symbol] ?? [initialAsset.network ?? "Ethereum"];
    return resolveNetworkKey(nets[0]);
  });

  function pickAsset(a: WalletAsset) {
    const nets = ASSET_NETWORKS[a.symbol] ?? [a.network ?? "Ethereum"];
    setNetwork(resolveNetworkKey(nets[0]));
    setAsset(a);
    setPicking(false);
  }

  if (picking || !asset) {
    return <AssetPickerSheet mode="receive" assets={allAssets} onPick={pickAsset} onClose={onClose} />;
  }

  return <ReceiveAddressView asset={asset} network={network} onNetworkChange={setNetwork} allAssets={allAssets} onClose={onClose} onChangeAsset={() => setPicking(true)} nativeWallet={nativeWallet} />;
}

function ReceiveAddressView({ asset, network, onNetworkChange, allAssets: _allAssets, onClose, onChangeAsset, nativeWallet }: {
  asset: WalletAsset; network: string; onNetworkChange: (n: string) => void; allAssets: WalletAsset[];
  onClose: () => void; onChangeAsset: () => void; nativeWallet: UseNativeWalletReturn;
}) {
  const networks  = ASSET_NETWORKS[asset.symbol] ?? [asset.network ?? "Ethereum"];
  const adapter   = getAdapter(network, asset.symbol);
  const [copied, setCopied]   = useState<string | null>(null);

  const addrInfo    = nativeWallet.getAddressInfo(network);
  const addr        = addrInfo?.address ?? nativeWallet.addresses[network] ?? "";
  const qrValue     = addr ? receiveUri(adapter, addr, asset.symbol) : "";
  const explorerUrl = addr ? buildAddressUrl(adapter, addr) : "";
  const isLoading   = nativeWallet.loading && !addr;

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5 pb-8"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>

        {/* Header with asset switcher */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={onChangeAsset}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:opacity-80 transition-opacity"
            style={{ background: "var(--surface-high)" }}>
            <CryptoIcon symbol={asset.symbol} size={24} />
            <div className="text-left">
              <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Receive {asset.symbol}</div>
              <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{adapter.name}</div>
            </div>
            <ChevronDown size={13} style={{ color: "var(--subtle)" }} />
          </button>
          <button onClick={onClose} style={{ color: "var(--subtle)" }}><X size={16} /></button>
        </div>

        {/* Network selector */}
        {networks.length > 1 && (
          <div className="mb-4">
            <div className="text-[10px] mb-1.5" style={{ color: "var(--subtle)" }}>Select network</div>
            <div className="flex flex-wrap gap-1.5">
              {networks.map(n => {
                const rn = resolveNetworkKey(n);
                return (
                  <button key={rn} onClick={() => onNetworkChange(rn)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-colors"
                    style={{
                      background: network === rn ? "var(--accent)" : "var(--surface-high)",
                      color: network === rn ? "#fff" : "var(--subtle)",
                      border: `1px solid ${network === rn ? "var(--accent)" : "var(--border)"}`,
                    }}>
                    {getAdapter(rn, asset.symbol).name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-10">
            <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: "var(--accent)" }} />
            <div className="text-xs" style={{ color: "var(--subtle)" }}>Generating your wallet address…</div>
          </div>
        ) : addr ? (
          <>
            {/* QR */}
            <div className="flex justify-center mb-4">
              <div className="rounded-xl overflow-hidden" style={{ border: "3px solid #fff", width: 180, height: 180 }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrValue)}&margin=10&color=000000&bgcolor=ffffff&format=svg`}
                  width={180} height={180} alt="QR code" loading="lazy"
                  style={{ display: "block" }} />
              </div>
            </div>

            <div className="text-[10px] text-center mb-3 font-semibold" style={{ color: "var(--subtle)" }}>
              Only send <span style={{ color: "var(--ink)" }}>{asset.symbol}</span> on the{" "}
              <span style={{ color: "var(--accent)" }}>{adapter.name}</span> network to this address.
            </div>

            {/* Address box */}
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3"
              style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
              <span className="flex-1 text-[11px] font-mono break-all leading-relaxed"
                style={{ color: "var(--ink)" }}>{addr}</span>
              <button onClick={() => copy(addr, "icon")} className="flex-shrink-0 ml-1">
                {copied === "icon"
                  ? <CheckCircle2 size={16} style={{ color: "var(--buy)" }} />
                  : <Copy size={16} style={{ color: "var(--subtle)" }} />}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mb-3">
              <button onClick={() => copy(addr, "btn")}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ background: "var(--accent)", color: "#fff" }}>
                <Copy size={12} /> {copied === "btn" ? "Copied!" : "Copy Address"}
              </button>
              {explorerUrl && (
                <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{ background: "var(--surface-high)", color: "var(--subtle)", textDecoration: "none" }}>
                  Explorer ↗
                </a>
              )}
            </div>

            <div className="text-[9px] text-center px-2" style={{ color: "var(--subtle)" }}>
              Sending the wrong asset or network will result in permanent loss of funds.
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <div className="text-3xl mb-3">🔗</div>
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--ink)" }}>Address unavailable</div>
            <div className="text-[11px] mb-4" style={{ color: "var(--subtle)" }}>
              {nativeWallet.error ?? `No ${asset.symbol} address on ${adapter.name} — wallet may still be initializing.`}
            </div>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-xs font-semibold"
              style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SwapModal — price-store-based inline swap (updates local balances) ─────────
function SwapModal({ asset, onClose }: { asset: WalletAsset; onClose: () => void }) {
  const assets   = useWalletStore(s => s.assets);
  const tickers  = usePriceStore(s => s.tickers);
  const debit    = useWalletStore(s => s.debit);
  const credit   = useWalletStore(s => s.credit);

  const [fromSymbol, setFromSymbol] = useState(asset.symbol);
  const [toSymbol,   setToSymbol]   = useState(asset.symbol === "USDC" ? "ETH" : "USDC");
  const [amt, setAmt]               = useState("");
  const [done, setDone]             = useState(false);

  const fromAsset = assets.find(a => a.symbol === fromSymbol) ?? asset;
  const toAsset   = assets.find(a => a.symbol === toSymbol);

  function price(sym: string) {
    return tickers[`${sym}-USD`]?.lastPrice ?? (assets.find(a => a.symbol === sym)?.usdValue ?? 1);
  }

  const numAmt   = parseFloat(amt) || 0;
  const fromUsd  = numAmt * price(fromSymbol);
  const toAmt    = toAsset ? fromUsd / price(toSymbol) : 0;
  const canSwap  = numAmt > 0 && numAmt <= fromAsset.balance && fromSymbol !== toSymbol && !!toAsset;

  function handleSwap() {
    if (!canSwap || !toAsset) return;
    debit(fromSymbol, numAmt, { type: "swap", to: toSymbol, note: `Swap ${fromSymbol} → ${toSymbol}` });
    credit(toSymbol, toAmt, { type: "swap", note: `Swap ${fromSymbol} → ${toSymbol}` });
    setDone(true);
  }

  const otherAssets = assets.filter(a => a.symbol !== fromSymbol);

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5 pb-8"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-8 space-y-3">
            <CheckCircle2 size={44} className="mx-auto" style={{ color: "var(--buy)" }} />
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Swap Complete</div>
            <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
              {numAmt} {fromSymbol} → {toAmt.toFixed(6)} {toSymbol}
            </div>
            <div className="text-[10px] px-3 py-2 rounded-lg"
              style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24" }}>
              Price-based swap — updated in your local portfolio. For on-chain execution connect DeFi.
            </div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl text-xs font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Swap</div>
              <button onClick={onClose} style={{ color: "var(--subtle)" }}>✕</button>
            </div>

            {/* From */}
            <div className="p-3 rounded-xl mb-2" style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
              <div className="flex justify-between text-[10px] mb-1.5">
                <span style={{ color: "var(--subtle)" }}>From</span>
                <button onClick={() => setAmt(String(fromAsset.balance))}
                  className="text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
                  Max: {fmtAmt(fromAsset.balance, 4)} {fromSymbol}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select value={fromSymbol} onChange={e => setFromSymbol(e.target.value)}
                  className="text-xs font-bold px-2 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border)" }}>
                  {assets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                </select>
                <input value={amt} onChange={e => setAmt(e.target.value)} type="number" min="0" step="any"
                  placeholder="0.00" className="flex-1 text-sm font-bold text-right bg-transparent outline-none"
                  style={{ color: "var(--ink)" }} />
              </div>
              {numAmt > 0 && <div className="text-[9px] mt-1 text-right" style={{ color: "var(--subtle)" }}>≈ {fmtUsd(fromUsd)}</div>}
              {numAmt > fromAsset.balance && <div className="text-[10px] mt-0.5" style={{ color: "var(--sell)" }}>Exceeds balance</div>}
            </div>

            {/* Swap arrow */}
            <div className="flex justify-center my-1">
              <button onClick={() => { setFromSymbol(toSymbol); setToSymbol(fromSymbol); setAmt(""); }}
                className="p-2 rounded-full" style={{ background: "var(--surface-high)", color: "var(--accent)" }}>
                <RefreshCw size={14} />
              </button>
            </div>

            {/* To */}
            <div className="p-3 rounded-xl mb-4" style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
              <div className="text-[10px] mb-1.5" style={{ color: "var(--subtle)" }}>To</div>
              <div className="flex items-center gap-2">
                <select value={toSymbol} onChange={e => setToSymbol(e.target.value)}
                  className="text-xs font-bold px-2 py-1.5 rounded-lg flex-shrink-0"
                  style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border)" }}>
                  {otherAssets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol}</option>)}
                </select>
                <div className="flex-1 text-sm font-bold text-right" style={{ color: toAmt > 0 ? "var(--buy)" : "var(--subtle)" }}>
                  {toAmt > 0 ? fmtAmt(toAmt, 6) : "0.00"}
                </div>
              </div>
              {toAmt > 0 && <div className="text-[9px] mt-1 text-right" style={{ color: "var(--subtle)" }}>≈ {fmtUsd(fromUsd)}</div>}
            </div>

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Cancel</button>
              <button onClick={handleSwap} disabled={!canSwap}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40"
                style={{ background: "var(--accent)", color: "#fff" }}>
                Swap {fromSymbol} → {toSymbol}
              </button>
            </div>
            <div className="text-[9px] text-center mt-2" style={{ color: "var(--subtle)" }}>
              Rates from live price feed. Portfolio updated instantly.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── BridgeScreen — full-screen inline bridge using built-in wallet ─────────────
function BridgeScreen({ onClose, nativeWallet }: {
  onClose: () => void; nativeWallet: UseNativeWalletReturn;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--border)" }}>
        <button onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors"
          style={{ background: "var(--surface-high)" }}>
          <X size={16} style={{ color: "var(--ink)" }} />
        </button>
        <div className="flex items-center gap-2">
          <GitMerge size={15} style={{ color: "#a855f7" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--ink)" }}>Bridge</span>
        </div>
      </div>
      {/* Bridge component — native wallet wired, no external wallet required */}
      <div className="flex-1 overflow-y-auto">
        <MultiProtocolBridge nativeWallet={nativeWallet} />
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

export function CryptoDashboard({ onClose, onNavigate: _onNavigate, onDefiTab: _onDefiTab }: CryptoDashboardProps) {
  const assets       = useWalletStore(s => s.assets);
  const txHistory    = useWalletStore(s => s.txHistory);
  const hideBalances = useWalletStore(s => s.hideBalances);
  const toggleHide   = useWalletStore(s => s.toggleHide);
  const tickers      = usePriceStore(s => s.tickers);
  const fx           = useFxDisplay();

  // One native wallet instance shared across all modals in this screen
  const nativeWallet = useNativeWallet();

  const [tab,           setTab]           = useState<"assets" | "history">("assets");
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
  const [actionModal,   setActionModal]   = useState<"send" | "receive" | "swap" | "bridge" | null>(null);
  const [exchangeOpen,  setExchangeOpen]  = useState(false);
  const [actionAsset,   setActionAsset]   = useState<WalletAsset | null>(null);

  const totalUsd = useMemo(() => assets.reduce((sum, a) => {
    const livePrice = tickers[`${a.symbol}-USD`]?.lastPrice ?? (a.usdValue / (a.balance || 1));
    return sum + a.balance * livePrice;
  }, 0), [assets, tickers]);

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
    [...txHistory].sort((a, b) => b.createdAt - a.createdAt).slice(0, 100)
  , [txHistory]);

  const openAction = useCallback((type: "send" | "receive" | "swap" | "bridge", asset?: WalletAsset) => {
    // asset === undefined → opened from portfolio bar → show asset picker (null)
    // asset is provided → opened from asset detail → go straight to the form
    setActionAsset(asset ?? null);
    setActionModal(type);
  }, []);

  const closeModal = useCallback(() => {
    setActionModal(null);
    nativeWallet.resetSend();
  }, [nativeWallet]);

  const mask = (v: string) => hideBalances ? "••••••" : v;

  // Shared modal renderer
  // actionAsset is null when opened from the portfolio-level action bar (no
  // specific asset pre-selected); the modal shows the asset picker first.
  function renderModal() {
    if (!actionModal) return null;
    const cryptoAssets = sortedAssets.filter(a => a.type === "crypto" || a.type === "stablecoin");
    if (actionModal === "send")    return <SendModal    initialAsset={actionAsset} allAssets={cryptoAssets} onClose={closeModal} nativeWallet={nativeWallet} />;
    if (actionModal === "receive") return <ReceiveModal initialAsset={actionAsset} allAssets={cryptoAssets} onClose={closeModal} nativeWallet={nativeWallet} />;
    if (actionModal === "swap")    return <SwapModal    asset={actionAsset ?? sortedAssets[0]} onClose={closeModal} />;
    if (actionModal === "bridge")  return <BridgeScreen onClose={closeModal} nativeWallet={nativeWallet} />;
    return null;
  }

  // ── Asset detail view ──────────────────────────────────────────────────────
  if (selectedAsset) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
        <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
          <button onClick={() => setSelectedAsset(null)} className="p-1.5 rounded-lg"
            style={{ background: "var(--surface-high)" }}>
            <ArrowLeft size={16} style={{ color: "var(--ink)" }} />
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <CryptoIcon symbol={selectedAsset.symbol} size={28} />
            <div>
              <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>{selectedAsset.name}</div>
              <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                {getAdapter(selectedAsset.network ?? selectedAsset.symbol, selectedAsset.symbol).name}
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
          <div className="px-4 py-4 grid grid-cols-4 gap-2"
            style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <ActionBtn icon={<Send size={16} />}         label="Send"    onClick={() => openAction("send",    selectedAsset)} accent="var(--sell)" />
            <ActionBtn icon={<ArrowDownLeft size={16} />} label="Receive" onClick={() => openAction("receive", selectedAsset)} accent="var(--buy)" />
            <ActionBtn icon={<RefreshCw size={16} />}    label="Swap"    onClick={() => openAction("swap",    selectedAsset)} accent="var(--accent)" />
            <ActionBtn icon={<GitMerge size={16} />}     label="Bridge"  onClick={() => openAction("bridge",  selectedAsset)} accent="#a855f7" />
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

        {renderModal()}
      </div>
    );
  }

  // ── Main portfolio view ────────────────────────────────────────────────────
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
        <div className="grid grid-cols-5 gap-2 mt-4">
          <ActionBtn icon={<Send size={15} />}           label="Send"     onClick={() => openAction("send")}      accent="var(--sell)" />
          <ActionBtn icon={<ArrowDownLeft size={15} />}  label="Receive"  onClick={() => openAction("receive")}   accent="var(--buy)" />
          <ActionBtn icon={<RefreshCw size={15} />}      label="Swap"     onClick={() => openAction("swap")}      accent="var(--accent)" />
          <ActionBtn icon={<GitMerge size={15} />}       label="Bridge"   onClick={() => openAction("bridge")}    accent="#a855f7" />
          <ActionBtn icon={<ArrowLeftRight size={15} />} label="Exchange" onClick={() => setExchangeOpen(true)}   accent="#f59e0b" />
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
            {sortedAssets.map(a => <AssetRow key={a.symbol} a={a} onSelect={setSelectedAsset} />)}
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

      {renderModal()}
      {exchangeOpen && <ExchangeScreen onClose={() => setExchangeOpen(false)} />}
    </div>
  );
}

export default CryptoDashboard;
