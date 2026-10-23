import { useState, useEffect, useRef } from "react";
import {
  X, CheckCircle, AlertTriangle, Info, ArrowUpRight,
  ArrowDownLeft, Repeat2, Shield, Bell,
} from "lucide-react";
import { useWalletStore } from "@/store/walletStore";

type NotifType = "received" | "sent" | "swap" | "security" | "info" | "warning";

interface Notif {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const ICONS: Record<NotifType, React.ReactNode> = {
  received: <ArrowDownLeft size={14} className="text-green-500 shrink-0" />,
  sent:     <ArrowUpRight  size={14} className="text-blue-500  shrink-0" />,
  swap:     <Repeat2       size={14} className="text-violet-500 shrink-0" />,
  security: <Shield        size={14} className="text-red-500   shrink-0" />,
  info:     <Info          size={14} className="text-sky-500   shrink-0" />,
  warning:  <AlertTriangle size={14} className="text-amber-500 shrink-0" />,
};

const SEED: Notif[] = [
  {
    id: "n1", type: "info",
    title: "Welcome to RushPay",
    body: "Your wallet is ready. Add funds to get started.",
    time: "just now", read: false,
  },
  {
    id: "n2", type: "info",
    title: "P2P Marketplace Active",
    body: "Browse merchants offering NGN trades right now.",
    time: "2m ago", read: false,
  },
  {
    id: "n3", type: "info",
    title: "Quick Swap Available",
    body: "Convert USDC ↔ NGN instantly via Quick Swap.",
    time: "5m ago", read: false,
  },
  {
    id: "n4", type: "security",
    title: "Security Tip",
    body: "Never share your wallet address or private keys with anyone.",
    time: "1h ago", read: true,
  },
  {
    id: "n5", type: "info",
    title: "Exchange Feature",
    body: "Crypto-to-fiat exchange is coming soon. Stay tuned.",
    time: "1d ago", read: true,
  },
];

const NOTIF_KEY = "rushpay-notifs-v2";

function loadNotifs(): Notif[] {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (raw) return JSON.parse(raw) as Notif[];
  } catch { /* ignore */ }
  return SEED;
}

function saveNotifs(ns: Notif[]) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(ns)); } catch { /* ignore */ }
}

interface Props { onClose: () => void }

export function NotificationsPanel({ onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [notifs, setNotifs] = useState<Notif[]>(loadNotifs);
  const setUnread = useWalletStore(s => s.setUnreadNotifications);

  const unread = notifs.filter(n => !n.read).length;

  // sync unread count to store
  useEffect(() => { setUnread(unread); }, [unread, setUnread]);

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function markAllRead() {
    const next = notifs.map(n => ({ ...n, read: true }));
    setNotifs(next);
    saveNotifs(next);
  }

  function markRead(id: string) {
    const next = notifs.map(n => n.id === id ? { ...n, read: true } : n);
    setNotifs(next);
    saveNotifs(next);
  }

  function dismiss(id: string) {
    const next = notifs.filter(n => n.id !== id);
    setNotifs(next);
    saveNotifs(next);
  }

  return (
    <div
      ref={panelRef}
      className="glass-card absolute top-12 right-0 w-80 z-[100] overflow-hidden rounded-2xl"
      style={{ boxShadow: "0 12px 48px rgba(15,23,60,0.18)" }}
    >
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <Bell size={14} style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>Notifications</span>
          {unread > 0 && (
            <span className="text-[10px] bg-blue-500 text-white rounded-full px-1.5 py-0.5 font-bold leading-none">
              {unread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] px-2 py-0.5 rounded-full transition-all"
              style={{ color: "var(--accent)", background: "rgba(37,99,235,0.08)" }}
            >
              Mark all read
            </button>
          )}
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full transition-all"
            style={{ background: "var(--surface-high)", color: "var(--subtle)" }}
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* list */}
      <div className="overflow-y-auto" style={{ maxHeight: "360px" }}>
        {notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <CheckCircle size={28} style={{ color: "var(--subtle)" }} />
            <p className="text-sm" style={{ color: "var(--subtle)" }}>All caught up!</p>
          </div>
        ) : (
          notifs.map(n => (
            <div
              key={n.id}
              onClick={() => markRead(n.id)}
              className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-all"
              style={{
                borderBottom: "1px solid var(--border)",
                background: n.read ? "transparent" : "rgba(37,99,235,0.04)",
              }}
            >
              <div className="mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--surface-high)" }}>
                {ICONS[n.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold truncate" style={{ color: "var(--ink)" }}>
                    {n.title}
                  </span>
                  <span className="text-[10px] shrink-0" style={{ color: "var(--subtle)" }}>{n.time}</span>
                </div>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "var(--subtle)" }}>{n.body}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); dismiss(n.id); }}
                className="shrink-0 mt-0.5 opacity-0 hover:opacity-100 transition-opacity"
                style={{ color: "var(--subtle)" }}
              >
                <X size={10} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* footer */}
      <div className="px-4 py-2 text-center" style={{ borderTop: "1px solid var(--border)" }}>
        <button className="text-[11px]" style={{ color: "var(--accent)" }}
          onClick={() => { setNotifs([]); saveNotifs([]); }}>
          Clear all
        </button>
      </div>
    </div>
  );
}
