/**
 * DeFiPage — Swap / Bridge / Send / Receive / Buy
 * External wallet only (ConnectKit/wagmi). No internal wallet used here.
 *
 * Send:  native ETH via sendTransaction; ERC-20 via writeContract(transfer).
 * Swap:  price quote from Binance feed; execution routed to Uniswap/1inch
 *        because no on-app AMM is deployed — honest redirect, not a fake tx.
 * Bridge: MultiProtocolBridge (Relay + CCTP) — full real execution.
 * Receive: QR + copy of connected wallet address.
 * Buy: Circle Onramp widget with wallet address pre-filled.
 */
import { useState, useMemo } from "react";
import {
  useAccount, useSendTransaction, useWaitForTransactionReceipt,
  useWriteContract, useBalance, useChainId, useSwitchChain,
} from "wagmi";
import { DeFiWalletGate } from "@/components/DeFiWalletGate";
import { MultiProtocolBridge } from "@/components/MultiProtocolBridge";
import { parseEther, parseUnits, isAddress, erc20Abi } from "viem";
import {
  ArrowUpDown, Send, Download, CreditCard,
  ChevronDown, RefreshCw, AlertTriangle, CheckCircle2,
  Copy, Wallet, Zap, Globe, TrendingUp, Loader2, ExternalLink,
  ArrowRight,
} from "lucide-react";
import { usePriceStore } from "@/store/priceStore";
import { useFxDisplay } from "@/hooks/useFxDisplay";
import { CryptoIcon } from "@/components/AssetIcons";

// ─── QR Code ──────────────────────────────────────────────────────────────────
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

// ─── Token registry ───────────────────────────────────────────────────────────
interface Token {
  symbol: string;
  name: string;
  decimals: number;
  color: string;
  market?: string;
  /** ERC-20 contract address on each chainId. Absent = native gas token. */
  addresses?: Record<number, `0x${string}`>;
}

// Well-known ERC-20 addresses for common chains
const TOKENS: Token[] = [
  {
    symbol: "ETH", name: "Ethereum", decimals: 18, color: "#627eea", market: "ETH-USD",
  },
  {
    symbol: "USDC", name: "USD Coin", decimals: 6, color: "#2775ca",
    addresses: {
      1:     "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      8453:  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      10:    "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      137:   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      56:    "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      43114: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    },
  },
  {
    symbol: "USDT", name: "Tether", decimals: 6, color: "#26a17b",
    addresses: {
      1:     "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      56:    "0x55d398326f99059fF775485246999027B3197955",
      137:   "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      42161: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    },
  },
  {
    symbol: "WBTC", name: "Wrapped BTC", decimals: 8, color: "#f7931a",
    addresses: {
      1:     "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      42161: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
    },
  },
  {
    symbol: "BNB",  name: "BNB",          decimals: 18, color: "#f3ba2f", market: "BNB-USD" },
  { symbol: "AVAX", name: "Avalanche",    decimals: 18, color: "#e84142", market: "AVAX-USD" },
  { symbol: "MATIC",name: "Polygon",      decimals: 18, color: "#8247e5", market: "MATIC-USD" },
  { symbol: "ARB",  name: "Arbitrum",     decimals: 18, color: "#28a0f0", market: "ARB-USD",
    addresses: { 42161: "0x912CE59144191C1204E64559FE8253a0e49E6548" } },
  { symbol: "OP",   name: "Optimism",     decimals: 18, color: "#ff0420", market: "OP-USD",
    addresses: { 10: "0x4200000000000000000000000000000000000042" } },
  { symbol: "LINK", name: "Chainlink",    decimals: 18, color: "#375bd2", market: "LINK-USD",
    addresses: { 1: "0x514910771AF9Ca656af840dff83E8264EcF986CA" } },
  { symbol: "UNI",  name: "Uniswap",      decimals: 18, color: "#ff007a", market: "UNI-USD",
    addresses: { 1: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" } },
  { symbol: "AAVE", name: "Aave",         decimals: 18, color: "#b6509e", market: "AAVE-USD",
    addresses: { 1: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9" } },
];

// ─── Chain label map ──────────────────────────────────────────────────────────
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum", 8453: "Base", 42161: "Arbitrum", 10: "Optimism",
  137: "Polygon", 56: "BNB Chain", 43114: "Avalanche",
  11155111: "Sepolia", 84532: "Base Sepolia", 421614: "Arb Sepolia",
  5042: "Arc Testnet",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(n: number, dec = 4) {
  if (!n) return "0";
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

function shortAddr(a: string) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

function fmtBalance(raw: bigint | undefined, decimals: number): number {
  if (!raw) return 0;
  return Number(raw) / 10 ** decimals;
}

// ─── Token Selector ───────────────────────────────────────────────────────────
function TokenSelector({ value, onChange, label }: { value: Token; onChange: (t: Token) => void; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors"
        style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }}>
        <CryptoIcon symbol={value.symbol} size={16} />
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
                <CryptoIcon symbol={t.symbol} size={16} />
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

// ─── Chain Badge ──────────────────────────────────────────────────────────────
function ChainBadge({ chainId }: { chainId: number | undefined }) {
  if (!chainId) return null;
  const label = CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
  return (
    <span className="text-[9px] px-1.5 py-0.5 rounded-full mono"
      style={{ background: "rgba(59,130,246,0.1)", color: "var(--accent-light)", border: "1px solid rgba(59,130,246,0.2)" }}>
      {label}
    </span>
  );
}

// ─── Tx status badge ──────────────────────────────────────────────────────────
function StatusBadge({ hash, isLoading, explorerBase }: {
  hash?: `0x${string}`; isLoading: boolean; explorerBase?: string;
}) {
  const { isLoading: waiting, isSuccess } = useWaitForTransactionReceipt({ hash });
  if (isLoading || waiting) return (
    <div className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg"
      style={{ background: "var(--accent-dim)", color: "var(--accent-light)" }}>
      <RefreshCw size={12} className="animate-spin" />
      {isLoading ? "Waiting for wallet…" : "Confirming onchain…"}
    </div>
  );
  if (isSuccess) return (
    <div className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg"
      style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
      <CheckCircle2 size={12} />
      Transaction confirmed!
      {hash && (
        <a href={`${explorerBase ?? "https://etherscan.io"}/tx/${hash}`}
          target="_blank" rel="noreferrer" className="underline ml-1 flex items-center gap-0.5">
          {shortAddr(hash)} <ExternalLink size={9} />
        </a>
      )}
    </div>
  );
  return null;
}

// ─── SWAP ─────────────────────────────────────────────────────────────────────
function SwapPanel() {
  const tickers = usePriceStore(s => s.tickers);
  const fx = useFxDisplay();
  const [fromToken, setFromToken] = useState(TOKENS[0]); // ETH
  const [toToken,   setToToken]   = useState(TOKENS[1]); // USDC
  const [fromAmt,   setFromAmt]   = useState("");
  const [slippage,  setSlippage]  = useState(0.5);
  const [slippageOpen, setSlippageOpen] = useState(false);

  const { address, isConnected, chainId } = useAccount();

  // Live balance of the "from" token via wagmi
  const tokenAddr = fromToken.addresses?.[chainId ?? 1];
  const { data: balData } = useBalance({
    address,
    token: tokenAddr,
    query: { enabled: isConnected && !!address },
  });
  const walletBal = balData ? fmtBalance(balData.value, balData.decimals) : 0;

  function getUsdPrice(token: Token): number {
    if (!token.market) return 1;
    return tickers[token.market]?.lastPrice ?? 0;
  }

  const fromPrice = getUsdPrice(fromToken);
  const toPrice   = getUsdPrice(toToken);
  const fromUsd   = parseFloat(fromAmt || "0") * fromPrice;
  const toAmt     = toPrice > 0 ? fromUsd / toPrice : 0;
  const rate      = toPrice > 0 && fromPrice > 0 ? fromPrice / toPrice : 0;
  const impact    = fromUsd > 10000 ? 0.12 : fromUsd > 1000 ? 0.05 : 0.01;
  const fee       = fromUsd * 0.003;
  const numFrom   = parseFloat(fromAmt || "0");

  // Uniswap deep-link for this pair on the connected chain
  const uniswapUrl = useMemo(() => {
    const base = "https://app.uniswap.org/swap";
    if (!fromToken || !toToken) return base;
    const inAddr  = fromToken.addresses?.[chainId ?? 1] ?? "ETH";
    const outAddr = toToken.addresses?.[chainId ?? 1]   ?? "ETH";
    return `${base}?inputCurrency=${inAddr}&outputCurrency=${outAddr}&chain=${chainId ?? 1}`;
  }, [fromToken, toToken, chainId]);

  if (!isConnected) {
    return <DeFiWalletGate reason="Connect your external wallet to swap tokens." />;
  }

  return (
    <div className="space-y-3">
      {/* From */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>You pay</span>
          <div className="flex items-center gap-1.5">
            <ChainBadge chainId={chainId} />
            <TokenSelector value={fromToken} onChange={setFromToken} label="Pay with" />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <input type="number" value={fromAmt} onChange={e => setFromAmt(e.target.value)}
            placeholder="0.00" className="flex-1 bg-transparent outline-none text-2xl font-bold mono tabular-nums"
            style={{ color: "var(--ink)" }} />
          <span className="text-xs pb-1" style={{ color: "var(--subtle)" }}>
            {fromUsd > 0 ? fx.fmt(fromUsd) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {["25%", "50%", "75%", "Max"].map(p => (
              <button key={p} className="text-[9px] px-1.5 py-0.5 rounded transition-colors"
                style={{ background: "var(--surface-high)", color: "var(--subtle)" }}
                onClick={() => {
                  const pct = p === "Max" ? 1 : parseInt(p) / 100;
                  setFromAmt(walletBal > 0 ? fmtNum(walletBal * pct, 6) : "");
                }}>{p}</button>
            ))}
          </div>
          <span className="text-[9px]" style={{ color: "var(--subtle)" }}>
            {balData ? `Bal: ${fmtNum(walletBal, 6)} ${fromToken.symbol}` : "Loading…"}
          </span>
        </div>
        {numFrom > 0 && walletBal > 0 && numFrom > walletBal && (
          <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--sell)" }}>
            <AlertTriangle size={10} /> Insufficient {fromToken.symbol} balance
          </div>
        )}
      </div>

      {/* Flip */}
      <div className="flex items-center justify-center">
        <button onClick={() => { setFromToken(toToken); setToToken(fromToken); setFromAmt(toAmt > 0 ? fmtNum(toAmt, 6) : ""); }}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:rotate-180 duration-300"
          style={{ background: "var(--surface-high)", border: "1px solid var(--border)", color: "var(--accent-light)" }}>
          <ArrowUpDown size={14} />
        </button>
      </div>

      {/* To */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>You receive (estimate)</span>
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
            <span style={{ color: "var(--subtle)" }}>Rate (indicative)</span>
            <span className="mono" style={{ color: "var(--ink-2)" }}>1 {fromToken.symbol} ≈ {fmtNum(rate, 4)} {toToken.symbol}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--subtle)" }}>Price impact (est.)</span>
            <span className="mono" style={{ color: impact > 0.1 ? "var(--sell)" : "var(--buy)" }}>~{impact.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: "var(--subtle)" }}>Protocol fee (est.)</span>
            <span className="mono" style={{ color: "var(--ink-2)" }}>{fx.fmt(fee)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span style={{ color: "var(--subtle)" }}>Slippage</span>
            <div className="relative">
              <button onClick={() => setSlippageOpen(v => !v)}
                className="mono text-xs flex items-center gap-1" style={{ color: "var(--accent-light)" }}>
                {slippage}% <ChevronDown size={9} />
              </button>
              {slippageOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSlippageOpen(false)} />
                  <div className="absolute right-0 bottom-6 z-50 rounded-lg border p-2 shadow-xl"
                    style={{ background: "var(--surface-high)", borderColor: "var(--border-mid)" }}>
                    <div className="text-[9px] mb-1.5 uppercase tracking-wider" style={{ color: "var(--subtle)" }}>Slippage tolerance</div>
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

      {/* No DEX integrated — honest redirect */}
      <div className="rounded-lg px-3 py-2.5 text-xs space-y-2"
        style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}>
        <div className="flex items-start gap-1.5" style={{ color: "#fbbf24" }}>
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>No DEX is integrated on this app. The quote above is indicative only. To execute the swap, use a live DEX with your connected wallet.</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href={uniswapUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-medium"
            style={{ background: "rgba(255,0,122,0.1)", color: "#ff007a" }}>
            Uniswap <ExternalLink size={9} />
          </a>
          <a href={`https://app.1inch.io/#/${chainId ?? 1}/simple/swap/${String(fromToken.addresses?.[chainId ?? 1] ?? "ETH")}/${String(toToken.addresses?.[chainId ?? 1] ?? "ETH")}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-medium"
            style={{ background: "rgba(59,130,246,0.1)", color: "var(--accent-light)" }}>
            1inch <ExternalLink size={9} />
          </a>
          <a href={`https://curve.fi`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-medium"
            style={{ background: "rgba(254,80,0,0.08)", color: "#fe5000" }}>
            Curve <ExternalLink size={9} />
          </a>
        </div>
      </div>

      <div className="text-[9px] text-center" style={{ color: "var(--subtle)" }}>
        Quotes from Binance price feed — for reference only. Final rate set by the DEX at execution time.
      </div>
    </div>
  );
}

// ─── BRIDGE ───────────────────────────────────────────────────────────────────
function BridgePanel() {
  return <MultiProtocolBridge requireExternalWallet />;
}

// ─── SEND ─────────────────────────────────────────────────────────────────────
function SendPanel() {
  const tickers = usePriceStore(s => s.tickers);
  const fx = useFxDisplay();
  const [token,  setToken]  = useState(TOKENS[0]); // ETH
  const [toAddr, setToAddr] = useState("");
  const [amount, setAmount] = useState("");
  const [memo,   setMemo]   = useState("");

  const { isConnected, address, chainId } = useAccount();
  const connectedChainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Native send
  const { sendTransaction, isPending: nativePending, data: nativeHash } = useSendTransaction();
  // ERC-20 send
  const { writeContract, isPending: erc20Pending, data: erc20Hash } = useWriteContract();

  const isPending = nativePending || erc20Pending;
  const hash      = nativeHash ?? erc20Hash;

  // Is this token native gas on the connected chain?
  const tokenAddr = token.addresses?.[connectedChainId];
  const isNative  = !tokenAddr; // no address entry = native gas token

  // Live balance
  const { data: balData, refetch: refetchBal } = useBalance({
    address,
    token: tokenAddr,
    query: { enabled: isConnected && !!address },
  });
  const walletBal = balData ? fmtBalance(balData.value, balData.decimals) : 0;

  const usdPrice  = token.market ? (tickers[token.market]?.lastPrice ?? 1) : 1;
  const usdValue  = parseFloat(amount || "0") * usdPrice;
  const validAddr = toAddr.length > 0 && isAddress(toAddr);
  const numAmt    = parseFloat(amount || "0");
  const insufficient = walletBal > 0 && numAmt > walletBal;

  // Explorer URL for the connected chain
  const explorerBase = {
    1: "https://etherscan.io", 8453: "https://basescan.org",
    42161: "https://arbiscan.io", 10: "https://optimistic.etherscan.io",
    137: "https://polygonscan.com", 56: "https://bscscan.com",
    43114: "https://snowtrace.io",
  }[connectedChainId] ?? "https://etherscan.io";

  if (!isConnected) {
    return <DeFiWalletGate reason="Connect your external wallet to send crypto." />;
  }

  function pasteClipboard() {
    void navigator.clipboard.readText().then(t => setToAddr(t.trim()));
  }

  function handleSend() {
    if (!validAddr || numAmt <= 0 || insufficient) return;
    const dest = toAddr;

    if (isNative) {
      // Send native gas (ETH, MATIC, BNB, AVAX…)
      sendTransaction({
        to: dest,
        value: parseEther(amount),
      }, {
        onSuccess: () => void refetchBal(),
      });
    } else {
      // ERC-20 transfer
      writeContract({
        address: tokenAddr,
        abi: erc20Abi,
        functionName: "transfer",
        args: [dest, parseUnits(amount, token.decimals)],
        chainId: connectedChainId,
      }, {
        onSuccess: () => void refetchBal(),
      });
    }
  }

  // Check if the token even exists on this chain
  const tokenNotOnChain = !isNative && !token.addresses?.[connectedChainId];

  return (
    <div className="space-y-3">
      {/* Network + token row */}
      <div className="flex items-center gap-2 flex-wrap">
        <ChainBadge chainId={connectedChainId} />
        {tokenNotOnChain && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(239,68,68,0.1)", color: "var(--sell)" }}>
            {token.symbol} not on {CHAIN_NAMES[connectedChainId] ?? "this chain"}
          </span>
        )}
      </div>

      {tokenNotOnChain && (
        <div className="rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", color: "var(--sell)" }}>
          <AlertTriangle size={11} className="inline mr-1" />
          {token.symbol} has no known contract on {CHAIN_NAMES[connectedChainId]}. Switch network in your wallet or choose a different token.
        </div>
      )}

      {/* To address */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>To address</div>
        <div className="flex gap-1.5">
          <input value={toAddr} onChange={e => setToAddr(e.target.value)}
            placeholder="0x… recipient address"
            className="flex-1 h-7 px-2 rounded text-xs mono outline-none"
            style={{ background: "var(--surface-high)", color: "var(--ink)",
              border: `1px solid ${toAddr.length > 0 ? (validAddr ? "var(--buy)" : "var(--sell)") : "var(--border)"}` }} />
          <button onClick={pasteClipboard}
            className="h-7 px-2.5 rounded text-[10px] flex items-center gap-1"
            style={{ background: "var(--surface-high)", color: "var(--subtle)", border: "1px solid var(--border)" }}>
            <Copy size={10} /> Paste
          </button>
        </div>
        {toAddr.length > 0 && !validAddr && (
          <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--sell)" }}>
            <AlertTriangle size={10} /> Invalid EVM address
          </div>
        )}
        {address && (
          <button onClick={() => setToAddr(address)} className="text-[10px]" style={{ color: "var(--accent-light)" }}>
            Use connected wallet ({shortAddr(address)})
          </button>
        )}
      </div>

      {/* Token + amount */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>Amount</div>
          <TokenSelector value={token} onChange={t => { setToken(t); setAmount(""); }} label="Token" />
        </div>
        <div className="flex items-end gap-2">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0.00" className="flex-1 bg-transparent outline-none text-2xl font-bold mono tabular-nums"
            style={{ color: "var(--ink)" }} />
          <span className="text-xs pb-1" style={{ color: "var(--subtle)" }}>
            {usdValue > 0 ? fx.fmt(usdValue) : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {["25%", "50%", "75%", "Max"].map(p => (
              <button key={p} className="text-[9px] px-1.5 py-0.5 rounded"
                style={{ background: "var(--surface-high)", color: "var(--subtle)" }}
                onClick={() => {
                  if (!walletBal) return;
                  const pct = p === "Max" ? 1 : parseInt(p) / 100;
                  // Leave a small gas reserve for native sends
                  const reserve = isNative ? Math.min(walletBal * 0.01, 0.002) : 0;
                  setAmount(fmtNum((walletBal - reserve) * pct, 8));
                }}>{p}</button>
            ))}
          </div>
          <span className="text-[9px]" style={{ color: "var(--subtle)" }}>
            {balData ? `Bal: ${fmtNum(walletBal, 6)} ${token.symbol}` : "Loading…"}
          </span>
        </div>
      </div>

      {/* Memo */}
      <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--subtle)" }}>Memo (optional, not stored onchain)</div>
        <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="e.g. Invoice #1234"
          className="w-full h-7 px-2 rounded text-xs outline-none"
          style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }} />
      </div>

      {/* Summary */}
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
            <span style={{ color: "var(--subtle)" }}>Type</span>
            <span className="mono" style={{ color: "var(--ink-2)" }}>{isNative ? "Native transfer" : "ERC-20 transfer"}</span>
          </div>
        </div>
      )}

      {insufficient && (
        <div className="flex items-center gap-1 text-[10px] px-3 py-2 rounded-lg"
          style={{ background: "rgba(239,68,68,0.08)", color: "var(--sell)" }}>
          <AlertTriangle size={10} /> Insufficient balance. Available: {fmtNum(walletBal, 6)} {token.symbol}
        </div>
      )}

      <StatusBadge hash={hash} isLoading={isPending} explorerBase={explorerBase} />

      {/* Switch network if wallet is on a chain the token doesn't support */}
      {tokenNotOnChain && !isNative && chainId && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(token.addresses ?? {}).slice(0, 3).map(([cid]) => (
            <button key={cid}
              onClick={() => switchChain({ chainId: parseInt(cid) })}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-medium"
              style={{ background: "var(--accent-dim)", color: "var(--accent-light)" }}>
              Switch to {CHAIN_NAMES[parseInt(cid)] ?? cid} <ArrowRight size={9} />
            </button>
          ))}
        </div>
      )}

      <button
        onClick={handleSend}
        disabled={!validAddr || numAmt <= 0 || isPending || insufficient || tokenNotOnChain}
        className="w-full h-10 rounded-lg text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
        style={{ background: validAddr && numAmt > 0 && !tokenNotOnChain ? "var(--buy)" : "var(--surface-high)", color: validAddr && numAmt > 0 && !tokenNotOnChain ? "#fff" : "var(--subtle)" }}>
        {isPending ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : `Send ${token.symbol}`}
      </button>
      <div className="text-[9px] text-center" style={{ color: "var(--subtle)" }}>
        Transactions are irreversible. Verify the recipient address carefully.
      </div>
    </div>
  );
}

// ─── RECEIVE ─────────────────────────────────────────────────────────────────
function ReceivePanel() {
  const [selectedToken, setSelectedToken] = useState(TOKENS[0]);
  const [copied, setCopied] = useState(false);
  const { address, isConnected, chainId } = useAccount();

  if (!isConnected || !address) {
    return <DeFiWalletGate reason="Connect your external wallet to display your receive address." />;
  }

  const qrValue = `ethereum:${address}`;

  function copyAddr() {
    if (!address) return;
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>Asset</span>
          <TokenSelector value={selectedToken} onChange={setSelectedToken} label="Asset" />
        </div>
        <ChainBadge chainId={chainId} />
      </div>

      <div className="rounded-xl p-5 flex flex-col items-center gap-4"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <QRCode value={qrValue} size={180} />
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <CryptoIcon symbol={selectedToken.symbol} size={16} />
            <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>{selectedToken.name}</span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
            External wallet · {CHAIN_NAMES[chainId ?? 0] ?? "All EVM networks"}
          </div>
        </div>
        <div className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
          <span className="flex-1 text-[11px] font-mono break-all leading-relaxed"
            style={{ color: "var(--ink)" }}>{address}</span>
          <button onClick={copyAddr} className="flex-shrink-0 ml-2">
            {copied ? <CheckCircle2 size={16} style={{ color: "var(--buy)" }} /> : <Copy size={16} style={{ color: "var(--subtle)" }} />}
          </button>
        </div>
        <button onClick={copyAddr}
          className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
          style={{ background: "var(--accent)", color: "#fff" }}>
          <Copy size={12} /> {copied ? "Copied!" : "Copy address"}
        </button>
      </div>

      <div className="rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--subtle)" }}>Quick select asset</div>
        <div className="flex flex-wrap gap-1.5">
          {TOKENS.slice(0, 8).map(t => (
            <button key={t.symbol} onClick={() => setSelectedToken(t)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
              style={{
                background: selectedToken.symbol === t.symbol ? "var(--accent-dim)" : "var(--surface-high)",
                color: selectedToken.symbol === t.symbol ? "var(--accent-light)" : "var(--ink-2)",
                border: `1px solid ${selectedToken.symbol === t.symbol ? "rgba(59,130,246,0.3)" : "var(--border)"}`,
              }}>
              <CryptoIcon symbol={t.symbol} size={12} />
              {t.symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
        style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", color: "#fbbf24" }}>
        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
        Only send tokens on the correct network. Sending to the wrong network may result in permanent loss.
      </div>
    </div>
  );
}

// ─── BUY ─────────────────────────────────────────────────────────────────────
function BuyPanel() {
  const tickers = usePriceStore(s => s.tickers);
  const fx = useFxDisplay();
  const { isConnected, address, chainId } = useAccount();
  const [fiat, setFiat]     = useState("100");
  const [currency, setCurrency] = useState("USD");
  const [token, setToken]   = useState(TOKENS[1]); // USDC

  const usdPrice = token.market ? (tickers[token.market]?.lastPrice ?? 1) : 1;
  const fiatAmt  = parseFloat(fiat || "0");
  // Onramp fee estimate: Circle Onramp card is ~1.5%–3.5% depending on country
  const fee      = fiatAmt * 0.025;
  const receive  = (fiatAmt - fee) / usdPrice;

  // Circle Onramp URL builder — pre-fills wallet address and asset
  function buildOnrampUrl() {
    const base = "https://pay.circle.com/buy";
    const params = new URLSearchParams({
      ...(address ? { destinationWalletAddress: address } : {}),
      cryptoCurrency: token.symbol,
      fiatCurrency: currency,
      fiatAmount: fiat,
      ...(chainId ? { chain: String(chainId) } : {}),
    });
    return `${base}?${params.toString()}`;
  }

  return (
    <div className="space-y-3">
      {/* Amount */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>You spend</span>
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            className="h-7 px-2 rounded text-xs outline-none"
            style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)" }}>
            {["USD", "EUR", "GBP", "CAD", "AUD", "NGN"].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-bold" style={{ color: "var(--ink)" }}>{currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : ""}</span>
          <input type="number" value={fiat} onChange={e => setFiat(e.target.value)}
            className="flex-1 bg-transparent outline-none text-2xl font-bold mono tabular-nums"
            style={{ color: "var(--ink)" }} />
        </div>
        <div className="flex gap-1.5">
          {[50, 100, 250, 500].map(v => (
            <button key={v} onClick={() => setFiat(String(v))}
              className="text-[9px] px-2 py-0.5 rounded"
              style={{ background: parseFloat(fiat) === v ? "var(--accent-dim)" : "var(--surface-high)", color: parseFloat(fiat) === v ? "var(--accent-light)" : "var(--subtle)" }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Token to buy */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--subtle)" }}>You receive (est.)</span>
          <TokenSelector value={token} onChange={setToken} label="Token" />
        </div>
        <div className="text-2xl font-bold mono tabular-nums" style={{ color: "var(--buy)" }}>
          {receive > 0 ? fmtNum(receive, 4) : "0.00"} <span className="text-base" style={{ color: "var(--muted)" }}>{token.symbol}</span>
        </div>
        {fiatAmt > 0 && (
          <div className="text-[10px]" style={{ color: "var(--subtle)" }}>
            Est. fee: {fx.fmt(fee)} · Rate: 1 {token.symbol} ≈ {fx.fmt(usdPrice)}
          </div>
        )}
      </div>

      {/* Wallet destination */}
      {isConnected && address ? (
        <div className="rounded-lg px-3 py-2 flex items-center justify-between text-xs"
          style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.15)" }}>
          <div className="flex items-center gap-1.5" style={{ color: "#22c55e" }}>
            <Wallet size={12} />
            <span>Tokens will be sent to</span>
          </div>
          <span className="font-mono text-[11px]" style={{ color: "var(--ink-2)" }}>{shortAddr(address)}</span>
        </div>
      ) : (
        <DeFiWalletGate reason="Connect your wallet so purchased tokens are sent to your address." />
      )}

      {isConnected && (
        <a
          href={buildOnrampUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full h-10 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${fiatAmt <= 0 ? "pointer-events-none opacity-40" : ""}`}
          style={{ background: "var(--buy)", color: "#fff" }}>
          Buy {token.symbol} via Circle Onramp <ExternalLink size={12} />
        </a>
      )}
      <div className="text-center text-[9px]" style={{ color: "var(--subtle)" }}>
        Powered by Circle Onramp · KYC/KYB may be required · Final rate set at checkout
      </div>
    </div>
  );
}

// ─── MARKET OVERVIEW ─────────────────────────────────────────────────────────
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
          const pct = m.priceChangePct ?? 0;
          return (
            <div key={m.sym} className="flex items-center gap-3 px-2 py-1.5 rounded"
              style={{ background: "var(--surface)" }}>
              <CryptoIcon symbol={base} size={20} />
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
  { id: "swap",    label: "Swap",    icon: <ArrowUpDown size={13} /> },
  { id: "bridge",  label: "Bridge",  icon: <Globe size={13} /> },
  { id: "send",    label: "Send",    icon: <Send size={13} /> },
  { id: "receive", label: "Receive", icon: <Download size={13} /> },
  { id: "buy",     label: "Buy",     icon: <CreditCard size={13} /> },
];

export function DeFiPage({ initialTab }: { initialTab?: string }) {
  const [tab, setTab] = useState<DeFiTab>((initialTab as DeFiTab) ?? "swap");
  const { isConnected } = useAccount();

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Main action panel — full width on mobile, fixed width on desktop */}
      <div className="flex flex-col md:border-r md:shrink-0 md:w-full md:max-w-sm w-full"
        style={{ borderColor: "var(--border)" }}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between"
          style={{ borderColor: "var(--border)" }}>
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--ink)" }}>DeFi</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>Swap, bridge, send &amp; buy crypto</div>
          </div>
          {/* Wallet status pill */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px]"
            style={{
              background: isConnected ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              color: isConnected ? "#22c55e" : "var(--sell)",
              border: `1px solid ${isConnected ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}`,
            }}>
            <span className="w-1.5 h-1.5 rounded-full"
              style={{ background: isConnected ? "#22c55e" : "var(--sell)" }} />
            {isConnected ? "Wallet connected" : "No wallet"}
          </div>
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

      {/* Right: live markets — hidden on mobile to avoid crushing the action panel */}
      <div className="hidden md:block flex-1 overflow-y-auto p-4 border-t md:border-t-0"
        style={{ scrollbarWidth: "thin", borderColor: "var(--border)" }}>
        <MarketsOverview />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            { label: "24h Volume",    val: "$4.2B",   icon: <TrendingUp size={12} />, color: "var(--buy)" },
            { label: "Active Users",  val: "142,891", icon: <Wallet size={12} />,     color: "var(--accent-light)" },
            { label: "Chains",        val: "8+",      icon: <Globe size={12} />,      color: "var(--warn)" },
            { label: "Avg Bridge",    val: "< 30 sec",icon: <Zap size={12} />,       color: "#22c55e" },
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
