import { useState } from "react";
import { useAccount } from "wagmi";
import { Copy, Check, Users, DollarSign, TrendingUp } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--ink-2)" }}>{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const TIERS = [
  { name: "Bronze",   minVol: 0,          rebate: "5%",  discount: "3%",  color: "#cd7f32" },
  { name: "Silver",   minVol: 100_000,     rebate: "8%",  discount: "5%",  color: "#9ca3af" },
  { name: "Gold",     minVol: 500_000,     rebate: "12%", discount: "8%",  color: "#f59e0b" },
  { name: "Platinum", minVol: 2_000_000,   rebate: "20%", discount: "12%", color: "#3b82f6" },
];

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const REFERRED = [
  { address: "0xAbCd…1234", vol: 42_800, earned: 128.40, joined: "3d ago" },
  { address: "0x9F2e…5678", vol: 18_200, earned:  54.60, joined: "7d ago" },
  { address: "0x3a8B…9012", vol:  5_400, earned:  16.20, joined: "12d ago" },
];

export function ReferralsPage() {
  const { isConnected, address } = useAccount();
  const [copied, setCopied] = useState(false);

  const code = address ? `PERPX-${address.slice(2, 8).toUpperCase()}` : "PERPX-DEMO01";
  const refLink = `https://perpx.trade?ref=${code}`;

  function copyLink() {
    void navigator.clipboard.writeText(refLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const myVol = 127_400;
  const currentTierIdx = TIERS.reduce((best, t, i) => myVol >= t.minVol ? i : best, 0);

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto" style={{ minHeight: "calc(100vh - 44px)", background: "var(--bg)" }}>
      <div>
        <div className="text-lg font-bold" style={{ color: "var(--ink)" }}>Referrals</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>Earn rebates when friends trade on PERPX</div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Earned",     value: "$199.20",  icon: <DollarSign size={14} />, color: "var(--green)" },
          { label: "Referred Traders", value: "3",        icon: <Users size={14} />,      color: "var(--accent)" },
          { label: "Referred Volume",  value: "$66.4K",   icon: <TrendingUp size={14} />, color: "var(--ink)" },
        ].map(s => (
          <div key={s.label} className="rounded p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-1.5 mb-1" style={{ color: s.color }}>{s.icon}</div>
            <div className="text-base font-bold mono" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Referral link */}
      <Section title="Your Referral Link">
        <div className="space-y-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded mono text-xs"
            style={{ background: "var(--surface-high)", border: "1px solid var(--border)" }}
          >
            <span className="flex-1 truncate" style={{ color: "var(--ink-2)" }}>{refLink}</span>
            <button
              onClick={copyLink}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
              style={{ background: copied ? "var(--green-dim)" : "var(--accent-dim)", color: copied ? "var(--green)" : "var(--accent)" }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="text-xs" style={{ color: "var(--subtle)" }}>
            Referral code: <span className="mono font-semibold" style={{ color: "var(--ink)" }}>{code}</span>
          </div>
        </div>
      </Section>

      {/* Tier table */}
      <Section title="Reward Tiers">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: "var(--subtle)" }}>
                {["Tier", "Min Volume (30d)", "Your Rebate", "Referee Discount"].map(h => (
                  <th key={h} className="text-left pb-2 font-medium pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tier, i) => (
                <tr
                  key={tier.name}
                  style={{
                    borderTop: "1px solid var(--border)",
                    background: i === currentTierIdx ? "var(--accent-dim)" : "transparent",
                  }}
                >
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: tier.color }} />
                      <span className="font-semibold" style={{ color: i === currentTierIdx ? "var(--ink)" : "var(--ink-2)" }}>
                        {tier.name}
                        {i === currentTierIdx && (
                          <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--accent)" }}>(current)</span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="mono pr-4" style={{ color: "var(--ink-2)" }}>{fmt(tier.minVol)}</td>
                  <td className="mono pr-4 font-semibold" style={{ color: "var(--green)" }}>{tier.rebate}</td>
                  <td className="mono" style={{ color: "var(--buy)" }}>{tier.discount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 text-xs" style={{ color: "var(--subtle)" }}>
          Your 30d volume: <span className="mono font-semibold" style={{ color: "var(--ink)" }}>{fmt(myVol)}</span>
        </div>
      </Section>

      {/* Referred traders */}
      <Section title={`Referred Traders (${REFERRED.length})`}>
        {!isConnected ? (
          <div className="text-center text-xs py-3" style={{ color: "var(--subtle)" }}>Connect wallet to see your referrals</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: "var(--subtle)" }}>
                {["Address", "Volume", "Your Earnings", "Joined"].map(h => (
                  <th key={h} className="text-left pb-2 font-medium pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REFERRED.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="py-1.5 pr-4 mono" style={{ color: "var(--ink-2)" }}>{r.address}</td>
                  <td className="mono pr-4" style={{ color: "var(--ink)" }}>{fmt(r.vol)}</td>
                  <td className="mono pr-4 font-semibold" style={{ color: "var(--green)" }}>${r.earned.toFixed(2)}</td>
                  <td style={{ color: "var(--subtle)" }}>{r.joined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
