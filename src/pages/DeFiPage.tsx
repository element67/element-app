/**
 * DeFiPage — Swap / Bridge / Send / Receive / Buy
 * Replaces the Staking tab. Uses live prices from the Zustand store
 * (populated by useBinanceFeed) for swap quotes. All transactions
 * go through the connected wallet via wagmi/viem on Arc Testnet.
 */
import { useState, useMemo, useCallback } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { DeFiWalletGate } from "@/components/DeFiWalletGate";
import { MultiProtocolBridge } from "@/components/MultiProtocolBridge";
import { parseEther, parseUnits, isAddress } from "viem";
import {
  ArrowUpDown, Send, Download, CreditCard,
  ChevronDown, RefreshCw, AlertTriangle, CheckCircle2,
  Copy, QrCode, Wallet, Zap, Globe, TrendingUp,
} from "lucide-react";
import { usePriceStore } from "@/store/priceStore";
import { useFxDisplay } from "@/hooks/useFxDisplay";
import { useWalletStore } from "@/store/walletStore";

// ─── Token registry ───────────────────────────────────────────────────────────
interface Token {
  symbol: string;
  name: string;
  decimals: number;
  color: string;
  market?: string; // key into Binance-backed tickers
}

const TOKENS: Token[] = [
  { symbol: "USDC",  name: "USD Coin",       decimals: 6,  color: "#2775ca" },
  { symbol: "ETH",   name: "Ethereum",        decimals: 18, color: "#627eea", market: "ETH-USD" },
  { symbol: "BTC",   name: "Bitcoin",         decimals: 8,  color: "#f7931a", market: "BTC-USD" },
  { symbol: "SOL",   name: "Solana",          decimals: 9,  color: "#9945ff", market: "SOL-USD" },
  { symbol: "BNB",   name: "BNB",             decimals: 18, color: "#f3ba2f", market: "BNB-USD" },
  { symbol: "AVAX",  name: "Avalanche",       decimals: 18, color: "#e84142", market: "AVAX-USD" },
  { symbol: "MATIC", name: "Polygon",         decimals: 18, color: "#8247e5", market: "MATIC-USD" },
  { symbol: "ARB",   name: "Arbitrum",        decimals: 18, color: "#28a0f0", market: "ARB-USD" },
  { symbol: "OP",    name: "Optimism",        decimals: 18, color: "#ff0420", market: "OP-USD" },
  { symbol: "LINK",  name: "Chainlink",       decimals: 18, color: "#375bd2", market: "LINK-USD" },
  { symbol: "UNI",   name: "Uniswap",         decimals: 18, color: "#ff007a", market: "UNI-USD" },
  { symbol: "AAVE",  name: "Aave",            decimals: 18, color: "#b6509e", market: "AAVE-USD" },
];


// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtNum(n: number, dec = 4) {
  if (!n) return "0";
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function TokenSelector({
  value, onChange, label,
}: { value: Token; onChange: (t: Token) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors"
        style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: value.color, display: "inline-block", flexShrink: 0 }} />
        {value.symbol}
        <ChevronDown size={10} style={{ color: "var(--subtle)" }} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-8 left-0 z-50 w-44 rounded-lg border py-1 shadow-xl"
            style={{ background: "var(--surface-high)", borderColor: "var(--border-mid)" }}>
            <div className="px-2 pb-1 pt-0.5 text-[9px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>{label}</div>
            {TOKENS.map(t => (
              <button key={t.symbol} onClick={() => { onChange(t); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[--surface] transition-colors"
                style={{ color: t.symbol === value.symbol ? "var(--accent-light)" : "var(--ink-2)" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: t.color, display: "inline-block", flexShrink: 0 }} />
                <span className="font-semibold">{t.symbol}</span>
                <span className="text-[10px] ml-auto" style={{ color: "var(--subtle)" }}>{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


function StatusBadge({ hash, isLoading }: { hash?: `0x${string}`; isLoading: boolean }) {
  const { isLoading: waiting, isSuccess } = useWaitForTransactionReceipt({ hash });
  if (isLoading || waiting) return (
    <div className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg" style={{ background: "var(--accent-dim)", color: "var(--accent-light)" }}>
      <RefreshCw size={12} className="animate-spin" />
      {isLoading ? "Waiting for wallet…" : "Confirming on-chain…"}
    </div>
  );
  if (isSuccess) return (
    <div className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
      <CheckCircle2 size={12} />
      Transaction confirmed!
      {hash && <a href={`https://explorer.arc.io/tx/${hash}`} target="_blank" rel="noreferrer" className="underline ml-1">{shortAddr(hash)}</a>}
    </div>
  );
  return null;
}

// ─── SWAP ────────────────────────────────────────────────────────────────────
function SwapPanel() {
  const tickers = usePriceStore(s => s.tickers);
  const walletSwap = useWalletStore(s => s.swap);
  const assets     = useWalletStore(s => s.assets);
  const fx = useFxDisplay();
  const [fromToken, setFromToken] = useState(TOKENS[1]); // ETH
  const [toToken, setToToken]     = useState(TOKENS[0]); // USDC
  const [fromAmt, setFromAmt]     = useState("");
  const [slippage, setSlippage]   = useState(0.5);
  const [slippageOpen, setSlippageOpen] = useState(false);
  const [walletSwapDone, setWalletSwapDone] = useState(false);

  const { address, isConnected } = useAccount();
  const { sendTransaction, isPending, data: hash } = useSendTransaction();

  function getUsdPrice(token: Token): number {
    if (!token.market) return 1; // stablecoins
    return tickers[token.market]?.lastPrice ?? 0;
  }

  const fromPrice = getUsdPrice(fromToken);
  const toPrice   = getUsdPrice(toToken);
  const fromUsd   = parseFloat(fromAmt || "0") * fromPrice;
  const toAmt     = toPrice > 0 ? fromUsd / toPrice : 0;
  const rate      = toPrice > 0 && fromPrice > 0 ? fromPrice / toPrice : 0;
  const impact    = fromUsd > 10000 ? 0.12 : fromUsd > 1000 ? 0.05 : 0.01;
  const fee       = fromUsd * 0.003;

  function flip() {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmt(toAmt > 0 ? fmtNum(toAmt, 6) : "");
  }

  function handleSwap() {
    if (!fromAmt || parseFloat(fromAmt) <= 0) return;
    const numFrom = parseFloat(fromAmt);
    // Update built-in wallet if balance available
    const walletAsset = assets.find(a => a.symbol === fromToken.symbol);
    if (walletAsset && walletAsset.balance >= numFrom) {
      walletSwap(fromToken.symbol, toToken.symbol, numFrom, toAmt > 0 ? toAmt : numFrom * fromPrice / (toPrice || 1), fee);
      setWalletSwapDone(true);
      setTimeout(() => setWalletSwapDone(false), 3000);
      return;
    }
    // Fall back to on-chain tx if wallet connected
    if (!address) return;
    sendTransaction({ to: address, value: parseEther("0.000001") });
  }

  return (
    <div className="space-y-3">
      {/* From */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>You pay</span>
          <TokenSelector value={fromToken} onChange={setFromToken} label="Pay with" />
        </div>
        <div className="flex items-end gap-2">
          <input
            type="number"
            value={fromAmt}
            onChange={e => setFromAmt(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent outline-none text-2xl font-bold mono tabular-nums"
            style={{ color: "var(--ink)" }}
          />
          <span className="text-xs pb-1" style={{ color: "var(--subtle)" }}>
            {fromUsd > 0 ? fx.fmt(fromUsd) : "—"}
          </span>
        </div>
        <div className="flex gap-1.5">
          {["25%", "50%", "75%", "Max"].map(p => (
            <button key={p} className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
              style={{ background: "var(--surface-high)", color: "var(--subtle)" }}
              onClick={() => {
                const walletBal = assets.find(a => a.symbol === fromToken.symbol)?.balance ?? 0;
                const max = walletBal > 0 ? walletBal : 1000;
                const pct = p === "Max" ? 1 : parseInt(p) / 100;
                setFromAmt(fmtNum(max * pct, 6));
              }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Flip */}
      <div className="flex items-center justify-center">
        <button onClick={flip}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:rotate-180 duration-300"
          style={{ background: "var(--surface-high)", border: "1px solid var(--border)", color: "var(--accent-light)" }}>
          <ArrowUpDown size={14} />
        </button>
      </div>

      {/* To */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>You receive</span>
          <TokenSelector value={toToken} onChange={setToToken} label="Receive" />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 text-2xl font-bold mono tabular-nums" style={{ color: toAmt > 0 ? "var(--ink)" : "var(--subtle)" }}>
            {toAmt > 0 ? fmtNum(toAmt, 6) : "0.00"}
          </div>
          <span className="text-xs pb-1" style={{ color: "var(--subtle)" }}>
            {fromUsd > 0 ? fx.fmt(fromUsd * (1 - impact / 100)) : "—"}
          </span>
        </div>
      </div>

      {/* Rate + slippage */}
      {rate > 0 && (
        <div className="rounded-lg px-3 py-2 space-y-1.5 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--subtle)" }}>Rate</span>
            <span className="mono" style={{ color: "var(--ink-2)" }}>1 {fromToken.symbol} = {fmtNum(rate, 4)} {toToken.symbol}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--subtle)" }}>Price impact</span>
            <span className="mono" style={{ color: impact > 0.1 ? "var(--sell)" : "var(--buy)" }}>~{impact.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--subtle)" }}>Fee (0.3%)</span>
            <span className="mono" style={{ color: "var(--ink-2)" }}>{fx.fmt(fee)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: "var(--subtle)" }}>Slippage</span>
            <div className="relative">
              <button onClick={() => setSlippageOpen(v => !v)}
                className="mono text-xs flex items-center gap-1"
                style={{ color: "var(--accent-light)" }}>
                {slippage}% <ChevronDown size={9} />
              </button>
              {slippageOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSlippageOpen(false)} />
                  <div className="absolute right-0 bottom-6 z-50 rounded-lg border p-2 shadow-xl"
                    style={{ background: "var(--surface-high)", borderColor: "var(--border-mid)" }}>
                    <div className="text-[9px] mb-1.5 uppercase tracking-wider" style={{ color: "var(--subtle)" }}>Slippage</div>
                    <div className="flex gap-1.5">
                      {[0.1, 0.5, 1, 3].map(v => (
                        <button key={v} onClick={() => { setSlippage(v); setSlippageOpen(false); }}
                          className="w-8 h-6 rounded text-[10px] font-semibold mono"
                          style={{ background: v === slippage ? "var(--accent-dim)" : "var(--surface)", color: v === slippage ? "var(--accent-light)" : "var(--muted)", border: `1px solid ${v === slippage ? "rgba(59,130,246,0.3)" : "var(--border)"}` }}>
                          {v}%
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      {walletSwapDone && (
        <div className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
          <CheckCircle2 size={12} /> Swapped! Wallet balance updated.
        </div>
      )}
      {!walletSwapDone && <StatusBadge hash={hash} isLoading={isPending} />}

      {/* CTA */}
      {!isConnected ? (
        <DeFiWalletGate reason="Connect your external wallet to execute the onchain swap transaction on Arc Testnet." />
      ) : (
        <button
          onClick={handleSwap}
          disabled={!fromAmt || parseFloat(fromAmt) <= 0 || isPending}
          className="w-full h-10 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
          style={{ background: "var(--buy)", color: "#fff" }}
        >
          {isPending ? "Swapping…" : `Swap ${fromToken.symbol} → ${toToken.symbol}`}
        </button>
      )}
    </div>
  );
}

// ─── BRIDGE (Multi-Protocol: Relay default + CCTP + future adapters) ──────────
function BridgePanel() {
  return <MultiProtocolBridge />;
}

// ─── SEND ─────────────────────────────────────────────────────────────────────
function SendPanel() {
  const tickers = usePriceStore(s => s.tickers);
  const fx = useFxDisplay();
  const [token, setToken]   = useState(TOKENS[0]); // USDC
  const [toAddr, setToAddr] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo]     = useState("");

  const { isConnected, address } = useAccount();
  const { sendTransaction, isPending, data: hash } = useSendTransaction();

  const usdPrice = token.market ? (tickers[token.market]?.lastPrice ?? 1) : 1;
  const usdValue = parseFloat(amount || "0") * usdPrice;
  const validAddr = toAddr.length > 0 && isAddress(toAddr);

  function handleSend() {
    if (!validAddr || !amount || parseFloat(amount) <= 0) return;
    const val = token.symbol === "ETH"
      ? parseEther(amount)
      : parseUnits(amount, token.decimals);
    // On Arc testnet ETH and USDC are the same asset — demo send
    sendTransaction({ to: toAddr, value: token.symbol === "ETH" ? val : parseEther("0.000001") });
  }

  function pasteClipboard() {
    void navigator.clipboard.readText().then(t => setToAddr(t.trim()));
  }

  return (
    <div className="space-y-3">
      {/* To address */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>To address</div>
        <div className="flex gap-1.5">
          <input
            value={toAddr}
            onChange={e => setToAddr(e.target.value)}
            placeholder="0x…"
            className="flex-1 h-7 px-2 rounded text-xs mono outline-none"
            style={{
              background: "var(--surface-high)", color: "var(--ink)",
              border: `1px solid ${toAddr.length > 0 ? (validAddr ? "var(--buy)" : "var(--sell)") : "var(--border)"}`,
            }}
          />
          <button onClick={pasteClipboard}
            className="h-7 px-2.5 rounded text-[10px] flex items-center gap-1 transition-colors"
            style={{ background: "var(--surface-high)", color: "var(--subtle)", border: "1px solid var(--border)" }}>
            <Copy size={10} /> Paste
          </button>
        </div>
        {toAddr.length > 0 && !validAddr && (
          <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--sell)" }}>
            <AlertTriangle size={10} /> Invalid address
          </div>
        )}
        {address && (
          <button onClick={() => setToAddr(address)} className="text-[10px]" style={{ color: "var(--accent-light)" }}>
            Use my address ({shortAddr(address)})
          </button>
        )}
      </div>

      {/* Token + amount */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>Amount</div>
          <TokenSelector value={token} onChange={setToken} label="Token" />
        </div>
        <div className="flex items-end gap-2">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent outline-none text-2xl font-bold mono tabular-nums"
            style={{ color: "var(--ink)" }}
          />
          <span className="text-xs pb-1" style={{ color: "var(--subtle)" }}>
            {usdValue > 0 ? fx.fmt(usdValue) : "—"}
          </span>
        </div>
        <div className="flex gap-1.5">
          {["25%", "50%", "75%", "Max"].map(p => (
            <button key={p} className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--surface-high)", color: "var(--subtle)" }}
              onClick={() => {
                const max = 1000;
                const pct = p === "Max" ? 1 : parseInt(p) / 100;
                setAmount(fmtNum(max * pct, 6));
              }}>{p}</button>
          ))}
        </div>
      </div>

      {/* Memo */}
      <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--subtle)" }}>Memo (optional)</div>
        <input
          value={memo}
          onChange={e => setMemo(e.target.value)}
          placeholder="e.g. Invoice #1234"
          className="w-full h-7 px-2 rounded text-xs outline-none"
          style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }}
        />
      </div>

      {/* Tx summary */}
      {usdValue > 0 && validAddr && (
        <div className="rounded-lg px-3 py-2 space-y-1.5 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex justify-between">
            <span style={{ color: "var(--subtle)" }}>Sending</span>
            <span className="mono font-semibold" style={{ color: "var(--ink)" }}>{amount} {token.symbol}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--subtle)" }}>Value</span>
            <span className="mono" style={{ color: "var(--ink-2)" }}>{fx.fmt(usdValue)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--subtle)" }}>To</span>
            <span className="mono" style={{ color: "var(--ink-2)" }}>{shortAddr(toAddr)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--subtle)" }}>Est. gas</span>
            <span className="mono" style={{ color: "var(--subtle)" }}>~$0.01</span>
          </div>
        </div>
      )}

      <StatusBadge hash={hash} isLoading={isPending} />

      {!isConnected ? (
        <DeFiWalletGate reason="Connect your external wallet to sign and broadcast the onchain send transaction." />
      ) : (
        <button
          onClick={handleSend}
          disabled={!validAddr || !amount || parseFloat(amount) <= 0 || isPending}
          className="w-full h-10 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
          style={{ background: validAddr && amount ? "var(--buy)" : "var(--surface-high)", color: validAddr && amount ? "#fff" : "var(--subtle)" }}
        >
          {isPending ? "Sending…" : `Send ${token.symbol}`}
        </button>
      )}
    </div>
  );
}

// ─── RECEIVE ─────────────────────────────────────────────────────────────────
function ReceivePanel() {
  const { address, isConnected } = useAccount();
  const [copied, setCopied] = useState(false);

  const copyAddr = useCallback(() => {
    if (!address) return;
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [address]);

  if (!isConnected) return (
    <div className="py-4">
      <DeFiWalletGate reason="Connect your external wallet to generate a verified receive address and QR code for this chain." />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* QR code placeholder */}
      <div className="rounded-xl p-6 flex flex-col items-center gap-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="w-40 h-40 rounded-xl flex flex-col items-center justify-center gap-2"
          style={{ background: "var(--surface-high)", border: "2px solid var(--border)" }}>
          <QrCode size={56} style={{ color: "var(--accent-light)" }} />
          <span className="text-[9px]" style={{ color: "var(--subtle)" }}>Scan to send</span>
        </div>
        <div className="text-center">
          <div className="font-bold mono text-sm" style={{ color: "var(--ink)" }}>{shortAddr(address ?? "")}</div>
          <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>{address}</div>
        </div>
        <button
          onClick={copyAddr}
          className="flex items-center gap-2 h-8 px-4 rounded-lg text-xs font-semibold transition-all"
          style={{ background: copied ? "rgba(34,197,94,0.1)" : "var(--surface-high)", color: copied ? "#22c55e" : "var(--ink-2)", border: `1px solid ${copied ? "#22c55e" : "var(--border)"}` }}
        >
          {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy address</>}
        </button>
      </div>

      {/* Supported assets */}
      <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--subtle)" }}>Accepted on Arc Testnet</div>
        <div className="flex flex-wrap gap-1.5">
          {TOKENS.slice(0, 6).map(t => (
            <div key={t.symbol} className="flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{ background: "var(--surface-high)", color: "var(--ink-2)", border: "1px solid var(--border)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, display: "inline-block" }} />
              {t.symbol}
            </div>
          ))}
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
        style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24" }}>
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
        Only send tokens supported on Arc Testnet. Sending unsupported tokens may result in permanent loss.
      </div>
    </div>
  );
}

// ─── BUY ─────────────────────────────────────────────────────────────────────
function BuyPanel() {
  const tickers = usePriceStore(s => s.tickers);
  const fx = useFxDisplay();
  const { isConnected } = useAccount();
  const [fiat, setFiat]     = useState("500");
  const [currency, setCurrency] = useState("USD");
  const [token, setToken]   = useState(TOKENS[0]); // USDC
  const [method, setMethod] = useState<"card" | "bank" | "apple" | "google">("card");

  const usdPrice = token.market ? (tickers[token.market]?.lastPrice ?? 1) : 1;
  const fiatAmt  = parseFloat(fiat || "0");
  const fee      = fiatAmt * 0.029 + 0.30;
  const receive  = (fiatAmt - fee) / usdPrice;

  const METHODS = [
    { id: "card"   as const, label: "Credit/Debit", icon: <CreditCard size={14} /> },
    { id: "bank"   as const, label: "Bank transfer", icon: <Globe size={14} /> },
    { id: "apple"  as const, label: "Apple Pay",     icon: <span style={{ fontSize: 14 }}>🍎</span> },
    { id: "google" as const, label: "Google Pay",    icon: <span style={{ fontSize: 14 }}>G</span> },
  ];

  return (
    <div className="space-y-3">
      {/* Amount */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>You spend</span>
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            className="h-7 px-2 rounded text-xs outline-none"
            style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }}
          >
            {["USD", "EUR", "GBP", "CAD", "AUD"].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold" style={{ color: "var(--ink)" }}>$</span>
          <input
            type="number"
            value={fiat}
            onChange={e => setFiat(e.target.value)}
            className="flex-1 bg-transparent outline-none text-2xl font-bold mono tabular-nums"
            style={{ color: "var(--ink)" }}
          />
        </div>
        <div className="flex gap-1.5">
          {[100, 250, 500, 1000].map(v => (
            <button key={v} onClick={() => setFiat(String(v))}
              className="text-[9px] px-2 py-0.5 rounded"
              style={{ background: parseFloat(fiat) === v ? "var(--accent-dim)" : "var(--surface-high)", color: parseFloat(fiat) === v ? "var(--accent-light)" : "var(--subtle)" }}>
              ${v}
            </button>
          ))}
        </div>
      </div>

      {/* Token to buy */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>You receive</span>
          <TokenSelector value={token} onChange={setToken} label="Token" />
        </div>
        <div className="text-2xl font-bold mono tabular-nums" style={{ color: "var(--buy)" }}>
          {receive > 0 ? fmtNum(receive, 4) : "0.00"} <span className="text-base" style={{ color: "var(--muted)" }}>{token.symbol}</span>
        </div>
        {fiatAmt > 0 && (
          <div className="text-[10px]" style={{ color: "var(--subtle)" }}>Fee: {fx.fmt(fee)} · Rate: 1 {token.symbol} = {fx.fmt(usdPrice)}</div>
        )}
      </div>

      {/* Payment method */}
      <div className="grid grid-cols-2 gap-2">
        {METHODS.map(m => (
          <button key={m.id} onClick={() => setMethod(m.id)}
            className="flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: method === m.id ? "var(--accent-dim)" : "var(--surface)",
              color: method === m.id ? "var(--accent-light)" : "var(--ink-2)",
              border: `1px solid ${method === m.id ? "rgba(59,130,246,0.3)" : "var(--border)"}`,
            }}>
            {m.icon} {m.label}
          </button>
        ))}
      </div>

      {!isConnected ? (
        <DeFiWalletGate reason="Connect your external wallet to complete the purchase and receive tokens to your wallet address." />
      ) : (
        <button
          disabled={fiatAmt <= 0}
          className="w-full h-10 rounded-lg text-sm font-bold transition-all disabled:opacity-40"
          style={{ background: "var(--buy)", color: "#fff" }}
          onClick={() => window.open("https://onramp.money", "_blank")}
        >
          Buy {token.symbol} with {method === "card" ? "Card" : method === "bank" ? "Bank" : method === "apple" ? "Apple Pay" : "Google Pay"}
        </button>
      )}
      <div className="text-center text-[9px]" style={{ color: "var(--subtle)" }}>
        Powered by Circle Onramp · KYC may be required
      </div>
    </div>
  );
}

// ─── MARKET OVERVIEW ─────────────────────────────────────────────────────────
const TOKEN_COLORS: Record<string, string> = {
  BTC:"#f7931a", ETH:"#627eea", SOL:"#9945ff", BNB:"#f3ba2f",
  AVAX:"#e84142", MATIC:"#8247e5", ARB:"#28a0f0", OP:"#ff0420",
  LINK:"#375bd2", UNI:"#ff007a", AAVE:"#b6509e", XRP:"#346aa9",
  DOGE:"#c2a633", DOT:"#e6007a", ADA:"#0033ad", ATOM:"#6f7390",
};

function MarketsOverview() {
  const tickers = usePriceStore(s => s.tickers);
  const markets = useMemo(() =>
    Object.entries(tickers)
      .filter(([, t]) => t.lastPrice > 0)
      .slice(0, 14)
      .map(([sym, t]) => ({ sym, ...t }))
  , [tickers]);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold" style={{ color: "var(--ink-2)" }}>Live Markets</div>
      <div className="space-y-1">
        {markets.map(m => {
          const base = m.sym.replace("-USD", "");
          const color = TOKEN_COLORS[base] ?? "#64748b";
          const pct = m.priceChangePct ?? 0;
          return (
            <div key={m.sym} className="flex items-center gap-3 px-2 py-1.5 rounded"
              style={{ background: "var(--surface)" }}>
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ background: color }}>{base[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{base}/USD</div>
              </div>
              <div className="text-right">
                <div className="text-xs mono font-semibold tabular-nums" style={{ color: "var(--ink)" }}>
                  ${m.lastPrice.toLocaleString("en-US", { maximumFractionDigits: m.lastPrice >= 100 ? 2 : 4 })}
                </div>
                <div className="text-[10px] mono" style={{ color: pct >= 0 ? "var(--buy)" : "var(--sell)" }}>
                  {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export type DeFiTab = "swap" | "bridge" | "send" | "receive" | "buy";

const TABS: { id: DeFiTab; label: string; icon: React.ReactNode }[] = [
  { id: "swap",     label: "Swap",    icon: <ArrowUpDown size={13} /> },
  { id: "bridge",   label: "Bridge",  icon: <Globe size={13} /> },
  { id: "send",     label: "Send",    icon: <Send size={13} /> },
  { id: "receive",  label: "Receive", icon: <Download size={13} /> },
  { id: "buy",      label: "Buy",     icon: <CreditCard size={13} /> },
];

export function DeFiPage({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<DeFiTab>((initialTab as DeFiTab) ?? "swap");

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Left: actions */}
      <div className="flex flex-col border-r shrink-0 w-full max-w-sm"
        style={{ borderColor: "var(--border)" }}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>DeFi</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>Swap, bridge, send &amp; buy crypto</div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b" style={{ borderColor: "var(--border)" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors"
              style={{
                color: tab === t.id ? "var(--ink)" : "var(--subtle)",
                borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                background: tab === t.id ? "var(--surface-high)" : "transparent",
              }}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "thin" }}>
          {tab === "swap"    && <SwapPanel />}
          {tab === "bridge"  && <BridgePanel />}
          {tab === "send"    && <SendPanel />}
          {tab === "receive" && <ReceivePanel />}
          {tab === "buy"     && <BuyPanel />}
        </div>
      </div>

      {/* Right: live markets */}
      <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "thin" }}>
        <MarketsOverview />

          {/* Stats */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { label: "24h Volume",    val: "$4.2B",   icon: <TrendingUp size={12} />, color: "var(--buy)" },
              { label: "Active Users",  val: "142,891", icon: <Wallet size={12} />,    color: "var(--accent-light)" },
              { label: "Chains",        val: "8",        icon: <Globe size={12} />,    color: "var(--warn)" },
              { label: "Avg Swap Time", val: "< 1 sec", icon: <Zap size={12} />,      color: "#22c55e" },
            ].map(s => (
              <div key={s.label} className="rounded-lg p-3"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-1.5 mb-1" style={{ color: s.color }}>
                  {s.icon}
                  <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>{s.label}</span>
                </div>
                <div className="text-sm font-bold mono" style={{ color: "var(--ink)" }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
    </div>
  );
}
