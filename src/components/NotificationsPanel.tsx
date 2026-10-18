import { useEffect, useRef } from "react";
import { X, CheckCircle, AlertTriangle, Info, TrendingDown } from "lucide-react";

interface Notif {
  id: number;
  type: "fill" | "warning" | "info" | "liquidation";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const DEMO_NOTIFS: Notif[] = [
  { id: 1, type: "fill", title: "Order Filled", body: "Long BTC-USD 0.05 @ $67,892.40 — Market", time: "2m ago", read: false },
  { id: 2, type: "info", title: "Funding Payment", body: "Received $0.82 funding on BTC-USD long position", time: "1h ago", read: false },
  { id: 3, type: "warning", title: "Margin Warning", body: "ETH-USD position approaching maintenance margin (85%)", time: "3h ago", read: true },
  { id: 4, type: "liquidation", title: "Liquidation Alert", body: "SOL-USD position was liquidated at $174.20", time: "5h ago", read: true },
  { id: 5, type: "fill", title: "Order Filled", body: "Short ETH-USD 1.0 @ $3,521.10 — Limit", time: "6h ago", read: true },
  { id: 6, type: "info", title: "System", body: "PERPX maintenance scheduled for Oct 10 02:00 UTC", time: "1d ago", read: true },
];

const ICONS = {
  fill: <CheckCircle size={13} className="text-green-400 shrink-0" />,
  warning: <AlertTriangle size={13} className="text-yellow-400 shrink-0" />,
  info: <Info size={13} className="text-blue-400 shrink-0" />,
  liquidation: <TrendingDown size={13} className="text-red-400 shrink-0" />,
};

interface Props { onClose: () => void; }

export function NotificationsPanel({ onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const unread = DEMO_NOTIFS.filter((n) => !n.read).length;

  return (
    <div
      ref={panelRef}
      className="absolute top-11 right-0 w-80 bg-[--surface-muted] border border-[--border] rounded-xl shadow-2xl z-[100] overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[--border]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[--ink]">Notifications</span>
          {unread > 0 && (
            <span className="text-[9px] bg-blue-500 text-white rounded-full px-1.5 py-0.5 font-bold">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button className="text-[10px] text-[--accent] hover:opacity-80 transition-opacity px-1">Mark all read</button>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[--surface] text-[--subtle] hover:text-[--ink] transition-colors">
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="max-h-80 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {DEMO_NOTIFS.map((n) => (
          <div
            key={n.id}
            className={`flex items-start gap-3 px-4 py-3 border-b border-[--border] hover:bg-[--surface] transition-colors
              ${!n.read ? "bg-[--accent]/3" : ""}`}
          >
            <div className="mt-0.5">{ICONS[n.type]}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-semibold ${!n.read ? "text-[--ink]" : "text-[--muted]"}`}>{n.title}</span>
                <span className="text-[10px] text-[--subtle] shrink-0">{n.time}</span>
              </div>
              <p className="text-[10px] text-[--subtle] mt-0.5 leading-relaxed">{n.body}</p>
            </div>
            {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />}
          </div>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-[--border]">
        <button className="w-full text-center text-[10px] text-[--accent] hover:opacity-80 transition-opacity py-0.5">
          View all notifications
        </button>
      </div>
    </div>
  );
}
