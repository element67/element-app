/**
 * WalletPage — built-in multi-asset wallet
 * Shows balances, send/receive, swap, history, deposit/withdraw
 */
import { useState, useMemo } from "react";
import {
  Send, Download, ArrowUpDown, Eye, EyeOff,
  Copy, CheckCircle2, ChevronRight, Clock, ArrowUpRight,
  ArrowDownLeft, RefreshCw, Shield, Banknote, Loader2,
  GitBranch, Users, MoreHorizontal, Layers, X, Search, Check, Trash2,
  ShoppingCart, Plane, Hotel, Smartphone, Wifi, Zap, Tv, GraduationCap,
  Gamepad2, CreditCard, Gift, Repeat2, Building2, Plus, ArrowLeftRight,
} from "lucide-react";
import { ExchangeScreen } from "@/components/ExchangeScreen";
import { useSharedWallet as useNativeWallet, type UseNativeWalletReturn } from "@/context/NativeWalletContext";
import { MultiProtocolBridge } from "@/components/MultiProtocolBridge";
import { useWalletStore, type TxRecord, type WalletAsset } from "@/store/walletStore";
import { useFiatStore, FIAT_COUNTRIES } from "@/store/fiatStore";
import { usePriceStore } from "@/store/priceStore";
import type { Page } from "@/App";
import { useFxDisplay }  from "@/hooks/useFxDisplay";
import { getAdapter, validateAddress, estimateFeeUsd, receiveUri, buildAddressUrl } from "@/lib/chainAdapters";

import { CurrencySwitcher } from "@/components/CurrencySwitcher";
import { BankDepositModal } from "@/components/BankDepositModal";
import { NGNAccountPage }    from "@/pages/NGNAccountPage";
import { CryptoDashboard }  from "@/pages/CryptoDashboard";
import { CryptoIcon } from "@/components/AssetIcons";
import { CRYPTO_ASSETS } from "@/lib/assetRegistry";


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

// ── AssetRow (kept for future home-screen use) ────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      <CryptoIcon symbol={a.symbol} size={36} />
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

// ── Network map — display names to wallet network keys per symbol ─────────────
// EVM-family share the same address; non-EVM each have their own key.
const SYMBOL_NETWORKS: Record<string, Array<{ label: string; network: string; family: "evm"|"solana"|"bitcoin"|"other" }>> = {
  BTC:  [{ label: "Bitcoin",       network: "Bitcoin",   family: "bitcoin" }],
  ETH:  [
    { label: "Ethereum",    network: "Ethereum",  family: "evm" },
    { label: "Arbitrum",    network: "Arbitrum",  family: "evm" },
    { label: "Optimism",    network: "Optimism",  family: "evm" },
    { label: "Base",        network: "Base",      family: "evm" },
    { label: "Polygon",     network: "Polygon",   family: "evm" },
  ],
  SOL:  [{ label: "Solana",         network: "Solana",    family: "solana" }],
  BNB:  [{ label: "BNB Smart Chain",network: "BNB",       family: "evm" }],
  XRP:  [{ label: "XRP Ledger",     network: "XRP",       family: "other" }],
  USDT: [
    { label: "Ethereum",    network: "Ethereum",  family: "evm" },
    { label: "BNB Chain",   network: "BNB",       family: "evm" },
    { label: "Tron",        network: "TRON",      family: "other" },
    { label: "Solana",      network: "Solana",    family: "solana" },
    { label: "Polygon",     network: "Polygon",   family: "evm" },
    { label: "Arbitrum",    network: "Arbitrum",  family: "evm" },
  ],
  USDC: [
    { label: "Ethereum",    network: "Ethereum",  family: "evm" },
    { label: "Base",        network: "Base",      family: "evm" },
    { label: "Arbitrum",    network: "Arbitrum",  family: "evm" },
    { label: "Polygon",     network: "Polygon",   family: "evm" },
    { label: "Solana",      network: "Solana",    family: "solana" },
    { label: "Avalanche",   network: "Avalanche", family: "evm" },
    { label: "Optimism",    network: "Optimism",  family: "evm" },
    { label: "Arc Testnet", network: "Arc Testnet", family: "evm" },
  ],
  AVAX: [{ label: "Avalanche",      network: "Avalanche", family: "evm" }],
  ARC:  [
    { label: "Arc Testnet", network: "Arc Testnet", family: "evm" },
    { label: "Arc Mainnet", network: "Arc",       family: "evm" },
  ],
  ARB:  [{ label: "Arbitrum",       network: "Arbitrum",  family: "evm" }],
  OP:   [{ label: "Optimism",       network: "Optimism",  family: "evm" }],
  MATIC:[{ label: "Polygon",        network: "Polygon",   family: "evm" }],
  LINK: [
    { label: "Ethereum",    network: "Ethereum",  family: "evm" },
    { label: "Arbitrum",    network: "Arbitrum",  family: "evm" },
    { label: "Polygon",     network: "Polygon",   family: "evm" },
  ],
  DOGE: [{ label: "Dogecoin",       network: "Dogecoin",  family: "bitcoin" }],
  TRX:  [{ label: "Tron",           network: "TRON",      family: "other" }],
  DAI:  [
    { label: "Ethereum",    network: "Ethereum",  family: "evm" },
    { label: "Base",        network: "Base",      family: "evm" },
    { label: "Arbitrum",    network: "Arbitrum",  family: "evm" },
    { label: "Polygon",     network: "Polygon",   family: "evm" },
  ],
};
function getNetworksForSymbol(symbol: string, fallbackNetwork: string) {
  return SYMBOL_NETWORKS[symbol.toUpperCase()] ?? [{ label: fallbackNetwork, network: fallbackNetwork, family: "evm" as const }];
}

// ── QuickSendModal ────────────────────────────────────────────────────────────
function QuickSendModal({ asset, onClose, nativeWallet }: { asset: WalletAsset; onClose: () => void; nativeWallet: UseNativeWalletReturn }) {
  const debit        = useWalletStore(s => s.debit);
  const _livePrices  = useWalletStore(s => s._livePrices);
  const fx           = useFxDisplay();

  const availableNetworks = getNetworksForSymbol(asset.symbol, asset.network ?? "Ethereum");
  const [selectedNetIdx, setSelectedNetIdx] = useState(0);
  const selectedNet = availableNetworks[selectedNetIdx];
  const network     = selectedNet.network;
  const adapter     = getAdapter(network, asset.symbol);

  const [tab, setTab]         = useState<"onchain"|"internal">("onchain");
  const [to, setTo]           = useState("");
  const [amt, setAmt]         = useState("");
  const [addrErr, setAddrErr] = useState("");

  const price   = _livePrices[asset.symbol] ?? asset.usdValue / (asset.balance || 1);
  const numAmt  = parseFloat(amt) || 0;
  const usdVal  = numAmt * price;
  const fee     = estimateFeeUsd(adapter, _livePrices);

  function handleAddrChange(v: string) {
    setTo(v);
    if (v.trim()) {
      const res = validateAddress(v, adapter);
      setAddrErr(res.valid ? "" : (res.error ?? "Invalid address"));
    } else { setAddrErr(""); }
  }

  function handleCryptoSend() {
    nativeWallet.resetSend();
    const addrCheck = validateAddress(to, adapter);
    if (!addrCheck.valid) return;
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
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>

        {/* ── Crypto submitted success ── */}
        {(tab === "onchain" || tab === "internal") && isSubmitted && result ? (
          <div className="text-center py-8 space-y-3">
            <CheckCircle2 size={44} className="mx-auto" style={{ color: "var(--buy)" }} />
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Transaction Submitted</div>
            <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
              {numAmt} {asset.symbol} → {to.slice(0,6)}…{to.slice(-4)}
            </div>
            {result.txHash && (
              <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer"
                className="block text-[10px] font-mono px-3 py-2 rounded-lg truncate"
                style={{ background: "var(--surface-high)", color: "var(--accent)" }}>
                {result.txHash.slice(0,20)}… ↗ Explorer
              </a>
            )}
            {result.simulated && (
              <div className="text-[9px] px-3 py-2 rounded-lg"
                style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
                Signing not yet implemented for {network}. Ledger updated locally only.
              </div>
            )}
            <div className="text-[10px]" style={{ color: "var(--subtle)" }}>Fee: {result.fee}</div>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl text-xs font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}>Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Send</div>
              <button onClick={onClose} style={{ color: "var(--subtle)" }}>✕</button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: "var(--surface-high)" }}>
              <button onClick={() => setTab("onchain")}
                className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors"
                style={{ background: tab === "onchain" ? "var(--accent)" : "transparent", color: tab === "onchain" ? "#fff" : "var(--subtle)" }}>
                On-chain
              </button>
              <button onClick={() => setTab("internal")}
                className="flex-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors"
                style={{ background: tab === "internal" ? "var(--surface)" : "transparent", color: tab === "internal" ? "var(--ink)" : "var(--subtle)" }}>
                Internal
              </button>
            </div>

            {/* ── ON-CHAIN + INTERNAL TAB ── */}
            {(tab === "onchain" || tab === "internal") && (
              <div className="space-y-3">
                {/* Network selector */}
                {availableNetworks.length > 1 && tab === "onchain" && (
                  <div>
                    <div className="text-[10px] mb-1.5" style={{ color: "var(--subtle)" }}>Select network</div>
                    <div className="flex flex-wrap gap-1.5">
                      {availableNetworks.map((n, i) => (
                        <button key={n.network} onClick={() => { setSelectedNetIdx(i); setTo(""); setAddrErr(""); }}
                          className="px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all"
                          style={{
                            background: i === selectedNetIdx ? "var(--accent)" : "var(--surface-high)",
                            color: i === selectedNetIdx ? "#fff" : "var(--subtle)",
                            border: `1px solid ${i === selectedNetIdx ? "var(--accent)" : "var(--border)"}`,
                          }}>
                          {n.label}
                        </button>
                      ))}
                    </div>
                    {selectedNet.family !== "evm" && (
                      <div className="text-[10px] mt-1.5 px-2 py-1 rounded-lg"
                        style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.15)" }}>
                        {selectedNet.family === "bitcoin" ? "Bitcoin" : selectedNet.family === "solana" ? "Solana" : "This"} transactions are signed server-side. Address generation is live; signing will be noted in the result.
                      </div>
                    )}
                  </div>
                )}
                {tab === "internal" && (
                  <div className="text-[10px] px-2 py-0.5 rounded-full inline-block"
                    style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>
                    {asset.symbol} · Internal ledger only (no blockchain)
                  </div>
                )}
                <div>
                  <div className="text-[10px] mb-1" style={{ color: "var(--subtle)" }}>
                    Recipient {adapter.name} address
                  </div>
                  <input value={to} onChange={e => handleAddrChange(e.target.value)}
                    placeholder={adapter.addressPlaceholder}
                    className="w-full text-xs rounded-lg px-3 py-2.5"
                    style={{ background: "var(--surface-high)", color: "var(--ink)", outline: "none",
                      border: `1px solid ${addrErr ? "var(--sell)" : "var(--border)"}` }} />
                  {addrErr && <div className="text-[10px] mt-1" style={{ color: "var(--sell)" }}>{addrErr}</div>}
                  {!addrErr && to && (
                    <div className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "var(--buy)" }}>
                      <CheckCircle2 size={10} /> Valid {adapter.name} address
                    </div>
                  )}
                  <div className="text-[9px] mt-1" style={{ color: "var(--subtle)" }}>{adapter.addressHint}</div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span style={{ color: "var(--subtle)" }}>Amount ({asset.symbol})</span>
                    <button onClick={() => setAmt(String(asset.balance))}
                      className="text-[10px] font-semibold" style={{ color: "var(--accent)" }}>Max</button>
                  </div>
                  <input value={amt} onChange={e => setAmt(e.target.value)} type="number" min="0" step="any"
                    placeholder="0.00" className="w-full text-xs rounded-lg px-3 py-2.5"
                    style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)", outline: "none" }} />
                  <div className="flex justify-between text-[9px] mt-1">
                    <span style={{ color: "var(--subtle)" }}>Balance: {asset.balance} {asset.symbol}</span>
                    {numAmt > 0 && <span style={{ color: "var(--subtle)" }}>≈ {fx.fmt(usdVal)}</span>}
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2 rounded-lg text-[10px]"
                  style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                  <span style={{ color: "var(--subtle)" }}>Network fee</span>
                  <span style={{ color: "var(--ink)" }}>{tab === "internal" ? "Free" : fee.label}</span>
                </div>
                {sendErr && <div className="text-[10px] px-3 py-2 rounded-lg"
                  style={{ background: "rgba(248,113,113,0.1)", color: "var(--sell)" }}>{sendErr}</div>}
                <div className="flex gap-2 pt-1">
                  <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-semibold"
                    style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>Cancel</button>
                  <button onClick={handleCryptoSend}
                    disabled={!!addrErr || !to || numAmt <= 0 || numAmt > asset.balance || isSending}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1"
                    style={{ background: "var(--accent)", color: "#fff" }}>
                    {isSending ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : `Send ${asset.symbol}`}
                  </button>
                </div>
                <div className="text-[9px] text-center" style={{ color: "var(--subtle)" }}>
                  {tab === "onchain" ? `Transactions on ${adapter.name} are irreversible. Verify the address.` : "Internal transfer updates your local balance only."}
                </div>
              </div>
            )}

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
function QuickReceiveModal({ asset, onClose, nativeWallet }: { asset: WalletAsset; onClose: () => void; nativeWallet: UseNativeWalletReturn }) {
  const availableNetworks = getNetworksForSymbol(asset.symbol, asset.network ?? "Ethereum");
  const [selectedNetIdx, setSelectedNetIdx] = useState(0);
  const selectedNet = availableNetworks[selectedNetIdx];
  const network     = selectedNet.network;
  const adapter     = getAdapter(network, asset.symbol);
  const [copied, setCopied] = useState<string|null>(null);

  const nativeAddrInfo = nativeWallet.getAddressInfo(network);
  const addr           = nativeAddrInfo?.address ?? (selectedNet.family === "evm" ? nativeWallet.addresses["Ethereum"] : null) ?? asset.address ?? "";
  const qrValue        = addr ? receiveUri(adapter, addr, asset.symbol) : "";
  const explorerUrl    = addr ? buildAddressUrl(adapter, addr) : "";
  const isLoading      = nativeWallet.loading && !addr;

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>Receive {asset.symbol}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>{adapter.name} network</div>
          </div>
          <button onClick={onClose} style={{ color: "var(--subtle)" }}>✕</button>
        </div>

        {/* Network selector — show when asset supports multiple networks */}
        {availableNetworks.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {availableNetworks.map((n, i) => (
              <button key={n.network} onClick={() => setSelectedNetIdx(i)}
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all"
                style={{
                  background: i === selectedNetIdx ? "var(--accent)" : "var(--surface-high)",
                  color: i === selectedNetIdx ? "#fff" : "var(--subtle)",
                  border: `1px solid ${i === selectedNetIdx ? "var(--accent)" : "var(--border)"}`,
                }}>
                {n.label}
              </button>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-10">
            <Loader2 size={28} className="animate-spin mx-auto mb-3" style={{ color: "var(--accent)" }} />
            <div className="text-xs" style={{ color: "var(--subtle)" }}>Generating your wallet address…</div>
          </div>
        ) : addr ? (
          <>
            <div className="flex justify-center mb-4">
              <QRCode value={qrValue} size={180} />
            </div>
            <div className="text-[10px] text-center mb-3 font-semibold" style={{ color: "var(--subtle)" }}>
              Only send <span style={{ color: "var(--ink)" }}>{asset.symbol}</span> on the{" "}
              <span style={{ color: "var(--accent)" }}>{adapter.name}</span> network to this address.
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3"
              style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
              <span className="flex-1 text-[11px] font-mono break-all leading-relaxed"
                style={{ color: "var(--ink)" }}>{addr}</span>
              <button onClick={() => copy(addr, "addr")} className="flex-shrink-0 ml-2">
                {copied === "addr" ? <CheckCircle2 size={16} style={{ color: "var(--buy)" }} /> : <Copy size={16} style={{ color: "var(--subtle)" }} />}
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => copy(addr, "addr-btn")}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ background: "var(--accent)", color: "#fff" }}>
                <Copy size={12} /> {copied === "addr-btn" ? "Copied!" : "Copy address"}
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
              {nativeWallet.error ?? `No address for ${asset.symbol} on ${adapter.name}.`}
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
  // Single wallet instance — passed down to modals to avoid duplicate hook calls
  const nativeWallet = useNativeWallet();

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
          <CryptoIcon symbol={asset.symbol} size={32} />
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

      {modal === "send"    && <QuickSendModal    asset={asset} onClose={() => setModal(null)} nativeWallet={nativeWallet} />}
      {modal === "receive" && <QuickReceiveModal asset={asset} onClose={() => setModal(null)} nativeWallet={nativeWallet} />}
      {modal === "deposit" && <QuickDepositModal asset={asset} onClose={() => setModal(null)} />}
    </>
  );
}

// ── AssetPickerSheet ──────────────────────────────────────────────────────────
// Shown when Send or Receive is tapped from the home page (not from an asset row).
// User picks an asset, then the send/receive modal opens for that asset.
function AssetPickerSheet({ mode, onPick, onClose }: {
  mode: "send" | "receive";
  onPick: (asset: WalletAsset) => void;
  onClose: () => void;
}) {
  const assets = useWalletStore(s => s.assets);
  const sortedAssets = useMemo(() =>
    [...assets].sort((a, b) => b.usdValue - a.usdValue)
  , [assets]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl md:rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)" }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            {mode === "send" ? "Send — Select Asset" : "Receive — Select Asset"}
          </div>
          <button onClick={onClose} style={{ color: "var(--subtle)" }}>✕</button>
        </div>
        <div className="overflow-y-auto max-h-80 pb-2">
          {sortedAssets.map(a => (
            <button key={a.symbol} onClick={() => onPick(a)}
              className="w-full flex items-center gap-3 px-5 py-3 transition-colors hover:opacity-80"
              style={{ borderBottom: "1px solid var(--border)" }}>
              <CryptoIcon symbol={a.symbol} size={32} />
              <div className="flex-1 text-left">
                <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{a.name}</div>
                <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{a.symbol} · {a.network}</div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold mono" style={{ color: "var(--ink)" }}>
                  {fmtAmt(a.balance)} {a.symbol}
                </div>
                <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                  ${a.usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <ChevronRight size={14} style={{ color: "var(--subtle)", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
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
  onSend: () => void;
  onReceive: () => void;
  onBridge: () => void;
  onExchange: () => void;
  onP2P: () => void;
  onDeFi: () => void;
  onMore: () => void;
  onNgnTap?: () => void;
  onUsdTap?: () => void;
}
function SplitBalanceCard({ totalUsd, totalChange24h, hideBalances, toggleHide, onDeposit, onSwap, onSend, onReceive, onBridge, onExchange, onP2P, onDeFi, onMore, onNgnTap, onUsdTap }: SplitBalanceCardProps) {
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

  const ACTIONS = [
    { icon: <Send size={18}/>,           label: "Send",        sub: "Send crypto or fiat",    fn: onSend     },
    { icon: <Download size={18}/>,       label: "Receive",     sub: "Get crypto or fiat",     fn: onReceive  },
    { icon: <ArrowUpDown size={18}/>,    label: "Swap",        sub: "Exchange assets",        fn: onSwap     },
    { icon: <GitBranch size={18}/>,      label: "Bridge",      sub: "Move across chains",     fn: onBridge   },
    { icon: <ArrowLeftRight size={18}/>, label: "Exchange",    sub: "Crypto to fiat",         fn: onExchange },
    { icon: <Users size={18}/>,          label: "P2P",         sub: "Buy & sell crypto",      fn: onP2P      },
    { icon: <Layers size={18}/>,         label: "DeFi",        sub: "Earn & trade onchain",   fn: onDeFi     },
    { icon: <MoreHorizontal size={18}/>, label: "More",        sub: "Bills, shopping, airtime...", fn: onMore },
    { icon: <Banknote size={18}/>,       label: "Deposit NGN", sub: "Fund your wallet",       fn: () => onDeposit(fiatCurrency) },
  ];

  return (
    <div className="flex flex-col" style={{ background: "var(--bg)" }}>

      {/* ── Split balance card ──────────────────────────────── */}
      <div className="glass-card glass-breathe mx-4 mt-3 rounded-2xl px-5 py-4 flex">
        {/* Crypto Balance */}
        <div role="button" tabIndex={0} onClick={onUsdTap} onKeyDown={e => e.key === "Enter" && onUsdTap?.()} className="flex-1 flex items-center gap-3 text-left active:opacity-70 transition-opacity cursor-pointer">
          <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(59,130,246,0.18)" }}>
            <ArrowUpDown size={20} style={{ color: "#3b82f6" }} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--subtle)" }}>Crypto Balance</span>
              <button onClick={e => { e.stopPropagation(); toggleHide(); }} className="p-0.5">
                {hideBalances
                  ? <EyeOff size={11} style={{ color: "var(--subtle)" }} />
                  : <Eye    size={11} style={{ color: "var(--subtle)" }} />}
              </button>
            </div>
            <div className="text-xl font-bold mono mt-0.5" style={{ color: "var(--ink)" }}>
              {mask(`$${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
            </div>
            <div className="text-[10px] mono mt-0.5" style={{ color: totalChange24h < 0 ? "#ef4444" : "#22c55e" }}>
              {hideBalances ? "•••" : `${totalChange24h >= 0 ? "+" : ""}${totalChange24h.toFixed(2)}% 24h`}
            </div>
          </div>
        </div>

        <div className="w-px mx-4 self-stretch" style={{ background: "var(--border)" }} />

        {/* Fiat Balance */}
        <div role="button" tabIndex={0} onClick={onNgnTap} onKeyDown={e => e.key === "Enter" && onNgnTap?.()} className="flex-1 flex items-center gap-3 text-left active:opacity-70 transition-opacity cursor-pointer">
          <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
            style={{ background: "var(--surface-high)", border: "2px solid var(--border)" }}>
            {fiatConfig ? (
              <img src={`https://flagcdn.com/w40/${(fiatConfig.countryCode || "ng").toLowerCase()}.png`}
                alt={fiatCurrency} className="w-11 h-11 object-cover"
                onError={e => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <Banknote size={18} style={{ color: "var(--subtle)" }} />
            )}
          </div>
          <div>
            <span className="text-xs font-medium" style={{ color: "var(--subtle)" }}>{fiatCurrency} Balance</span>
            <div className="text-xl font-bold mono mt-0.5" style={{ color: "var(--ink)" }}>
              {mask(`${fiatSymbol}${fiatBal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)}
            </div>
            <div className="text-[10px] mono mt-0.5" style={{ color: "var(--subtle)" }}>
              {hideBalances ? "•••" : "0.00% 24h"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action grid — 2 cols, dark card style ─────────────── */}
      <div className="grid grid-cols-2 gap-3 mx-4 mt-4">
        {ACTIONS.map(({ icon, label, sub, fn }) => (
          <button
            key={label}
            onClick={fn}
            className="glass-card flex items-center gap-3 px-4 py-4 rounded-2xl text-left transition-all active:scale-[0.97]"
          >
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 lg-icon-pulse"
              style={{ background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", boxShadow: "0 4px 12px rgba(37,99,235,0.35)" }}>
              <span style={{ color: "#fff", display: "flex" }}>{icon}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>{label}</div>
              <div className="text-[11px] truncate mt-0.5" style={{ color: "var(--subtle)" }}>{sub}</div>
            </div>
            <ChevronRight size={15} className="flex-shrink-0" style={{ color: "var(--subtle)" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── MoreServicesSheet ─────────────────────────────────────────────────────────
interface ServiceItem {
  icon: React.ReactNode;
  label: string;
  sub: string;
  available: boolean;
  action: () => void;
}
function MoreServicesSheet({ onClose, onNavigate, onDefiTab, fiatCurrency, onDeposit }: {
  onClose: () => void;
  onNavigate?: (p: import("@/App").Page) => void;
  onDefiTab?:  (tab: string) => void;
  fiatCurrency: string;
  onDeposit: (cur: string) => void;
}) {
  const userCountry = useWalletStore(s => s.userCountry);

  const sections: { title: string; items: ServiceItem[] }[] = [
    {
      title: "Mobile & Utilities",
      items: [
        {
          icon: <Smartphone size={16}/>,
          label: "Airtime",
          sub: "Top up any mobile number",
          available: ["NG","GH","KE","ZA","TZ","UG"].includes(userCountry),
          action: () => { /* Reloadly integration — requires RELOADLY_API_KEY */ },
        },
        {
          icon: <Wifi size={16}/>,
          label: "Data Bundle",
          sub: "Mobile data top-up",
          available: ["NG","GH","KE","ZA"].includes(userCountry),
          action: () => { /* Reloadly */ },
        },
        {
          icon: <Zap size={16}/>,
          label: "Electricity",
          sub: "Prepaid & postpaid meter",
          available: ["NG","GH","KE","ZA","UG"].includes(userCountry),
          action: () => { /* Reloadly utility */ },
        },
        {
          icon: <Tv size={16}/>,
          label: "Cable / Streaming",
          sub: "DSTV, GOtv, Startimes",
          available: ["NG","GH","KE","ZA"].includes(userCountry),
          action: () => { /* Reloadly */ },
        },
        {
          icon: <Wifi size={16}/>,
          label: "Internet",
          sub: "Fibre, broadband top-up",
          available: ["NG","GH","KE"].includes(userCountry),
          action: () => { /* Reloadly */ },
        },
      ],
    },
    {
      title: "Shopping & Travel",
      items: [
        {
          icon: <ShoppingCart size={16}/>,
          label: "Shopping",
          sub: "Pay merchants with crypto",
          available: false,
          action: () => { /* Shopify / Stripe integration */ },
        },
        {
          icon: <Plane size={16}/>,
          label: "Flights",
          sub: "Book tickets — Duffel / Amadeus",
          available: false,
          action: () => { /* Duffel API — requires DUFFEL_API_KEY */ },
        },
        {
          icon: <Hotel size={16}/>,
          label: "Hotels",
          sub: "Reserve accommodations",
          available: false,
          action: () => { /* Booking.com API */ },
        },
        {
          icon: <Gift size={16}/>,
          label: "Gift Cards",
          sub: "Buy gift cards with crypto",
          available: false,
          action: () => { /* Reloadly gift cards */ },
        },
      ],
    },
    {
      title: "Payments",
      items: [
        {
          icon: <GraduationCap size={16}/>,
          label: "School Fees",
          sub: "JAMB, WAEC, NECO",
          available: ["NG","GH","KE"].includes(userCountry),
          action: () => { /* Remita / bank integration */ },
        },
        {
          icon: <Gamepad2 size={16}/>,
          label: "Betting Deposit",
          sub: "Fund sports betting accounts",
          available: ["NG","GH","KE","ZA"].includes(userCountry),
          action: () => { /* Flutterwave / Paystack */ },
        },
        {
          icon: <CreditCard size={16}/>,
          label: "Trading Account",
          sub: "Fund MT4/MT5, Exness, etc.",
          available: false,
          action: () => { /* Broker API */ },
        },
        {
          icon: <Repeat2 size={16}/>,
          label: "Subscriptions",
          sub: "Netflix, Spotify, iCloud",
          available: false,
          action: () => { /* Virtual card / Stripe */ },
        },
        {
          icon: <Building2 size={16}/>,
          label: "Merchant Payment",
          sub: "Pay any business",
          available: false,
          action: () => { /* Paystack / Stripe */ },
        },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl overflow-hidden flex flex-col"
        style={{ background: "var(--surface)", border: "1px solid var(--border-mid)", maxHeight: "85vh" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>More Services</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>
              Pay with your in-app wallet · {fiatCurrency} · {userCountry}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: "var(--surface-high)" }}>
            <X size={14} style={{ color: "var(--subtle)" }} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 pb-6">
          {sections.map(section => (
            <div key={section.title}>
              <div className="px-5 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--subtle)" }}>
                {section.title}
              </div>
              <div className="grid grid-cols-1 divide-y" style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
                {section.items.map(item => (
                  <button
                    key={item.label}
                    onClick={item.available ? item.action : undefined}
                    className="flex items-center gap-3 px-5 py-3 text-left transition-opacity"
                    style={{
                      opacity: item.available ? 1 : 0.45,
                      cursor: item.available ? "pointer" : "default",
                      borderBottom: "1px solid var(--border)",
                    }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--surface-high)", color: "var(--accent)" }}>
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{item.label}</div>
                      <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{item.sub}</div>
                    </div>
                    {item.available ? (
                      <ChevronRight size={14} style={{ color: "var(--subtle)", flexShrink: 0 }} />
                    ) : (
                      <span className="text-[9px] px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: "var(--surface-high)", color: "var(--subtle)" }}>
                        Soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Key requirement note */}
          <div className="mx-5 mt-4 px-3 py-2.5 rounded-xl text-[10px]"
            style={{ background: "rgba(251,191,36,0.08)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.15)" }}>
            Services marked "Soon" require API keys: Reloadly (airtime/bills), Duffel (flights),
            Flutterwave/Paystack (payments). Configure them in .env to activate.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AddAssetSheet ─────────────────────────────────────────────────────────────
// Full catalogue of supported assets the user can add/remove from their wallet
const ALL_ADDABLE = Object.values(CRYPTO_ASSETS).map(a => ({
  symbol:   a.symbol,
  name:     a.name,
  color:    a.color,
  decimals: a.symbol === "BTC" ? 8 : a.symbol === "SOL" ? 9 : a.symbol === "USDC" || a.symbol === "USDT" ? 6 : 18,
  type:     (a.symbol === "USDC" || a.symbol === "USDT" || a.symbol === "DAI") ? "stablecoin" as const
            : "crypto" as const,
  network:  a.networks[0] ?? "ethereum",
  networks: a.networks,
}));

function AddAssetSheet({ onClose }: { onClose: () => void }) {
  const assets     = useWalletStore(s => s.assets);
  const addAsset   = useWalletStore(s => s.addAsset);
  const removeAsset = useWalletStore(s => s.removeAsset);
  const prices     = useWalletStore(s => s._livePrices);
  const [q, setQ] = useState("");

  const owned = new Set(assets.map(a => a.symbol));

  const filtered = useMemo(() => {
    const lower = q.toLowerCase().trim();
    if (!lower) return ALL_ADDABLE;
    return ALL_ADDABLE.filter(a =>
      a.symbol.toLowerCase().includes(lower) || a.name.toLowerCase().includes(lower)
    );
  }, [q]);

  function handleToggle(a: typeof ALL_ADDABLE[number]) {
    if (owned.has(a.symbol)) {
      removeAsset(a.symbol);
    } else {
      addAsset({
        symbol:   a.symbol,
        name:     a.name,
        balance:  0,
        decimals: a.decimals,
        color:    a.color,
        type:     a.type,
        network:  a.networks[0] ?? "ethereum",
        address:  "",
        change24h: 0,
      });
    }
  }

  const px = (sym: string) => prices[sym] ?? 0;
  const walletAsset = (sym: string) => assets.find(a => a.symbol === sym);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
        <button onClick={onClose} className="p-1.5 rounded-lg" style={{ background: "var(--surface)" }}>
          <X size={16} style={{ color: "var(--ink)" }} />
        </button>
        <span className="font-bold text-base" style={{ color: "var(--ink)" }}>Add Assets</span>
        <span className="ml-auto text-xs" style={{ color: "var(--subtle)" }}>{assets.length} in wallet</span>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--surface)" }}>
          <Search size={14} style={{ color: "var(--subtle)" }} />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name or symbol…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--ink)" }}
          />
          {q && (
            <button onClick={() => setQ("")}><X size={12} style={{ color: "var(--subtle)" }} /></button>
          )}
        </div>
      </div>

      {/* Token list */}
      <div className="flex-1 overflow-y-auto">
        {/* Already in wallet section */}
        {!q && (
          <div className="px-4 pt-3 pb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
              In your wallet
            </span>
          </div>
        )}
        {filtered.map(a => {
          const inWallet  = owned.has(a.symbol);
          const wa        = walletAsset(a.symbol);
          const price     = px(a.symbol);
          const hasBalance = (wa?.balance ?? 0) > 0;
          // Split: show owned first when not searching
          if (!q && !inWallet) return null;
          return (
            <div key={a.symbol}
              className="flex items-center gap-3 px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}>
              <CryptoIcon symbol={a.symbol} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{a.symbol}</span>
                  {inWallet && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>Added</span>}
                </div>
                <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
                  {a.name}
                  {price > 0 && <span className="ml-1">${price.toLocaleString(undefined, { maximumFractionDigits: price < 1 ? 5 : 2 })}</span>}
                </div>
              </div>
              {inWallet && wa && (
                <div className="text-right mr-2">
                  <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
                    {wa.balance > 0 ? wa.balance.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0"}
                  </div>
                  {price > 0 && wa.balance > 0 && (
                    <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
                      ${(wa.balance * price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={() => handleToggle(a)}
                disabled={inWallet && hasBalance}
                title={inWallet && hasBalance ? "Cannot remove — balance > 0" : inWallet ? "Remove from wallet" : "Add to wallet"}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: inWallet ? (hasBalance ? "var(--surface)" : "rgba(239,68,68,0.12)") : "rgba(34,197,94,0.15)",
                  border: `1px solid ${inWallet ? (hasBalance ? "var(--border)" : "rgba(239,68,68,0.3)") : "rgba(34,197,94,0.3)"}`,
                  opacity: inWallet && hasBalance ? 0.4 : 1,
                  cursor: inWallet && hasBalance ? "not-allowed" : "pointer",
                }}>
                {inWallet
                  ? (hasBalance ? <Check size={14} style={{ color: "var(--subtle)" }} /> : <Trash2 size={13} style={{ color: "#ef4444" }} />)
                  : <Plus size={14} style={{ color: "#22c55e" }} />}
              </button>
            </div>
          );
        })}

        {/* Available to add section */}
        {!q && (
          <>
            <div className="px-4 pt-3 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--subtle)" }}>
                Available to add
              </span>
            </div>
            {ALL_ADDABLE.filter(a => !owned.has(a.symbol)).map(a => {
              const price = px(a.symbol);
              return (
                <div key={a.symbol}
                  className="flex items-center gap-3 px-4 py-3 border-b"
                  style={{ borderColor: "var(--border)" }}>
                  <CryptoIcon symbol={a.symbol} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>{a.symbol}</div>
                    <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
                      {a.name}
                      {price > 0 && <span className="ml-1">${price.toLocaleString(undefined, { maximumFractionDigits: price < 1 ? 5 : 2 })}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(a)}
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)" }}>
                    <Plus size={14} style={{ color: "#22c55e" }} />
                  </button>
                </div>
              );
            })}
          </>
        )}

        {/* Search: show all filtered */}
        {q && filtered.map(a => {
          const inWallet  = owned.has(a.symbol);
          const wa        = walletAsset(a.symbol);
          const price     = px(a.symbol);
          const hasBalance = (wa?.balance ?? 0) > 0;
          return (
            <div key={a.symbol}
              className="flex items-center gap-3 px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}>
              <CryptoIcon symbol={a.symbol} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{a.symbol}</span>
                  {inWallet && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>Added</span>}
                </div>
                <div className="text-[11px]" style={{ color: "var(--subtle)" }}>
                  {a.name}
                  {price > 0 && <span className="ml-1">${price.toLocaleString(undefined, { maximumFractionDigits: price < 1 ? 5 : 2 })}</span>}
                </div>
              </div>
              {inWallet && wa && wa.balance > 0 && (
                <div className="text-right mr-2">
                  <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>
                    {wa.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </div>
                </div>
              )}
              <button
                onClick={() => handleToggle(a)}
                disabled={inWallet && hasBalance}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: inWallet ? (hasBalance ? "var(--surface)" : "rgba(239,68,68,0.12)") : "rgba(34,197,94,0.15)",
                  border: `1px solid ${inWallet ? (hasBalance ? "var(--border)" : "rgba(239,68,68,0.3)") : "rgba(34,197,94,0.3)"}`,
                  opacity: inWallet && hasBalance ? 0.4 : 1,
                  cursor: inWallet && hasBalance ? "not-allowed" : "pointer",
                }}>
                {inWallet
                  ? (hasBalance ? <Check size={14} style={{ color: "var(--subtle)" }} /> : <Trash2 size={13} style={{ color: "#ef4444" }} />)
                  : <Plus size={14} style={{ color: "#22c55e" }} />}
              </button>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-16 text-center" style={{ color: "var(--subtle)" }}>
            <Search size={28} className="mx-auto mb-2 opacity-30" />
            <div className="text-sm">No assets found for "{q}"</div>
          </div>
        )}
        <div className="h-8" />
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
  const totalUsd       = useWalletStore(s => s.totalUsd);
  const totalChange24h = useWalletStore(s => s.totalChange24h);
  const hideBalances   = useWalletStore(s => s.hideBalances);
  const toggleHide     = useWalletStore(s => s.toggleHide);
  const primaryFiat    = useWalletStore(s => s.primaryFiat);

  const [selectedAsset, setSelectedAsset] = useState<WalletAsset|null>(null);

  const [swapOpen, setSwapOpen] = useState(false);
  const [depositCurrency, setDepositCurrency] = useState<string|null>(null);
  const [ngnOpen, setNgnOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [usdOpen, setUsdOpen] = useState(false);
  const [addAssetOpen, setAddAssetOpen] = useState(false);



  // Home-level Send/Receive: asset picker → modal
  // nativeWallet lifted here so it's one instance across the whole page
  const nativeWallet = useNativeWallet();
  const [homeModal, setHomeModal] = useState<{ mode: "send"|"receive"; asset: WalletAsset } | null>(null);
  const [pickerMode, setPickerMode] = useState<"send"|"receive"|null>(null);





  if (selectedAsset) {
    return <AssetDetailSheet asset={selectedAsset} onClose={() => setSelectedAsset(null)} />;
  }

  if (usdOpen) {
    return (
      <CryptoDashboard
        onClose={() => setUsdOpen(false)}
        onNavigate={onNavigate ? (p) => onNavigate(p as import("@/App").Page) : undefined}
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
      <div className="flex-1 overflow-y-auto pb-6">
        <SplitBalanceCard
          totalUsd={totalUsd}
          totalChange24h={totalChange24h}
          hideBalances={hideBalances}
          toggleHide={toggleHide}
          onDeposit={(cur) => setDepositCurrency(cur || primaryFiat)}
          onSwap={() => setSwapOpen(true)}
          onSend={() => setPickerMode("send")}
          onReceive={() => setPickerMode("receive")}
          onBridge={() => setBridgeOpen(true)}
          onExchange={() => setExchangeOpen(true)}
          onP2P={() => onNavigate?.("p2p")}
          onDeFi={() => onNavigate?.("defi")}
          onMore={() => setMoreOpen(true)}
          onNgnTap={() => setNgnOpen(true)}
          onUsdTap={() => setUsdOpen(true)}
        />

        {/* ── P2P Quick Swap promo banner ───────────────────── */}
        <button
          onClick={() => onNavigate?.("p2p")}
          className="glass-card mx-4 mt-4 w-[calc(100%-2rem)] flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all active:scale-[0.99]"
        >
          {/* Dual-coin icon */}
          <div className="relative flex-shrink-0 w-14 h-12">
            <div className="absolute left-0 bottom-0 w-9 h-9 rounded-full flex items-center justify-center border-2"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", borderColor: "rgba(255,255,255,0.8)", boxShadow: "0 2px 8px rgba(37,99,235,0.4)" }}>
              <span className="text-[11px] font-black" style={{ color: "#fff" }}>$</span>
            </div>
            <div className="absolute right-0 bottom-0 w-9 h-9 rounded-full flex items-center justify-center border-2"
              style={{ background: "linear-gradient(135deg,#16a34a,#15803d)", borderColor: "rgba(255,255,255,0.8)", boxShadow: "0 2px 8px rgba(22,163,74,0.4)" }}>
              <span className="text-[11px] font-black" style={{ color: "#fff" }}>₦</span>
            </div>
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full flex items-center justify-center"
              style={{ background: "#22c55e" }}>
              <ArrowUpDown size={10} style={{ color: "#fff" }} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm" style={{ color: "var(--ink)" }}>P2P Quick Swap</div>
            <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--subtle)" }}>
              Convert between crypto and Naira instantly at the best rates.
            </div>
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full flex-shrink-0"
            style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(59,130,246,0.3)" }}>
            <span className="text-xs font-semibold" style={{ color: "#60a5fa" }}>Swap Now</span>
            <ChevronRight size={12} style={{ color: "#60a5fa" }} />
          </div>
        </button>


      </div>{/* end scrollable */}

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

      {/* Asset picker — opened by home-level Send / Receive buttons */}
      {pickerMode && !homeModal && (
        <AssetPickerSheet
          mode={pickerMode}
          onPick={(asset) => {
            setHomeModal({ mode: pickerMode, asset });
            setPickerMode(null);
          }}
          onClose={() => setPickerMode(null)}
        />
      )}

      {/* Send modal — home level */}
      {homeModal?.mode === "send" && (
        <QuickSendModal
          asset={homeModal.asset}
          nativeWallet={nativeWallet}
          onClose={() => setHomeModal(null)}
        />
      )}

      {/* Receive modal — home level */}
      {homeModal?.mode === "receive" && (
        <QuickReceiveModal
          asset={homeModal.asset}
          nativeWallet={nativeWallet}
          onClose={() => setHomeModal(null)}
        />
      )}

      {/* Bridge overlay */}
      {bridgeOpen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "var(--bg)" }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
            style={{ borderColor: "var(--border)" }}>
            <button onClick={() => setBridgeOpen(false)}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "var(--surface-high)" }}>
              <X size={16} style={{ color: "var(--ink)" }} />
            </button>
            <span className="font-semibold text-sm" style={{ color: "var(--ink)" }}>Bridge</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            <MultiProtocolBridge nativeWallet={nativeWallet} />
          </div>
        </div>
      )}

      {/* Exchange overlay */}
      {exchangeOpen && <ExchangeScreen onClose={() => setExchangeOpen(false)} />}

      {/* Add asset sheet */}
      {addAssetOpen && <AddAssetSheet onClose={() => setAddAssetOpen(false)} />}

      {/* More services sheet */}
      {moreOpen && (
        <MoreServicesSheet
          onClose={() => setMoreOpen(false)}
          onNavigate={onNavigate}
          onDefiTab={onDefiTab}
          fiatCurrency={primaryFiat}
          onDeposit={(cur) => { setMoreOpen(false); setDepositCurrency(cur || primaryFiat); }}
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
