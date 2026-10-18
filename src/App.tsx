import { useState, useEffect, Component } from "react";
import type { ReactNode } from "react";
import { Bot, Zap, ArrowUpDown, Wallet, Users } from "lucide-react";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        height:"100vh",background:"#0d1117",color:"#e2e8f0",fontFamily:"monospace",gap:12 }}>
        <div style={{ fontSize:28 }}>⚠</div>
        <div style={{ fontSize:14,color:"#f87171" }}>Something went wrong</div>
        <div style={{ fontSize:11,color:"#64748b",maxWidth:400,textAlign:"center" }}>{this.state.error.message}</div>
        <button onClick={() => { this.setState({ error:null }); window.location.reload(); }}
          style={{ marginTop:8,padding:"6px 16px",borderRadius:8,background:"#1e3a5f",color:"#60a5fa",border:"1px solid #2563eb",cursor:"pointer",fontSize:12 }}>
          Reload
        </button>
      </div>
    );
    return this.props.children;
  }
}

import { usePriceStore }       from "./store/priceStore";
import { useWalletStore }      from "./store/walletStore";
import { TopNav }              from "./components/TopNav";
import { SettingsModal }       from "./components/SettingsModal";
import { NotificationsPanel }  from "./components/NotificationsPanel";
import { PortfolioPage }       from "./pages/PortfolioPage";
import { DeFiPage }            from "./pages/DeFiPage";
import { AIAgentPage }         from "./pages/AIAgentPage";
import { SubaccountsPage }     from "./pages/SubaccountsPage";
import { ReferralsPage }       from "./pages/ReferralsPage";
import { WalletPage }          from "./pages/WalletPage";
import { P2PPage }             from "./pages/P2PPage";
import { CountryOnboarding }   from "./components/CountryOnboarding";

export type Page = "defi" | "p2p" | "portfolio" | "wallet" | "ai" | "subaccounts" | "referrals";

/* ── Floating Element FAB ─────────────────────────────────────────────────── */
function FloatingElement({ activePage, onNavigate }: { activePage: Page; onNavigate: (p: Page) => void }) {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = setInterval(() => { setPulse(true); setTimeout(() => setPulse(false), 1200); }, 30_000);
    return () => clearInterval(id);
  }, []);
  if (activePage === "ai") return null;
  return (
    <button
      onClick={() => onNavigate("ai")}
      title="Open Element AI Agent"
      style={{
        position:"fixed", bottom:76, right:20, zIndex:9000,
        width:52, height:52, borderRadius:"50%",
        background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
        boxShadow: pulse
          ? "0 0 0 8px rgba(139,92,246,0.25),0 4px 20px rgba(139,92,246,0.5)"
          : "0 4px 16px rgba(139,92,246,0.4)",
        border:"none", cursor:"pointer",
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:2,
        transition:"box-shadow 0.4s ease,transform 0.15s ease",
        transform: pulse ? "scale(1.08)" : "scale(1)", color:"#fff",
      }}
      onMouseEnter={e => { (e.currentTarget).style.transform="scale(1.1)"; }}
      onMouseLeave={e => { (e.currentTarget).style.transform=pulse?"scale(1.08)":"scale(1)"; }}
    >
      <Bot size={20}/>
      <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.04em", lineHeight:1 }}>Element</span>
    </button>
  );
}

function SignalBadge() {
  return (
    <div style={{
      position:"fixed", bottom:120, right:18, zIndex:9001,
      background:"#22c55e", color:"#fff", borderRadius:10,
      fontSize:9, fontWeight:700, padding:"1px 6px",
      boxShadow:"0 2px 6px rgba(34,197,94,0.5)", pointerEvents:"none",
    }}>
      <Zap size={8} style={{ display:"inline",marginRight:2 }}/>LIVE
    </div>
  );
}

/* ── Mobile bottom tab bar ────────────────────────────────────────────────── */
const BOTTOM_TABS: { id: Page; label: string; icon: ReactNode }[] = [
  { id:"wallet",    label:"Wallet",    icon:<Wallet size={20}/> },
  { id:"p2p",       label:"P2P",       icon:<Users size={20}/> },
  { id:"defi",      label:"DeFi",      icon:<ArrowUpDown size={20}/> },
  { id:"ai",        label:"Element",   icon:<Bot size={20}/> },
];

function BottomTabBar({ active, onNavigate }: { active: Page; onNavigate: (p: Page) => void }) {
  return (
    <div
      className="md:hidden flex items-center shrink-0"
      style={{
        borderTop:"1px solid var(--border)",
        background:"var(--surface)",
        paddingBottom:"env(safe-area-inset-bottom, 0px)",
        zIndex:200,
      }}
    >
      {BOTTOM_TABS.map(t => (
        <button
          key={t.id}
          onClick={() => onNavigate(t.id)}
          className="flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors"
          style={{
            color: active === t.id ? "var(--accent)" : "var(--subtle)",
            background: active === t.id ? "rgba(59,130,246,0.06)" : "transparent",
          }}
        >
          {t.icon}
          <span style={{ fontSize:9, fontWeight:600 }}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Main App ─────────────────────────────────────────────────────────────── */
export default function App() {
  const [theme,        setTheme]        = useState<"dark"|"light">("dark");
  const [activePage,   setActivePage]   = useState<Page>("wallet");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [notifCount]                   = useState(3);
  const [defiTab,      setDefiTab]      = useState<string>("swap");

  const countryConfirmed = useWalletStore(s => s.countryConfirmed);
  const startFeed     = usePriceStore(s => s.startFeed);
  const tickers       = usePriceStore(s => s.tickers);
  const refreshPrices = useWalletStore(s => s.refreshPrices);

  // Start price feed on mount
  useEffect(() => {
    const stop = startFeed();
    return stop;
  }, [startFeed]);

  // Sync live prices into wallet store every 10 s
  useEffect(() => {
    const prices: Record<string, number> = {};
    Object.entries(tickers).forEach(([mk, t]) => {
      const sym = mk.replace("-USD","");
      if (t?.lastPrice) prices[sym] = t.lastPrice;
    });
    prices.USDC = 1; prices.USDT = 1;
    refreshPrices(prices);
  }, [tickers, refreshPrices]);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  function navigate(p: Page) { setActivePage(p); }
  function handleDefiTab(tab: string) { setDefiTab(tab); }

  return (
    <ErrorBoundary>
    {!countryConfirmed && <CountryOnboarding />}
    <div className="flex flex-col h-screen overflow-hidden" style={{ background:"var(--bg)" }}>

      <TopNav
        theme={theme}
        onToggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")}
        activePage={activePage}
        onNavigate={navigate}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenNotifications={() => setNotifOpen(true)}
        notifCount={notifCount}
      />

      <div className="flex-1 overflow-hidden">

        {activePage === "defi" && (
          <div className="h-full overflow-auto page-enter" style={{ background:"var(--bg)" }}>
            <DeFiPage initialTab={defiTab} />
          </div>
        )}

        {activePage === "p2p" && (
          <div className="h-full overflow-hidden page-enter" style={{ background:"var(--bg)" }}>
            <P2PPage />
          </div>
        )}

        {!["defi","p2p"].includes(activePage) && (
          <div className="h-full overflow-auto page-enter" style={{ background:"var(--bg)" }}>
            {activePage === "wallet"      && <WalletPage onNavigate={navigate} onDefiTab={handleDefiTab} />}
            {activePage === "portfolio"   && <PortfolioPage />}
            {activePage === "ai"          && <AIAgentPage />}
            {activePage === "subaccounts" && <SubaccountsPage />}
            {activePage === "referrals"   && <ReferralsPage />}
          </div>
        )}
      </div>

      <BottomTabBar active={activePage} onNavigate={navigate} />

      {settingsOpen && <SettingsModal    onClose={() => setSettingsOpen(false)} />}
      {notifOpen    && <NotificationsPanel onClose={() => setNotifOpen(false)} />}

      <FloatingElement activePage={activePage} onNavigate={navigate} />
      <SignalBadge />
    </div>
    </ErrorBoundary>
  );
}
