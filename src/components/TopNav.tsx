import { useState } from "react";
import { Sun, Moon, Globe, Settings, Bell, Menu, X, Bot, MessageCircle, Crown, ArrowLeft } from "lucide-react";
import { ConnectKitButton } from "connectkit";

type Page = "defi" | "p2p" | "portfolio" | "wallet" | "ai" | "subaccounts" | "referrals" | "vault";

interface TopNavProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  activePage: Page;
  onNavigate: (page: Page) => void;
  onBack?: () => void;
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  notifCount: number;
}

const NAV_LINKS: { id: Page; label: string }[] = [
  { id: "wallet",      label: "Wallet" },
  { id: "defi",        label: "DeFi" },
  { id: "p2p",         label: "P2P" },
  { id: "portfolio",   label: "Portfolio" },
  { id: "subaccounts", label: "Subaccounts" },
  { id: "referrals",   label: "Referrals" },
];

// Page labels for the back button
const PAGE_LABELS: Record<string, string> = {
  defi: "DeFi", p2p: "P2P", portfolio: "Portfolio",
  ai: "Element", subaccounts: "Subaccounts", referrals: "Referrals", vault: "Vault",
};

export function TopNav({
  theme, onToggleTheme, activePage, onNavigate, onBack,
  onOpenSettings, onOpenNotifications, notifCount,
}: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen]     = useState(false);
  const [lang, setLang]             = useState("EN");
  const langs = ["EN", "中文"];

  const [greeting] = useState(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning,";
    if (h < 17) return "Good afternoon,";
    return "Good evening,";
  });

  const isWallet = activePage === "wallet";

  return (
    <>
      <header
        className="flex items-center px-4 shrink-0 z-40"
        style={{
          borderBottom: isWallet ? "none" : "1px solid rgba(255,255,255,0.55)",
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          minHeight: isWallet ? 72 : 44,
          gap: 0,
        }}
      >
        {isWallet ? (
          /* ── Wallet greeting header ─────────────────────── */
          <>
            <div className="flex-1 py-3">
              <div className="text-xs" style={{ color: "var(--subtle)" }}>{greeting}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xl font-bold" style={{ color: "var(--ink)" }}>RushPay</span>
                <Crown size={16} style={{ color: "#f59e0b" }} />
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--subtle)" }}>Your global finance companion</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => onNavigate("ai")}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)", color: "var(--subtle)" }}>
                <MessageCircle size={16} />
              </button>
              <button onClick={onOpenNotifications} className="relative w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)", color: "var(--subtle)" }}>
                <Bell size={16} />
                {notifCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: "#ef4444", color: "#fff" }}>{notifCount}</span>
                )}
              </button>
              <button onClick={onOpenSettings}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)", color: "var(--subtle)" }}>
                <Settings size={16} />
              </button>
            </div>
          </>
        ) : (
          /* ── Standard compact header (non-wallet pages) ─── */
          <>
            <div className="flex items-center gap-1 shrink-0 mr-3">
              {onBack ? (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1.5 px-1 py-1 rounded-lg transition-colors"
                  style={{ color: "var(--ink)", minWidth: 44, minHeight: 36 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-high)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  aria-label="Back"
                >
                  <ArrowLeft size={18} />
                  <span className="text-sm font-medium hidden sm:inline">
                    {PAGE_LABELS[activePage] ?? "Back"}
                  </span>
                </button>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm"
                    style={{ background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff" }}>R</div>
                  <span className="font-bold text-sm tracking-wide hidden sm:block" style={{ color: "var(--ink)" }}>RushPay</span>
                </>
              )}
            </div>

            <nav className="hidden md:flex items-center gap-0 min-w-0 flex-1" style={{ overflow: "hidden" }}>
              {NAV_LINKS.map(({ id, label }) => {
                const isP2P = id === "p2p";
                const accentColor = isP2P ? "#22c55e" : "var(--accent)";
                return (
                  <button key={id} onClick={() => onNavigate(id)}
                    className="h-11 px-3 text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 border-b-2"
                    style={{
                      color:       activePage === id ? (isP2P ? "#4ade80" : "var(--ink)") : "var(--subtle)",
                      background:  activePage === id ? (isP2P ? "rgba(34,197,94,0.08)" : "var(--surface-high)") : "transparent",
                      borderColor: activePage === id ? accentColor : "transparent",
                    }}>{label}</button>
                );
              })}
              <button onClick={() => onNavigate("ai")}
                className="h-11 px-3 text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5"
                style={{
                  color: activePage === "ai" ? "#c4b5fd" : "#a78bfa",
                  background: activePage === "ai" ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.07)",
                  borderColor: activePage === "ai" ? "#8b5cf6" : "transparent",
                }}>
                <Bot size={13} />Element
              </button>
            </nav>

            <div className="flex items-center gap-1 shrink-0 ml-auto md:ml-2">
              <button onClick={onToggleTheme}
                className="w-7 h-7 rounded flex items-center justify-center transition-colors"
                style={{ color: "var(--subtle)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-high)"; e.currentTarget.style.color = "var(--ink)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--subtle)"; }}
              >
                {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
              </button>

          <div className="relative">
            <button
              onClick={() => setLangOpen(v => !v)}
              className="h-7 px-1.5 rounded flex items-center gap-1 text-xs transition-colors hidden sm:flex"
              style={{ color: "var(--subtle)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-high)"; e.currentTarget.style.color = "var(--ink)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent";         e.currentTarget.style.color = "var(--subtle)"; }}
            >
              <Globe size={11} /> {lang}
            </button>
            {langOpen && (
              <div className="absolute top-full right-0 mt-1 w-20 rounded shadow-lg z-50 py-1"
                style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}>
                {langs.map(l => (
                  <button key={l} onClick={() => { setLang(l); setLangOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs"
                    style={{ color: l === lang ? "var(--accent)" : "var(--ink-2)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >{l}</button>
                ))}
              </div>
            )}
          </div>

          <button onClick={onOpenSettings}
            className="w-7 h-7 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--subtle)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-high)"; e.currentTarget.style.color = "var(--ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent";         e.currentTarget.style.color = "var(--subtle)"; }}
          ><Settings size={13} /></button>

          <button onClick={onOpenNotifications}
            className="relative w-7 h-7 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--subtle)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-high)"; e.currentTarget.style.color = "var(--ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent";         e.currentTarget.style.color = "var(--subtle)"; }}
          >
            <Bell size={13} />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center mono"
                style={{ fontSize: 9, background: "var(--red)" }}>
                {notifCount > 9 ? "9+" : notifCount}
              </span>
            )}
          </button>

          {/* Show wallet connect only on DeFi / P2P — not a global gate */}
          {(activePage === "defi" || activePage === "p2p") && (
            <div className="ml-1 hidden sm:block">
              <ConnectKitButton />
            </div>
          )}

          <button
            className="md:hidden w-7 h-7 rounded flex items-center justify-center ml-1"
            style={{ color: "var(--subtle)" }}
            onClick={() => setMobileOpen(v => !v)}
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
          </>
        )}
      </header>

      {/* ── Mobile drawer ──────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden flex flex-col z-30"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
          {[...NAV_LINKS, { id: "ai" as Page, label: "Element (AI Agent)" }].map(({ id, label }) => (
            <button key={id}
              onClick={() => { onNavigate(id); setMobileOpen(false); }}
              className="px-4 py-3 text-left text-sm font-medium transition-colors flex items-center gap-2"
              style={{
                color:      activePage === id ? (id === "ai" ? "#a78bfa" : "var(--accent)") : "var(--ink-2)",
                background: activePage === id ? "var(--accent-dim)" : "transparent",
                borderLeft: activePage === id ? `2px solid ${id === "ai" ? "#8b5cf6" : "var(--accent)"}` : "2px solid transparent",
              }}
            >
              {id === "ai" && <Bot size={14} style={{ color: "#a78bfa" }} />}
              {label}
            </button>
          ))}
          {(activePage === "defi" || activePage === "p2p") && (
            <div className="px-4 py-2 sm:hidden">
              <ConnectKitButton />
            </div>
          )}
        </div>
      )}
    </>
  );
}
