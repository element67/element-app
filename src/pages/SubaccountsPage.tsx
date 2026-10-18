import { useState } from "react";
import { useAccount } from "wagmi";
import { Plus, Trash2, ArrowRightLeft, Edit2, Check, X } from "lucide-react";

interface Subaccount {
  id: number;
  name: string;
  balance: number;
  equity: number;
  isActive: boolean;
}

const INITIAL: Subaccount[] = [
  { id: 0, name: "Master Account", balance: 10_000, equity: 10_000, isActive: true },
];

export function SubaccountsPage() {
  const { isConnected } = useAccount();
  const [accounts, setAccounts] = useState<Subaccount[]>(INITIAL);
  const [nextId, setNextId] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [transferFrom, setTransferFrom] = useState(0);
  const [transferTo, setTransferTo] = useState<number | null>(null);
  const [transferAmt, setTransferAmt] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);

  function addAccount() {
    setAccounts(prev => [
      ...prev,
      { id: nextId, name: `Sub Account #${nextId}`, balance: 0, equity: 0, isActive: false },
    ]);
    setNextId(n => n + 1);
  }

  function deleteAccount(id: number) {
    if (id === 0) return;
    setAccounts(prev => prev.filter(a => a.id !== id));
  }

  function setActive(id: number) {
    setAccounts(prev => prev.map(a => ({ ...a, isActive: a.id === id })));
  }

  function startEdit(a: Subaccount) {
    setEditingId(a.id);
    setEditName(a.name);
  }

  function saveEdit(id: number) {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, name: editName } : a));
    setEditingId(null);
  }

  function doTransfer() {
    const amt = parseFloat(transferAmt);
    if (isNaN(amt) || amt <= 0 || transferTo === null) return;
    const from = accounts.find(a => a.id === transferFrom);
    if (!from || from.balance < amt) return;
    setAccounts(prev => prev.map(a => {
      if (a.id === transferFrom) return { ...a, balance: a.balance - amt };
      if (a.id === transferTo)   return { ...a, balance: a.balance + amt };
      return a;
    }));
    setTransferAmt("");
    setShowTransfer(false);
  }

  if (!isConnected) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: "var(--bg)", minHeight: "calc(100vh - 44px)" }}>
        <div className="text-center space-y-2">
          <div className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>Connect wallet to manage subaccounts</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto" style={{ minHeight: "calc(100vh - 44px)", background: "var(--bg)" }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold" style={{ color: "var(--ink)" }}>Subaccounts</div>
          <div className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>Isolate strategies across independent accounts</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTransfer(v => !v)}
            className="h-7 px-3 rounded text-xs font-medium flex items-center gap-1 transition-colors"
            style={{ background: "var(--surface-high)", color: "var(--ink-2)", border: "1px solid var(--border)" }}
          ><ArrowRightLeft size={12} /> Transfer</button>
          <button
            onClick={addAccount}
            className="h-7 px-3 rounded text-xs font-medium flex items-center gap-1 transition-colors"
            style={{ background: "var(--buy)", color: "#fff" }}
          ><Plus size={12} /> Add Account</button>
        </div>
      </div>

      {/* Transfer panel */}
      {showTransfer && (
        <div className="rounded p-3 space-y-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="text-xs font-semibold" style={{ color: "var(--ink-2)" }}>Transfer Between Accounts</div>
          <div className="flex gap-2 items-center">
            <select
              value={transferFrom}
              onChange={e => setTransferFrom(Number(e.target.value))}
              className="flex-1 h-7 px-2 rounded text-xs"
              style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)", outline: "none" }}
            >
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <ArrowRightLeft size={12} style={{ color: "var(--subtle)", flexShrink: 0 }} />
            <select
              value={transferTo ?? ""}
              onChange={e => setTransferTo(Number(e.target.value))}
              className="flex-1 h-7 px-2 rounded text-xs"
              style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)", outline: "none" }}
            >
              <option value="">Select destination</option>
              {accounts.filter(a => a.id !== transferFrom).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={transferAmt}
              onChange={e => setTransferAmt(e.target.value)}
              placeholder="Amount (USDC)"
              className="flex-1 h-7 px-2 rounded text-xs mono"
              style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)", outline: "none" }}
            />
            <button
              onClick={doTransfer}
              className="h-7 px-4 rounded text-xs font-semibold transition-colors"
              style={{ background: "var(--buy)", color: "#fff" }}
            >Transfer</button>
          </div>
        </div>
      )}

      {/* Account list */}
      <div className="space-y-2">
        {accounts.map(account => (
          <div
            key={account.id}
            className="rounded p-3 transition-colors"
            style={{
              background: "var(--surface)",
              border: account.isActive ? "1px solid var(--accent-glow)" : "1px solid var(--border)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: account.isActive ? "var(--accent-dim)" : "var(--surface-high)", color: account.isActive ? "var(--accent)" : "var(--subtle)" }}
              >{account.id === 0 ? "M" : account.id}</div>

              <div className="flex-1 min-w-0">
                {editingId === account.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 h-6 px-2 rounded text-xs"
                      style={{ background: "var(--surface-high)", color: "var(--ink)", border: "1px solid var(--border)", outline: "none" }}
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(account.id); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <button onClick={() => saveEdit(account.id)} style={{ color: "var(--green)" }}><Check size={12} /></button>
                    <button onClick={() => setEditingId(null)} style={{ color: "var(--subtle)" }}><X size={12} /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{account.name}</span>
                    {account.isActive && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
                        style={{ background: "var(--accent-dim)", color: "var(--accent)", fontSize: 9 }}>ACTIVE</span>
                    )}
                  </div>
                )}
                <div className="text-xs mono mt-0.5" style={{ color: "var(--subtle)" }}>
                  Balance: ${account.balance.toLocaleString()} · Equity: ${account.equity.toLocaleString()}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!account.isActive && (
                  <button
                    onClick={() => setActive(account.id)}
                    className="h-6 px-2 rounded text-xs font-medium transition-colors"
                    style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-glow)" }}
                  >Switch</button>
                )}
                <button
                  onClick={() => startEdit(account)}
                  className="w-6 h-6 rounded flex items-center justify-center transition-colors"
                  style={{ color: "var(--subtle)" }}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--ink)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--subtle)"}
                ><Edit2 size={11} /></button>
                {account.id !== 0 && (
                  <button
                    onClick={() => deleteAccount(account.id)}
                    className="w-6 h-6 rounded flex items-center justify-center transition-colors"
                    style={{ color: "var(--subtle)" }}
                    onMouseEnter={e => e.currentTarget.style.color = "var(--red)"}
                    onMouseLeave={e => e.currentTarget.style.color = "var(--subtle)"}
                  ><Trash2 size={11} /></button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
