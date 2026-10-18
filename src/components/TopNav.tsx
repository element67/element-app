import { useState } from "react";
import { Sun, Moon, Globe, Settings, Bell, Menu, X, Bot } from "lucide-react";
import { ConnectKitButton } from "connectkit";

type Page = "defi" | "p2p" | "portfolio" | "wallet" | "ai" | "subaccounts" | "referrals";

interface TopNavProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  activePage: Page;
  onNavigate: (page: Page) => void;
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

export function TopNav({
  theme, onToggleTheme, activePage, onNavigate,
  onOpenSettings, onOpenNotifications, notifCount,
}: TopNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [langOpen, setLangOpen]     = useState(false);
  const [lang, setLang]             = useState("EN");
  const langs = ["EN", "中文"];

  return (
    <>
      <header
        className="h-11 flex items-center px-3 shrink-0 z-40"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", gap: 0 }}
      >
        {/* ── Logo ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1 shrink-0 mr-3">
          <div
            className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs"
            style={{ background: "var(--accent)", color: "#fff" }}
          >F</div>
          <span className="font-bold text-sm tracking-wide hidden sm:block" style={{ color: "var(--ink)" }}>FinanceX</span>
        </div>

        {/* ── Desktop nav ───────────────────────────────────── */}
        <nav
          className="hidden md:flex items-center gap-0 min-w-0 flex-1"
          style={{ overflow: "hidden" }}
        >
          {NAV_LINKS.map(({ id, label }) => {
            const isP2P    = id === "p2p";
            const accentColor = isP2P ? "#22c55e" : "var(--accent)";
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className="h-11 px-3 text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 border-b-2"
                style={{
                  color:       activePage === id ? (isP2P ? "#4ade80" : "var(--ink)") : "var(--subtle)",
                  background:  activePage === id ? (isP2P ? "rgba(34,197,94,0.08)" : "var(--surface-high)") : "transparent",
                  borderColor: activePage === id ? accentColor : "transparent",
                }}
              >{label}</button>
            );
          })}

          {/* Element AI */}
          <button
            onClick={() => onNavigate("ai")}
            className="h-11 px-3 text-xs font-semibold transition-all duration-150 whitespace-nowrap shrink-0 border-b-2 flex items-center gap-1.5"
            style={{
              color:       activePage === "ai" ? "#c4b5fd" : "#a78bfa",
              background:  activePage === "ai" ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.07)",
              borderColor: activePage === "ai" ? "#8b5cf6" : "transparent",
              boxShadow:   activePage === "ai" ? "inset 0 0 12px rgba(139,92,246,0.15)" : "none",
            }}
          >
            <Bot size={13} />
            Element
          </button>
        </nav>

        {/* ── Right controls ────────────────────────────────── */}
        <div className="flex items-center gap-1 shrink-0 ml-auto md:ml-2">
          <button
            onClick={onToggleTheme}
            className="w-7 h-7 rounded flex items-center justify-center transition-colors"
            style={{ color: "var(--subtle)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-high)"; e.currentTarget.style.color = "var(--ink)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent";         e.currentTarget.style.color = "var(--subtle)"; }}
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
