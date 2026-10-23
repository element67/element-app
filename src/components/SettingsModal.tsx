import { useState, useEffect } from "react";
import { X, Sun, Moon, Globe, Bell, Sliders, ShieldCheck, Keyboard, Zap, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { CurrencySwitcher } from "@/components/CurrencySwitcher";

interface Props { onClose: () => void; }

const SECTIONS = [
  { key: "appearance",    label: "Appearance",    icon: Sun },
  { key: "currency",      label: "Currency",      icon: DollarSign },
  { key: "defi",         label: "DeFi",          icon: Sliders },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "language",     label: "Language",       icon: Globe },
  { key: "security",     label: "Security",       icon: ShieldCheck },
  { key: "shortcuts",    label: "Shortcuts",      icon: Keyboard },
  { key: "nanopay",      label: "Nanopayments",   icon: Zap },
] as const;
type Section = typeof SECTIONS[number]["key"];

type FontSize = "small" | "default" | "large";
const FONT_SIZE_MAP: Record<FontSize, string> = { small: "14px", default: "16px", large: "18px" };

function getTheme(): "dark" | "light" {
  return (localStorage.getItem("app-theme") as "dark" | "light") ?? "light";
}
function applyTheme(t: "dark" | "light") {
  localStorage.setItem("app-theme", t);
  document.documentElement.setAttribute("data-theme", t);
}
function getFontSize(): FontSize {
  return (localStorage.getItem("app-font-size") as FontSize) ?? "default";
}
function applyFontSize(s: FontSize) {
  localStorage.setItem("app-font-size", s);
  document.documentElement.style.fontSize = FONT_SIZE_MAP[s];
}

export function SettingsModal({ onClose }: Props) {
  const [theme, setThemeState] = useState<"dark"|"light">(getTheme);
  const [fontSize, setFontSizeState] = useState<FontSize>(getFontSize);
  const [section, setSection] = useState<Section>("appearance");

  // DeFi prefs
  const [slippageTol, setSlippageTol] = useState("0.5");
  const [confirmTx, setConfirmTx] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [gasMode, setGasMode] = useState<"fast"|"standard"|"slow">("standard");

  // Notifications
  const [notifTx, setNotifTx] = useState(true);
  const [notifPriceAlert, setNotifPriceAlert] = useState(true);
  const [notifP2P, setNotifP2P] = useState(true);
  const [notifSignals, setNotifSignals] = useState(false);

  // Security
  const [autoLock, setAutoLock] = useState("1 hour");
  const [requireSig, setRequireSig] = useState(true);

  function setTheme(t: "dark"|"light") {
    setThemeState(t);
    applyTheme(t);
  }
  function setFontSize(s: FontSize) {
    setFontSizeState(s);
    applyFontSize(s);
  }

  function save() {
    toast.success("Settings saved");
    onClose();
  }

  useEffect(() => {
    applyTheme(theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[640px] max-w-[95vw] max-h-[85vh] bg-[--bg] border border-[--border] rounded-xl shadow-2xl flex overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-44 shrink-0 border-r border-[--border] bg-[--surface] py-4">
          <div className="px-4 mb-4">
            <span className="font-bold text-[14px]" style={{ color: "var(--ink)" }}>Settings</span>
          </div>
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] font-medium transition-colors text-left"
              style={{
                background: section === key ? "var(--surface-high)" : "transparent",
                color: section === key ? "var(--ink)" : "var(--subtle)",
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
              {SECTIONS.find((s) => s.key === section)?.label}
            </span>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded"
              style={{ color: "var(--subtle)" }}>
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5" style={{ scrollbarWidth: "thin" }}>

            {section === "appearance" && (
              <>
                <div>
                  <label className="text-[11px] uppercase tracking-wide block mb-2" style={{ color: "var(--subtle)" }}>Color Theme</label>
                  <div className="flex gap-2">
                    {(["dark", "light"] as const).map((t) => (
                      <button key={t} onClick={() => setTheme(t)}
                        className="flex items-center gap-2 h-9 px-4 rounded border text-[12px] font-medium transition-colors"
                        style={{
                          borderColor: theme === t ? "var(--accent)" : "var(--border)",
                          background: theme === t ? "rgba(37,99,235,0.1)" : "transparent",
                          color: theme === t ? "var(--accent)" : "var(--subtle)",
                        }}>
                        {t === "dark" ? <Moon size={13} /> : <Sun size={13} />}
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wide block mb-2" style={{ color: "var(--subtle)" }}>Font Size</label>
                  <div className="flex gap-2">
                    {(["small", "default", "large"] as FontSize[]).map((s) => (
                      <button key={s} onClick={() => setFontSize(s)}
                        className="h-8 px-3 rounded border text-[11px] transition-colors capitalize"
                        style={{
                          borderColor: fontSize === s ? "var(--accent)" : "var(--border)",
                          background: fontSize === s ? "rgba(37,99,235,0.1)" : "transparent",
                          color: fontSize === s ? "var(--accent)" : "var(--subtle)",
                        }}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {section === "currency" && (
              <div className="space-y-4">
                <p className="text-[11px]" style={{ color:"var(--subtle)" }}>
                  Your portfolio value, asset prices, and transaction amounts are displayed in your chosen local currency.
                  The underlying asset balances are unchanged — conversion is for display only and uses live FX rates.
                </p>
                <CurrencySwitcher variant="inline" />
                <div className="p-3 rounded text-[11px]"
                  style={{ border:"1px solid rgba(59,130,246,0.2)", background:"rgba(59,130,246,0.05)", color:"var(--subtle)" }}>
                  Exchange rates from open.er-api.com — updated every 5 minutes. Converted values are estimates
                  and are not real balances or completed transactions.
                </div>
              </div>
            )}

            {section === "defi" && (
              <>
                <SettingRow label="Transaction Confirmation" desc="Show confirmation dialog before executing DeFi actions">
                  <Toggle value={confirmTx} onChange={setConfirmTx} />
                </SettingRow>
                <SettingRow label="Sound Effects" desc="Play sounds on swap and transfer confirmation">
                  <Toggle value={soundOn} onChange={setSoundOn} />
                </SettingRow>
                <SettingRow label="Slippage Tolerance" desc="Max acceptable slippage for swaps (%)">
                  <div className="flex items-center gap-1">
                    <input type="number" value={slippageTol} onChange={(e) => setSlippageTol(e.target.value)}
                      className="w-16 rounded px-2 py-1 text-[11px] mono outline-none"
                      style={{ background: "var(--surface-high)", border: "1px solid var(--border)", color: "var(--ink)" }} />
                    <span className="text-[11px]" style={{ color: "var(--subtle)" }}>%</span>
                  </div>
                </SettingRow>
                <SettingRow label="Gas Mode" desc="Speed preference for on-chain transactions">
                  <select value={gasMode} onChange={e => setGasMode(e.target.value as typeof gasMode)}
                    className="rounded px-2 py-1 text-[11px] outline-none"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" }}>
                    <option value="slow">Slow (cheap)</option>
                    <option value="standard">Standard</option>
                    <option value="fast">Fast</option>
                  </select>
                </SettingRow>
              </>
            )}

            {section === "notifications" && (
              <>
                <SettingRow label="Transaction Alerts" desc="Notify on swap, send, and deposit completions">
                  <Toggle value={notifTx} onChange={setNotifTx} />
                </SettingRow>
                <SettingRow label="Price Alerts" desc="Alert when watched assets hit target prices">
                  <Toggle value={notifPriceAlert} onChange={setNotifPriceAlert} />
                </SettingRow>
                <SettingRow label="P2P Trade Updates" desc="Notify on P2P offer matches and confirmations">
                  <Toggle value={notifP2P} onChange={setNotifP2P} />
                </SettingRow>
                <SettingRow label="AI Signals" desc="Notify when Element generates a high-confidence signal">
                  <Toggle value={notifSignals} onChange={setNotifSignals} />
                </SettingRow>
              </>
            )}

            {section === "language" && (
              <div className="grid grid-cols-2 gap-2">
                {[
                  { code: "EN", name: "English" },
                  { code: "ZH", name: "中文 (Chinese)" },
                  { code: "JA", name: "日本語 (Japanese)" },
                  { code: "KO", name: "한국어 (Korean)" },
                  { code: "ES", name: "Español" },
                  { code: "FR", name: "Français" },
                  { code: "PT", name: "Português" },
                  { code: "AR", name: "العربية" },
                ].map(({ code, name }) => (
                  <button key={code}
                    onClick={() => toast.info(`Language set to ${name}`)}
                    className="flex items-center gap-2 h-10 px-3 rounded border text-[12px] transition-colors"
                    style={{
                      borderColor: code === "EN" ? "var(--accent)" : "var(--border)",
                      background: code === "EN" ? "rgba(37,99,235,0.08)" : "transparent",
                      color: code === "EN" ? "var(--accent)" : "var(--subtle)",
                    }}>
                    <span className="text-[11px] font-bold w-6">{code}</span>
                    {name}
                  </button>
                ))}
              </div>
            )}

            {section === "security" && (
              <>
                <SettingRow label="Auto-lock Wallet" desc="Disconnect after inactivity period">
                  <select value={autoLock} onChange={e => setAutoLock(e.target.value)}
                    className="rounded px-2 py-1 text-[11px] outline-none"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink)" }}>
                    {["Never","15 minutes","1 hour","4 hours","8 hours"].map(o => <option key={o}>{o}</option>)}
                  </select>
                </SettingRow>
                <SettingRow label="Require Signature" desc="Require wallet signature for every transaction">
                  <Toggle value={requireSig} onChange={setRequireSig} />
                </SettingRow>
                <div className="p-3 rounded text-[11px]"
                  style={{ border: "1px solid rgba(251,191,36,0.2)", background: "rgba(251,191,36,0.05)", color: "#fbbf24" }}>
                  Always verify contract addresses and amounts before signing any transaction.
                </div>
              </>
            )}

            {section === "shortcuts" && (
              <div className="space-y-2">
                {[
                  ["Open DeFi / Swap",    "D"],
                  ["Open Wallet",         "W"],
                  ["Open AI Agent",       "A"],
                  ["Open P2P",            "P"],
                  ["Toggle Settings",     "S"],
                  ["Toggle Balance Hide", "H"],
                  ["Go to Home",          "⌘1"],
                ].map(([action, key]) => (
                  <div key={action} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                    <span className="text-[12px]" style={{ color: "var(--subtle)" }}>{action}</span>
                    <kbd className="px-2 py-0.5 rounded text-[11px] mono"
                      style={{ background: "var(--surface-high)", border: "1px solid var(--border)", color: "var(--ink)" }}>
                      {key}
                    </kbd>
                  </div>
                ))}
              </div>
            )}

            {section === "nanopay" && (
              <div className="space-y-4 text-[12px]">
                <div className="p-4 rounded-xl" style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={16} style={{ color: "#a78bfa" }} />
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>Circle Nanopayments (x402)</span>
                  </div>
                  <p className="text-[11px] mb-3" style={{ color: "var(--subtle)" }}>
                    Enable micropayments for premium features: AI signals, priority swap routes, and P2P boosts.
                    Payments are USDC on Arc Testnet via Circle Gateway.
                  </p>
                  <div className="space-y-2">
                    {[
                      { label: "AI Premium Signal",  price: "$0.01 USDC", desc: "High-confidence market analysis" },
                      { label: "Swap Fee",            price: "$0.05 USDC", desc: "Executes via DeFi liquidity" },
                      { label: "P2P Order Fee",       price: "$0.02 USDC", desc: "Order creation & matching" },
                      { label: "Priority Transfer",   price: "$0.03 USDC", desc: "Fast settlement lane" },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between py-1.5"
                        style={{ borderBottom: "1px solid var(--border)" }}>
                        <div>
                          <div style={{ color: "var(--ink)" }}>{item.label}</div>
                          <div className="text-[10px]" style={{ color: "var(--subtle)" }}>{item.desc}</div>
                        </div>
                        <span className="font-bold mono" style={{ color: "var(--buy)" }}>{item.price}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[10px]" style={{ color: "var(--subtle)" }}>
                    To enable live payments, set <code className="mono px-1 rounded" style={{ background: "var(--surface)" }}>VITE_NANOPAY_SELLER</code> in your .env file.
                  </div>
                </div>
              </div>
            )}

          </div>

          <div className="px-5 py-3 flex justify-end gap-2 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <button onClick={onClose}
              className="h-8 px-4 rounded border text-[11px] transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--subtle)" }}>
              Cancel
            </button>
            <button onClick={save}
              className="h-8 px-4 rounded text-[11px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)", color: "#fff" }}>
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className="w-10 h-5 rounded-full relative transition-colors"
      style={{ background: value ? "var(--accent)" : "var(--surface-high)" }}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}

function SettingRow({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <div>
        <div className="text-[12px] font-medium" style={{ color: "var(--ink)" }}>{label}</div>
        <div className="text-[10px] mt-0.5" style={{ color: "var(--subtle)" }}>{desc}</div>
      </div>
      {children}
    </div>
  );
}
