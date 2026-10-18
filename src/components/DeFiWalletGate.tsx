/**
 * DeFiWalletGate — shown inside DeFi panels that need an external wallet.
 *
 * Rules:
 *  - Never blocks app access; only wraps individual DeFi operations.
 *  - User can dismiss and use native wallet fallback where available.
 *  - Does NOT auto-connect or auto-authorize any transaction.
 */
import { ConnectKitButton } from "connectkit";
import { Wallet, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

interface DeFiWalletGateProps {
  /** One-line description of what this wallet connection enables */
  reason: string;
  /** Optional: show a "use app wallet instead" dismiss option */
  onUseAppWallet?: () => void;
  /** Label for the dismiss button */
  dismissLabel?: string;
}

export function DeFiWalletGate({
  reason,
  onUseAppWallet,
  dismissLabel = "Use app wallet instead",
}: DeFiWalletGateProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed && onUseAppWallet) return null;

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "rgba(59,130,246,0.07)",
        border: "1px solid rgba(59,130,246,0.25)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex items-center justify-center shrink-0 rounded-lg"
          style={{ width: 36, height: 36, background: "rgba(59,130,246,0.15)" }}
        >
          <Wallet size={18} style={{ color: "#60a5fa" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
            External wallet required
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--ink-dim)" }}>
            {reason}
          </div>
        </div>
        {onUseAppWallet && (
          <button
            onClick={() => { setDismissed(true); onUseAppWallet(); }}
            className="shrink-0 p-1 rounded hover:bg-white/5 transition-colors"
            title={dismissLabel}
          >
            <X size={14} style={{ color: "var(--subtle)" }} />
          </button>
        )}
      </div>

      {/* Security note */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
        style={{ background: "rgba(34,197,94,0.07)", color: "#4ade80" }}
      >
        <ShieldCheck size={13} />
        Connecting only grants read access to your address. No transaction will
        be submitted without your explicit approval.
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div style={{ transform: "scale(0.9)", transformOrigin: "left center" }}>
          <ConnectKitButton />
        </div>
        {onUseAppWallet && (
          <button
            onClick={() => { setDismissed(true); onUseAppWallet(); }}
            className="text-xs underline underline-offset-2"
            style={{ color: "var(--subtle)" }}
          >
            {dismissLabel}
          </button>
        )}
      </div>
    </div>
  );
}
