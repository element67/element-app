/**
 * CurrencySwitcher — lets the user pick their display country + currency.
 *
 * Two modes:
 *  - inline: a compact row used inside SettingsModal
 *  - modal:  a full-screen searchable picker
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, Check, ChevronDown, Globe } from "lucide-react";
import { COUNTRIES } from "@/store/marketplaceStore";
import { CURRENCY_META } from "@/hooks/useFxDisplay";
import { useWalletStore } from "@/store/walletStore";
import { useMarketplaceStore } from "@/store/marketplaceStore";

// ── Regions for grouping ─────────────────────────────────────────────────────
const REGIONS = ["Africa", "Americas", "Asia", "Europe", "Middle East", "Oceania"];

// Deduplicate currencies (many countries share EUR, XOF, etc.)
interface CurrencyRow {
  code:       string;
  symbol:     string;
  name:       string;
  countries:  string[];   // country names
  flags:      string[];
  region:     string;
}

function buildCurrencyList(): CurrencyRow[] {
  const map = new Map<string, CurrencyRow>();
  for (const c of COUNTRIES) {
    const key = c.currency;
    const meta = CURRENCY_META[key];
    if (!map.has(key)) {
      map.set(key, {
        code:      key,
        symbol:    meta?.symbol ?? c.currencySymbol,
        name:      meta?.name ?? key,
        countries: [],
        flags:     [],
        region:    c.region,
      });
    }
    const row = map.get(key)!;
    if (!row.countries.includes(c.name)) row.countries.push(c.name);
    if (!row.flags.includes(c.flag))     row.flags.push(c.flag);
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

const CURRENCY_LIST = buildCurrencyList();

// ── Modal ─────────────────────────────────────────────────────────────────────
interface PickerModalProps {
  mode:    "country" | "currency";
  onClose: () => void;
}

function PickerModal({ mode, onClose }: PickerModalProps) {
  const userCountry    = useWalletStore(s => s.userCountry);
  const primaryFiat    = useWalletStore(s => s.primaryFiat);
  const setUserCountry = useWalletStore(s => s.setUserCountry);
  const setPrimaryFiat = useWalletStore(s => s.setPrimaryFiat);
  const fxRates        = useMarketplaceStore(s => s.fxRates);

  const [q,          setQ]          = useState("");
  const [activeRegion, setActiveRegion] = useState<string>("All");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const regions = ["All", ...REGIONS];

  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    if (mode === "country") {
      return COUNTRIES.filter(c =>
        (!lq || c.name.toLowerCase().includes(lq) || c.currency.toLowerCase().includes(lq) || c.code.toLowerCase().includes(lq)) &&
        (activeRegion === "All" || c.region === activeRegion)
      );
    } else {
      return CURRENCY_LIST.filter(c =>
        (!lq || c.code.toLowerCase().includes(lq) || c.name.toLowerCase().includes(lq) ||
          c.countries.some(n => n.toLowerCase().includes(lq))) &&
        (activeRegion === "All" || c.region === activeRegion)
      );
    }
  }, [q, mode, activeRegion]);

  function selectCountry(code: string) {
    setUserCountry(code);
    onClose();
  }

  function selectCurrency(code: string) {
    setPrimaryFiat(code);
    onClose();
  }

  const title = mode === "country" ? "Select Country" : "Select Currency";

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background:"var(--bg)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom:"1px solid var(--border)" }}>
        <button onClick={onClose} style={{ color:"var(--subtle)" }}>
          <X size={18}/>
        </button>
        <div className="text-sm font-semibold" style={{ color:"var(--ink)" }}>{title}</div>
        <div className="ml-auto text-xs" style={{ color:"var(--subtle)" }}>
          {filtered.length} results
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background:"var(--surface)", border:"1px solid var(--border)" }}>
          <Search size={13} style={{ color:"var(--subtle)" }}/>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color:"var(--ink)" }}
            placeholder={mode === "country" ? "Search country…" : "Search currency…"}
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {q && (
            <button onClick={() => setQ("")} style={{ color:"var(--subtle)" }}>
              <X size={11}/>
            </button>
          )}
        </div>
      </div>

      {/* Region tabs */}
      <div className="flex gap-1.5 px-4 pb-2 shrink-0 overflow-x-auto" style={{ scrollbarWidth:"none" }}>
        {regions.map(r => (
          <button
            key={r}
            onClick={() => setActiveRegion(r)}
            className="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-medium"
            style={{
              background: activeRegion === r ? "var(--accent)" : "var(--surface)",
              color:      activeRegion === r ? "#fff" : "var(--subtle)",
              border:     "1px solid var(--border)",
            }}
          >{r}</button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-8" style={{ scrollbarWidth:"thin" }}>
        {mode === "country" ? (
          <div className="space-y-0.5">
            {(filtered as typeof COUNTRIES).map(c => {
              const selected = c.code === userCountry;
              const hasRate  = c.currency in fxRates;
              return (
                <button
                  key={c.code}
                  onClick={() => selectCountry(c.code)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                  style={{
                    background: selected ? "rgba(59,130,246,0.12)" : "transparent",
                    border:     selected ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                  }}
                >
                  <span className="text-xl shrink-0">{c.flag}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color:"var(--ink)" }}>{c.name}</div>
                    <div className="text-[10px]" style={{ color:"var(--subtle)" }}>
                      {c.currency} · {c.currencySymbol}
                      {!hasRate && <span className="ml-1 opacity-50">(seed rate)</span>}
                    </div>
                  </div>
                  {selected && <Check size={13} className="shrink-0" style={{ color:"var(--accent)" }}/>}
                  {!c.supported && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{ background:"rgba(248,113,113,0.1)", color:"#f87171" }}>
                      P2P limited
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-0.5">
            {(filtered as CurrencyRow[]).map(c => {
              const selected = c.code === primaryFiat;
              const hasRate  = c.code in fxRates;
              return (
                <button
                  key={c.code}
                  onClick={() => selectCurrency(c.code)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                  style={{
                    background: selected ? "rgba(59,130,246,0.12)" : "transparent",
                    border:     selected ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                  }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-xs"
                    style={{ background:"var(--surface)", color:"var(--accent)", border:"1px solid var(--border)" }}>
                    {c.symbol.slice(0,3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium" style={{ color:"var(--ink)" }}>
                      {c.code} · {c.name}
                    </div>
                    <div className="text-[10px] truncate" style={{ color:"var(--subtle)" }}>
                      {c.flags.slice(0,4).join(" ")} {c.countries.slice(0,3).join(", ")}
                      {c.countries.length > 3 && ` +${c.countries.length-3}`}
                    </div>
                  </div>
                  {hasRate
                    ? <span className="text-[9px] font-mono" style={{ color:"var(--subtle)" }}>
                        {fxRates[c.code]?.toLocaleString(undefined,{maximumFractionDigits:2})}
                      </span>
                    : <span className="text-[9px]" style={{ color:"#f87171" }}>no rate</span>
                  }
                  {selected && <Check size={13} style={{ color:"var(--accent)" }}/>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline trigger row (used in SettingsModal) ────────────────────────────────
interface CurrencySwitcherProps {
  /** "inline" = small row with chevron; "fab" = floating action button */
  variant?: "inline" | "fab";
}

export function CurrencySwitcher({ variant = "inline" }: CurrencySwitcherProps) {
  const userCountry = useWalletStore(s => s.userCountry);
  const primaryFiat = useWalletStore(s => s.primaryFiat);
  const [open, setOpen] = useState<"country" | "currency" | null>(null);

  const country = COUNTRIES.find(c => c.code === userCountry);
  const meta    = CURRENCY_META[primaryFiat];

  if (variant === "fab") {
    return (
      <>
        <button
          onClick={() => setOpen("currency")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shadow-lg"
          style={{ background:"var(--surface)", border:"1px solid var(--border)", color:"var(--ink)" }}
        >
          <Globe size={12} style={{ color:"var(--accent)" }}/>
          {meta?.symbol ?? primaryFiat} {primaryFiat}
          <ChevronDown size={11} style={{ color:"var(--subtle)" }}/>
        </button>
        {open && <PickerModal mode={open} onClose={() => setOpen(null)}/>}
      </>
    );
  }

  return (
    <div className="space-y-2">
      {/* Country row */}
      <button
        onClick={() => setOpen("country")}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl"
        style={{ background:"var(--surface)", border:"1px solid var(--border)" }}
      >
        <span className="text-base">{country?.flag ?? "🌍"}</span>
        <div className="flex-1 text-left">
          <div className="text-xs font-medium" style={{ color:"var(--ink)" }}>
            {country?.name ?? "Select country"}
          </div>
          <div className="text-[10px]" style={{ color:"var(--subtle)" }}>Country</div>
        </div>
        <ChevronDown size={13} style={{ color:"var(--subtle)" }}/>
      </button>

      {/* Currency row */}
      <button
        onClick={() => setOpen("currency")}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl"
        style={{ background:"var(--surface)", border:"1px solid var(--border)" }}
      >
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background:"rgba(59,130,246,0.1)", color:"var(--accent)" }}>
          {(meta?.symbol ?? primaryFiat).slice(0,2)}
        </div>
        <div className="flex-1 text-left">
          <div className="text-xs font-medium" style={{ color:"var(--ink)" }}>
            {primaryFiat} · {meta?.name ?? "Currency"}
          </div>
          <div className="text-[10px]" style={{ color:"var(--subtle)" }}>Display currency</div>
        </div>
        <ChevronDown size={13} style={{ color:"var(--subtle)" }}/>
      </button>

      {open && <PickerModal mode={open} onClose={() => setOpen(null)}/>}
    </div>
  );
}
