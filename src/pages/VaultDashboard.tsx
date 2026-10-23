/**
 * VaultDashboard — Element Settlement Engine Admin View
 *
 * Shows real-time vault stats, settlement pipeline, exposure,
 * configuration status, and recent settlement records.
 * Reads from /api/settlement/vault-stats and /api/settlement/list.
 *
 * Protected: in production, gate this behind an admin role.
 * For the sandbox demo, it renders for any user.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Shield, AlertTriangle, CheckCircle2, Zap, RefreshCw,
  TrendingUp, Lock, Database, Settings, ChevronDown, ChevronUp,
  ExternalLink,
} from "lucide-react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const NAVY   = "var(--bg)";
const CARD   = "rgba(255,255,255,0.80)";
const CARD_H = "rgba(255,255,255,0.92)";
const BORDER = "rgba(100,116,139,0.18)";
const BLUE   = "#3b82f6";
const GREEN  = "#22c55e";
const AMBER  = "#f59e0b";
const RED    = "#ef4444";

// ─── Types ────────────────────────────────────────────────────────────────────
interface VaultStats {
  totalLiquidity:     number;
  reservedLiquidity:  number;
  availableLiquidity: number;
  providerConfigured: boolean;
  vaultAddressSet:    boolean;
  instantSettlementEnabled: boolean;
  missingConfig:      string[];
  counts: {
    total:          number;
    awaitingCrypto: number;
    verifying:      number;
    earlyPayout:    number;
    paid:           number;
    completed:      number;
    underReview:    number;
    failed:         number;
  };
  recentSettlements: SettlementRow[];
}

interface SettlementRow {
  id:                 string;
  tradeId:            string;
  status:             string;
  statusMessage:      string;
  crypto:             string;
  cryptoAmount:       string;
  fiat:               string;
  fiatAmount:         string;
  rate:               number;
  riskScore:          number;
  riskFlags:          string[];
  earlyPayoutGranted: boolean;
  txConfirmations:    number;
  requiredConfs:      number;
  createdAt:          number;
  updatedAt:          number;
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string;
  color?: string; icon?: React.ReactNode;
}) {
  const c = color ?? BLUE;
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: CARD, border: `1px solid ${c}30` }}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider" style={{ color: "#64748b" }}>{label}</div>
        {icon && <div style={{ color: c }}>{icon}</div>}
      </div>
      <div className="text-2xl font-bold" style={{ color: c }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "#475569" }}>{sub}</div>}
    </div>
  );
}

// ─── Config warning ───────────────────────────────────────────────────────────
function ConfigWarning({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}30` }}>
      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: AMBER }}>
        <AlertTriangle size={16} /> Configuration Required
      </div>
      <div className="text-xs" style={{ color: "#94a3b8" }}>
        Instant settlement is <strong style={{ color: AMBER }}>disabled</strong> until these are configured in <code>.env</code>:
      </div>
      {missing.map(m => (
        <div key={m} className="flex items-center gap-2 text-xs font-mono px-2 py-1 rounded-lg"
          style={{ background: `${AMBER}10`, color: AMBER }}>
          <span>⚠</span> {m}
        </div>
      ))}
      <div className="text-xs mt-1" style={{ color: "#64748b" }}>
        Settlement records are created and tracked, but payouts will be held under_review until credentials are set.
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  awaiting_crypto:       BLUE,
  tx_detected:           BLUE,
  verifying:             AMBER,
  early_payout_eligible: GREEN,
  payout_processing:     BLUE,
  paid:                  GREEN,
  awaiting_confirmation: AMBER,
  completed:             GREEN,
  under_review:          AMBER,
  failed:                RED,
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#64748b";
  const label = status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

// ─── Settlement row ───────────────────────────────────────────────────────────
function SettlementTableRow({ s, nowMs }: { s: SettlementRow; nowMs: number }) {
  const [expanded, setExpanded] = useState(false);
  const fiatFmt = parseFloat(s.fiatAmount).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const timeAgo = (ts: number) => {
    const sec = Math.floor((nowMs - ts) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return `${Math.floor(sec / 3600)}h ago`;
  };

  return (
    <>
      <div className="grid items-center gap-2 px-4 py-3 border-b cursor-pointer hover:bg-white/[0.02] transition-colors"
        style={{ borderColor: `${BORDER}`, gridTemplateColumns: "2fr 1.5fr 1.5fr 1.5fr 1fr auto" }}
        onClick={() => setExpanded(p => !p)}>
        <div>
          <div className="text-[11px] font-mono" style={{ color: "#94a3b8" }}>#{s.id.slice(-8).toUpperCase()}</div>
          <div className="text-[10px]" style={{ color: "#475569" }}>{timeAgo(s.createdAt)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold" style={{ color: "#e2e8f0" }}>
            {s.cryptoAmount} {s.crypto}
          </div>
          <div className="text-[10px]" style={{ color: "#475569" }}>
            {s.txConfirmations}/{s.requiredConfs} confs
          </div>
        </div>
        <div className="text-xs font-semibold" style={{ color: GREEN }}>
          {s.fiat === "NGN" ? "₦" : s.fiat}{fiatFmt}
        </div>
        <StatusBadge status={s.status} />
        <div className="text-xs flex items-center gap-1" style={{ color: s.riskScore > 40 ? AMBER : "#64748b" }}>
          {s.riskScore > 40 && <AlertTriangle size={10} />}
          {s.riskScore}
        </div>
        <div style={{ color: "#475569" }}>
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 py-3 border-b text-xs flex flex-col gap-2"
          style={{ borderColor: BORDER, background: `${CARD_H}80` }}>
          <div className="flex gap-6 flex-wrap">
            <div><span style={{ color: "#475569" }}>Trade: </span><span className="font-mono" style={{ color: "#94a3b8" }}>#{s.tradeId.slice(-8).toUpperCase()}</span></div>
            <div><span style={{ color: "#475569" }}>Rate: </span><span style={{ color: "#94a3b8" }}>₦{s.rate.toLocaleString("en-US",{maximumFractionDigits:0})}/{s.crypto}</span></div>
            <div><span style={{ color: "#475569" }}>Early payout: </span><span style={{ color: s.earlyPayoutGranted ? GREEN : "#475569" }}>{s.earlyPayoutGranted ? "Yes" : "No"}</span></div>
            <div><span style={{ color: "#475569" }}>Last updated: </span><span style={{ color: "#94a3b8" }}>{timeAgo(s.updatedAt)}</span></div>
          </div>
          <div style={{ color: "#64748b" }}>{s.statusMessage}</div>
          {s.riskFlags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ color: AMBER }}>Risk flags:</span>
              {s.riskFlags.map(f => (
                <span key={f} className="px-1.5 py-0.5 rounded text-[10px] font-mono"
                  style={{ background: `${AMBER}12`, color: AMBER }}>{f}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
interface VaultDashboardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigate?: (page: any) => void;
}

export function VaultDashboard({ onNavigate: _onNavigate }: VaultDashboardProps) {
  const [stats, setStats]       = useState<VaultStats | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);
  const [nowMs, setNowMs]       = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, listRes] = await Promise.all([
        fetch("/api/settlement/vault-stats"),
        fetch("/api/settlement/list?limit=20"),
      ]);
      const statsData = await statsRes.json() as VaultStats;
      const listData  = await listRes.json() as { settlements: SettlementRow[] };
      // Merge recentSettlements from list endpoint (more up-to-date)
      setStats({ ...statsData, recentSettlements: listData.settlements ?? statsData.recentSettlements });
      const now = Date.now();
      setLastRefresh(now);
      setNowMs(now);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh(); }, []);

  // Auto-refresh every 30s
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const iv = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(iv);
  }, [refresh]);

  // Clock tick for relative time labels
  useEffect(() => {
    const iv = setInterval(() => setNowMs(n => n + 1000), 1000);
    return () => clearInterval(iv);
  }, []);

  const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: NAVY }}>

      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-3"
        style={{ background: "var(--surface)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(59,130,246,0.15)", color: BLUE }}>
              <Shield size={16} />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: "#f1f5f9" }}>Element Settlement</div>
              <div className="text-[11px]" style={{ color: "#64748b" }}>Vault & Settlement Dashboard</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastRefresh && nowMs > 0 && (
              <span className="text-[10px]" style={{ color: "#475569" }}>
                {Math.floor((nowMs - lastRefresh) / 1000)}s ago
              </span>
            )}
            <button onClick={() => void refresh()} disabled={loading}
              className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-50"
              style={{ background: "rgba(59,130,246,0.1)", color: BLUE }}>
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">

        {error && (
          <div className="rounded-xl p-3 text-xs" style={{ background: `${RED}10`, color: RED, border: `1px solid ${RED}25` }}>
            {error} — Is the backend server running?
          </div>
        )}

        {!stats && !error && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          </div>
        )}

        {stats && (
          <>
            {/* Config warning */}
            <ConfigWarning missing={stats.missingConfig} />

            {/* Instant settlement status banner */}
            <div className="rounded-2xl p-3 flex items-center gap-3"
              style={{ background: stats.instantSettlementEnabled ? `${GREEN}08` : `${AMBER}08`,
                       border: `1px solid ${stats.instantSettlementEnabled ? GREEN : AMBER}30` }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: stats.instantSettlementEnabled ? `${GREEN}15` : `${AMBER}15`,
                         color: stats.instantSettlementEnabled ? GREEN : AMBER }}>
                {stats.instantSettlementEnabled ? <Zap size={16} /> : <Lock size={16} />}
              </div>
              <div>
                <div className="text-sm font-bold"
                  style={{ color: stats.instantSettlementEnabled ? GREEN : AMBER }}>
                  Instant Settlement {stats.instantSettlementEnabled ? "ENABLED" : "DISABLED"}
                </div>
                <div className="text-xs" style={{ color: "#64748b" }}>
                  {stats.instantSettlementEnabled
                    ? "Early payouts are authorized when all risk criteria pass"
                    : "Configure the missing items above to enable early payouts"}
                </div>
              </div>
            </div>

            {/* Vault liquidity */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total Liquidity" value={`₦${fmt(stats.totalLiquidity)}`}
                color={GREEN} icon={<Database size={14} />} sub="VAULT_LIQUIDITY_NGN" />
              <StatCard label="Reserved" value={`₦${fmt(stats.reservedLiquidity)}`}
                color={AMBER} icon={<Lock size={14} />} sub="Pending early payouts" />
              <StatCard label="Available" value={`₦${fmt(stats.availableLiquidity)}`}
                color={BLUE} icon={<TrendingUp size={14} />} sub="For new instant payouts" />
            </div>

            {/* Settlement counts */}
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>
                Pipeline
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Awaiting",   value: stats.counts.awaitingCrypto, color: "#64748b" },
                  { label: "Verifying",  value: stats.counts.verifying,      color: AMBER     },
                  { label: "Early Out",  value: stats.counts.earlyPayout,    color: GREEN     },
                  { label: "Paid",       value: stats.counts.paid,           color: GREEN     },
                  { label: "Completed",  value: stats.counts.completed,      color: GREEN     },
                  { label: "Review",     value: stats.counts.underReview,    color: AMBER     },
                  { label: "Failed",     value: stats.counts.failed,         color: RED       },
                  { label: "Total",      value: stats.counts.total,          color: BLUE      },
                ].map(item => (
                  <div key={item.label} className="rounded-xl p-3 text-center"
                    style={{ background: CARD, border: `1px solid ${item.color}20` }}>
                    <div className="text-lg font-bold" style={{ color: item.color }}>{item.value}</div>
                    <div className="text-[10px] font-medium uppercase mt-0.5" style={{ color: "#475569" }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Integration status */}
            <div className="rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: CARD, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-2 text-sm font-semibold mb-1" style={{ color: "#e2e8f0" }}>
                <Settings size={14} style={{ color: BLUE }} /> Integration Status
              </div>
              {[
                { label: "Vault EVM Address",          ok: stats.vaultAddressSet,    key: "VAULT_EVM_ADDRESS"           },
                { label: "Fiat Payout Provider",        ok: stats.providerConfigured, key: "FLUTTERWAVE_ / PAYSTACK_KEY" },
                { label: "Vault Liquidity Configured",  ok: stats.totalLiquidity > 0, key: "VAULT_LIQUIDITY_NGN"         },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between text-xs py-1"
                  style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-2" style={{ color: "#94a3b8" }}>
                    {item.ok
                      ? <CheckCircle2 size={11} style={{ color: GREEN }} />
                      : <AlertTriangle size={11} style={{ color: AMBER }} />}
                    {item.label}
                  </div>
                  <code className="text-[10px] font-mono"
                    style={{ color: item.ok ? "#475569" : AMBER }}>
                    {item.ok ? "configured" : `missing: ${item.key}`}
                  </code>
                </div>
              ))}
              <div className="text-[10px] mt-1" style={{ color: "#374151" }}>
                Set these in <code>.env</code> and restart the backend server.
                Real-money early payouts require all three before enabling.
              </div>
            </div>

            {/* Recent settlements table */}
            {stats.recentSettlements.length > 0 ? (
              <div className="rounded-2xl overflow-hidden"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <div className="px-4 py-3 flex items-center justify-between border-b"
                  style={{ borderColor: BORDER }}>
                  <div className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
                    Recent Settlements ({stats.recentSettlements.length})
                  </div>
                  <a href="/api/settlement/list" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1 text-xs" style={{ color: BLUE }}>
                    Raw data <ExternalLink size={10} />
                  </a>
                </div>
                {/* Column headers */}
                <div className="grid px-4 py-2 text-[10px] font-semibold uppercase tracking-wider border-b"
                  style={{ borderColor: BORDER, color: "var(--subtle)",
                           gridTemplateColumns: "2fr 1.5fr 1.5fr 1.5fr 1fr auto" }}>
                  <span>ID / Time</span>
                  <span>Crypto</span>
                  <span>Fiat Out</span>
                  <span>Status</span>
                  <span>Risk</span>
                  <span />
                </div>
                {stats.recentSettlements.map(s => (
                  <SettlementTableRow key={s.id} s={s} nowMs={nowMs || Date.now()} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl p-8 flex flex-col items-center gap-3"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                <Shield size={24} style={{ color: "var(--subtle)" }} />
                <div className="text-sm font-medium" style={{ color: "#64748b" }}>No settlements yet</div>
                <div className="text-xs text-center max-w-xs" style={{ color: "#374151" }}>
                  Settlement records will appear here when users sell crypto through the P2P marketplace.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
