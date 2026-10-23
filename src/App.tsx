import { useState, useEffect, Component } from "react";
import type { ReactNode } from "react";
import { Bot, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        height:"100vh",background:"#f0f2f8",color:"#0f172a",fontFamily:"'DM Sans',sans-serif",gap:12 }}>
        <div style={{ fontSize:28 }}>⚠</div>
        <div style={{ fontSize:14,color:"#dc2626" }}>Something went wrong</div>
        <div style={{ fontSize:11,color:"#64748b",maxWidth:400,textAlign:"center" }}>{this.state.error.message}</div>
        <button onClick={() => { this.setState({ error:null }); window.location.reload(); }}
          style={{ marginTop:8,padding:"6px 16px",borderRadius:8,background:"#2563eb",color:"#fff",border:"none",cursor:"pointer",fontSize:12 }}>
          Reload
        </button>
      </div>
    );
    return this.props.children;
  }
}

import { usePriceStore }       from "./store/priceStore";
import { useWalletStore }      from "./store/walletStore";
import { useSharedWallet }     from "./context/NativeWalletContext";
import { TopNav }              from "./components/TopNav";
import { SettingsModal }       from "./components/SettingsModal";
import { NotificationsPanel }  from "./components/NotificationsPanel";
import { PortfolioPage }       from "./pages/PortfolioPage";
import { DeFiPage }            from "./pages/DeFiPage";
import { AIAgentPage }         from "./pages/AIAgentPage";
import { VaultDashboard }      from "./pages/VaultDashboard";
import { SubaccountsPage }     from "./pages/SubaccountsPage";
import { ReferralsPage }       from "./pages/ReferralsPage";
import { WalletPage }          from "./pages/WalletPage";
import { P2PPage }             from "./pages/P2PPage";
import { CountryOnboarding }   from "./components/CountryOnboarding";

export type Page = "defi" | "p2p" | "portfolio" | "wallet" | "ai" | "subaccounts" | "referrals" | "vault";

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
        position:"fixed", bottom:24, right:20, zIndex:9000,
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
      {/* green online dot */}
      <div style={{ position:"absolute", top:4, right:4, width:9, height:9, borderRadius:"50%", background:"#22c55e", border:"2px solid #4f46e5" }} />
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


/* ── Main App ─────────────────────────────────────────────────────────────── */
export default function App() {
  const [theme] = useState<"dark"|"light">("light");
  const [pageStack,    setPageStack]    = useState<Page[]>(["wallet"]);
  const activePage = pageStack[pageStack.length - 1];
  const canGoBack  = pageStack.length > 1;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [notifCount]                   = useState(3);
  const [defiTab,      setDefiTab]      = useState<string>("swap");

  const countryConfirmed = useWalletStore(s => s.countryConfirmed);
  const startFeed     = usePriceStore(s => s.startFeed);
  const tickers       = usePriceStore(s => s.tickers);
  const refreshPrices = useWalletStore(s => s.refreshPrices);

  // Native wallet — initialized once at app root so all pages share the same instance
  const { walletId } = useSharedWallet();

  // Start price feed on mount
  useEffect(() => {
    const stop = startFeed();
    return stop;
  }, [startFeed]);

  // Balance sync is handled by NativeWalletProvider — no duplicate interval here.

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

  function navigate(p: Page) {
    setPageStack(s => {
      // Don't push a duplicate of the current top
      if (s[s.length - 1] === p) return s;
      // If navigating to wallet, reset the stack
      if (p === "wallet") return ["wallet"];
      return [...s, p];
    });
  }
  function goBack() {
    setPageStack(s => s.length > 1 ? s.slice(0, -1) : ["wallet"]);
  }
  // Wire browser/device back gesture
  useEffect(() => {
    const onPop = () => { goBack(); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  // goBack is defined in render scope — stable enough via closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function handleDefiTab(tab: string) { setDefiTab(tab); }

  // Keyboard shortcuts (skip when typing in an input/textarea)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case "w": navigate("wallet"); break;
        case "p": navigate("p2p"); break;
        case "d": navigate("defi"); break;
        case "a": navigate("ai"); break;
        case "s": setSettingsOpen(o => !o); break;
        case "h": {
          // toggle balance hide via walletStore
          const { toggleHideBalances } = useWalletStore.getState() as { toggleHideBalances?: () => void };
          toggleHideBalances?.();
          break;
        }
        case "1": if (e.metaKey) navigate("wallet"); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pageVariants = {
    initial:  { opacity: 0, y: 14, scale: 0.988, filter: "blur(4px)" },
    animate:  { opacity: 1, y: 0,  scale: 1,     filter: "blur(0px)",
                transition: { type: "spring", stiffness: 340, damping: 28, mass: 0.9 } },
    exit:     { opacity: 0, y: -8, scale: 0.994, filter: "blur(2px)",
                transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } },
  };

  return (
    <ErrorBoundary>
    {!countryConfirmed && <CountryOnboarding />}
    <div className="flex flex-col h-screen overflow-hidden" style={{ background:"var(--bg)" }}>

      {/* Ambient liquid light blobs — animated so glass appears to flow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="lg-blob-1" style={{ position:"absolute", top:"-10%", left:"-10%", width:560, height:560, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(99,150,246,0.62) 0%, rgba(99,150,246,0.12) 55%, transparent 75%)",
          filter:"blur(70px)" }} />
        <div className="lg-blob-2" style={{ position:"absolute", top:"25%", right:"-12%", width:480, height:480, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(167,139,250,0.55) 0%, rgba(167,139,250,0.10) 55%, transparent 75%)",
          filter:"blur(65px)" }} />
        <div className="lg-blob-3" style={{ position:"absolute", bottom:"-8%", left:"5%", width:440, height:440, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(251,146,60,0.46) 0%, rgba(251,191,36,0.12) 55%, transparent 75%)",
          filter:"blur(72px)" }} />
        <div className="lg-blob-4" style={{ position:"absolute", top:"45%", left:"35%", width:360, height:360, borderRadius:"50%",
          background:"radial-gradient(circle, rgba(125,211,252,0.34) 0%, transparent 70%)",
          filter:"blur(60px)", transform:"translate(-50%,-50%)" }} />
      </div>

      <div className="relative flex flex-col h-screen overflow-hidden" style={{ zIndex: 1 }}>
        <TopNav
          theme={theme}
          onToggleTheme={() => {}}
          activePage={activePage}
          onNavigate={navigate}
          onBack={canGoBack ? goBack : undefined}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenNotifications={() => setNotifOpen(true)}
          notifCount={notifCount}
        />

        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activePage}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="absolute inset-0 overflow-auto"
            >
              {activePage === "defi"        && <DeFiPage initialTab={defiTab} />}
              {activePage === "p2p"         && <P2PPage onVaultDashboard={() => navigate("vault")} />}
              {activePage === "wallet"      && <WalletPage onNavigate={navigate} onDefiTab={handleDefiTab} />}
              {activePage === "portfolio"   && <PortfolioPage />}
              {activePage === "ai"          && <AIAgentPage />}
              {activePage === "subaccounts" && <SubaccountsPage />}
              {activePage === "referrals"   && <ReferralsPage />}
              {activePage === "vault"       && <VaultDashboard onNavigate={navigate} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {settingsOpen && <SettingsModal    onClose={() => setSettingsOpen(false)} />}
        {notifOpen    && <NotificationsPanel onClose={() => setNotifOpen(false)} />}

        <FloatingElement activePage={activePage} onNavigate={navigate} />
        <SignalBadge />
      </div>
    </div>
    </ErrorBoundary>
  );
}
