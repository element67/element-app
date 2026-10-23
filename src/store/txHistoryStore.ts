/**
 * Transaction history store — persists to localStorage.
 * Records every send/receive/swap/bridge the user initiates.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TxType = "send" | "receive" | "swap" | "bridge" | "internal";
export type TxStatus = "pending" | "confirmed" | "failed";

export interface TxRecord {
  id:         string;       // unique ID (timestamp + random)
  type:       TxType;
  status:     TxStatus;
  timestamp:  number;       // ms since epoch

  // Asset details
  symbol:     string;
  network:    string;
  amount:     string;       // human-readable (e.g. "0.05")
  usdValue?:  number;

  // For sends
  toAddress?: string;
  txHash?:    string;
  explorerUrl?: string;
  fee?:       string;

  // For swaps
  fromSymbol?: string;
  toSymbol?:   string;
  fromAmount?: string;
  toAmount?:   string;

  // For bridge
  fromNetwork?: string;
  toNetwork?:   string;

  note?: string;
}

interface TxHistoryState {
  txs: TxRecord[];
  addTx: (tx: Omit<TxRecord, "id" | "timestamp">) => TxRecord;
  updateTx: (id: string, updates: Partial<TxRecord>) => void;
  clearHistory: () => void;
}

export const useTxHistory = create<TxHistoryState>()(
  persist(
    (set, get) => ({
      txs: [],

      addTx(partial) {
        const tx: TxRecord = {
          ...partial,
          id:        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
        };
        set(s => ({ txs: [tx, ...s.txs].slice(0, 200) })); // cap at 200 entries
        return tx;
      },

      updateTx(id, updates) {
        set(s => ({
          txs: s.txs.map(tx => tx.id === id ? { ...tx, ...updates } : tx),
        }));
      },

      clearHistory() {
        set({ txs: [] });
      },
    }),
    {
      name: "rushpay-tx-history",
      version: 1,
    }
  )
);

/** Convenience: get txs for a specific symbol/network */
export function txsForAsset(txs: TxRecord[], symbol: string, network?: string): TxRecord[] {
  return txs.filter(tx =>
    (tx.symbol === symbol || tx.fromSymbol === symbol || tx.toSymbol === symbol) &&
    (!network || tx.network === network || tx.fromNetwork === network || tx.toNetwork === network)
  );
}

/** Format amount with sign for display */
export function txAmountDisplay(tx: TxRecord): string {
  const sign = tx.type === "receive" ? "+" : tx.type === "send" ? "−" : "";
  return `${sign}${tx.amount} ${tx.symbol}`;
}
