/**
 * CountryOnboarding — first-launch country selector modal
 *
 * Shown once when `walletStore.userCountry` is still the default "US"
 * AND localStorage has no saved country preference.
 *
 * 1. Tries to geo-detect via timezone/language heuristic (no API call)
 * 2. Shows detected country as the suggestion with a "Use this" button
 * 3. Also shows searchable list of all 195 supported countries
 * 4. On confirm → sets country in walletStore + fiatStore, marks onboarded
 */
import { useState, useMemo, useEffect } from "react";
import { Search, MapPin, ChevronRight, Globe } from "lucide-react";
import { useCountry, detectCountryCode } from "@/hooks/useCountry";
import { COUNTRIES } from "@/store/marketplaceStore";
import { FIAT_COUNTRIES } from "@/store/fiatStore";

interface Props {
  onDone?: () => void;
}

const FIAT_CODES = new Set(FIAT_COUNTRIES.map(f => f.countryCode));

export function CountryOnboarding({ onDone = () => {} }: Props) {
  const { setCountry } = useCountry();
  const [query, setQuery]           = useState("");
  const detected = useMemo(() => {
    const code = detectCountryCode();
    return code && COUNTRIES.find(c => c.code === code) ? code : null;
  }, []);
  const [selected, setSelected]     = useState<string | null>(detected);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.currency.toLowerCase().includes(q)
    );
  }, [query]);

  const detectedCountry = detected ? COUNTRIES.find(c => c.code === detected) : null;
  const selectedCountry = selected ? COUNTRIES.find(c => c.code === selected) : null;

  function handleConfirm() {
    if (!selected) return;
    setCountry(selected);
    localStorage.setItem("financex_onboarded", "1");
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)" }}>
      <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl flex flex-col"
        style={{ background: "var(--surface)", maxHeight: "90vh" }}>

        {/* Header */}
        <div className="px-5 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "var(--accent)", opacity: 0.15 }}>
              <Globe size={18} style={{ color: "var(--accent)" }} />
            </div>
            <Globe size={18} className="absolute" style={{ color: "var(--accent)", marginLeft: "9px", marginTop: "9px" }} />
          </div>
          <h2 className="text-xl font-bold mt-2" style={{ color: "var(--ink)" }}>
            Where are you located?
          </h2>
          <p className="text-sm mt-1" style={{ color: "var(--subtle)" }}>
            Your country sets your local currency, payment methods, and supported services.
            You can change this anytime in Settings.
          </p>
        </div>

        {/* Geo-detected suggestion */}
        {detectedCountry && (
          <div className="px-5 mb-3 shrink-0">
            <div className="rounded-xl px-3.5 py-3 flex items-center gap-3 cursor-pointer"
              style={{
                background: selected === detected ? "rgba(99,102,241,0.15)" : "var(--surface-high)",
                border: `1px solid ${selected === detected ? "var(--accent)" : "var(--border)"}`,
              }}
              onClick={() => setSelected(detected)}>
              <MapPin size={14} style={{ color: "var(--accent)" }} className="shrink-0" />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <img
                  src={`https://flagcdn.com/w40/${detectedCountry.code.toLowerCase()}.png`}
                  alt={detectedCountry.code}
                  className="w-6 h-4 rounded-[2px] object-cover shrink-0"
                  onError={e => { e.currentTarget.style.display = "none"; }}
                />
                <span className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                  {detectedCountry.name}
                </span>
                <span className="text-xs shrink-0" style={{ color: "var(--subtle)" }}>
                  {detectedCountry.currency}
                  {FIAT_CODES.has(detectedCountry.code) && (
                    <span className="ml-1 px-1 rounded text-[9px]"
                      style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                      Supported
                    </span>
                  )}
                </span>
              </div>
              <span className="text-[10px] shrink-0" style={{ color: "var(--subtle)" }}>
                Detected
              </span>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-5 mb-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--subtle)" }} />
            <input
              className="w-full pl-8 pr-3 py-2 rounded-xl text-sm outline-none"
              style={{
                background: "var(--surface-high)",
                border: "1px solid var(--border)",
                color: "var(--ink)",
              }}
              placeholder="Search country or currency…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Country list */}
        <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: "var(--subtle)" }}>
              No countries match "{query}"
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(c => (
                <button
                  key={c.code}
                  onClick={() => setSelected(c.code)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left"
                  style={{
                    background: selected === c.code ? "rgba(99,102,241,0.12)" : "transparent",
                    border: `1px solid ${selected === c.code ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  <img
                    src={`https://flagcdn.com/w40/${c.code.toLowerCase()}.png`}
                    alt={c.code}
                    className="w-6 h-4 rounded-[2px] object-cover shrink-0"
                    onError={e => { e.currentTarget.style.display = "none"; }}
                  />
                  <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                    {c.name}
                  </span>
                  <span className="text-xs shrink-0" style={{ color: "var(--subtle)" }}>
                    {c.currency}
                  </span>
                  {FIAT_CODES.has(c.code) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pt-3 pb-6 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          {selectedCountry && (
            <div className="flex items-center gap-2 mb-3">
              <img
                src={`https://flagcdn.com/w40/${selectedCountry.code.toLowerCase()}.png`}
                alt={selectedCountry.code}
                className="w-5 h-3.5 rounded-[2px] object-cover"
                onError={e => { e.currentTarget.style.display = "none"; }}
              />
              <span className="text-sm" style={{ color: "var(--subtle)" }}>
                Selected: <strong style={{ color: "var(--ink)" }}>{selectedCountry.name}</strong>
                {" · "}{selectedCountry.currency}
              </span>
            </div>
          )}
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Continue
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => { setCountry("NG"); localStorage.setItem("financex_onboarded","1"); onDone(); }}
            className="w-full mt-2 py-2.5 text-sm"
            style={{ color: "var(--subtle)" }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
