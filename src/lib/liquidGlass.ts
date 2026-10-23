/**
 * Liquid Glass Interaction Engine v2
 * ------------------------------------
 * Global pointer-event listener providing:
 *   1. Water-drop ripple (2 concentric rings) on every tap
 *   2. Liquid morph press (border-radius squish) on pills/chips
 *   3. Spring-press scale on all buttons
 *   4. 3D pointer-tilt on glass cards (desktop)
 *   5. Specular sweep flash on tap
 *
 * Install once via installLiquidGlass() in main.tsx.
 * Zero per-component boilerplate.
 */

const INTERACTIVE = [
  "button","[role='button']","a","[data-ripple]",
  ".glass-btn",".glass-action-btn",".glass-card",".glass-pill","[tabindex='0']",
].join(",");

const MORPH_TARGETS = ["button","[role='button']",".glass-pill",".glass-btn",".glass-action-btn"];

/* ── Detect element type for ripple colour ─────────────────────────── */
function rippleColor(el: HTMLElement): string {
  const bg = window.getComputedStyle(el).background;
  if (/37,99,235|29,78,216|59,130,246/.test(bg)) return "rgba(255,255,255,0.50)";
  if (/16,163,74|22,163,74/.test(bg))             return "rgba(255,255,255,0.45)";
  if (/124,58,237|109,40,217/.test(bg))            return "rgba(255,255,255,0.42)";
  return "rgba(90,140,230,0.32)"; // glass surface — soft blue-white
}

/* ── Water-drop: spawn two concentric rings ────────────────────────── */
function spawnRipple(target: HTMLElement, cx: number, cy: number) {
  const cs = window.getComputedStyle(target);
  if (cs.position === "static") target.style.position = "relative";
  const hadOverflow = cs.overflow;
  const needsClip = hadOverflow !== "hidden" && hadOverflow !== "clip";
  if (needsClip) target.style.overflow = "hidden";

  const rect = target.getBoundingClientRect();
  const x = cx - rect.left;
  const y = cy - rect.top;
  const base = Math.max(rect.width, rect.height);
  const col  = rippleColor(target);

  // Ring 1 — main burst
  const r1 = makeRing(x, y, base * 2.4, col,
    `lg-drop-ring 560ms cubic-bezier(0.22,1,0.36,1) forwards`);
  // Ring 2 — softer trailing ring, slightly delayed
  const r2 = makeRing(x, y, base * 1.8, col.replace(/[\d.]+\)$/, "0.22)"),
    `lg-drop-ring-2 700ms 60ms cubic-bezier(0.22,1,0.36,1) forwards`);

  target.appendChild(r1);
  target.appendChild(r2);

  const cleanup = () => {
    r1.remove(); r2.remove();
    if (needsClip) target.style.overflow = "";
  };
  r1.addEventListener("animationend", cleanup, { once: true });
}

function makeRing(x: number, y: number, size: number, color: string, anim: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.style.cssText = `
    position:absolute;
    left:${x - size/2}px; top:${y - size/2}px;
    width:${size}px; height:${size}px;
    border-radius:50%;
    background:${color};
    pointer-events:none;
    transform:scale(0);
    animation:${anim};
    z-index:9998;
  `;
  return s;
}

/* ── Liquid morph press (pills / chip buttons) ─────────────────────── */
function isMorphTarget(el: HTMLElement): boolean {
  return MORPH_TARGETS.some(sel => {
    try { return el.matches(sel); } catch { return false; }
  });
}

/* ── Spring press ───────────────────────────────────────────────────── */
function applySpring(el: HTMLElement)   { el.classList.add("lg-pressed"); }
function releaseSpring(el: HTMLElement) { el.classList.remove("lg-pressed"); }

/* ── 3D tilt on glass cards (desktop pointer only, rAF-throttled) ───── */
let _tiltRaf = 0;
function handleTilt(e: PointerEvent) {
  if (_tiltRaf) return;               // already a frame queued — skip
  _tiltRaf = requestAnimationFrame(() => {
    _tiltRaf = 0;
    const card = (e.target as HTMLElement).closest?.(".glass-card") as HTMLElement | null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width  - 0.5;
    const py = (e.clientY - r.top)  / r.height - 0.5;
    card.style.transform = `perspective(700px) rotateX(${-py * 3.5}deg) rotateY(${px * 3.5}deg) scale(1.008)`;
    card.style.transition = "transform 0.06s linear";
  });
}
function resetTilt(e: PointerEvent) {
  const card = (e.target as HTMLElement).closest?.(".glass-card") as HTMLElement | null;
  if (!card) return;
  card.style.transform = "";
  card.style.transition = "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)";
}

/* ── Walk up the DOM to find the nearest interactive element ────────── */
function findInteractive(t: EventTarget | null): HTMLElement | null {
  let el = t as HTMLElement | null;
  for (let d = 0; el && d < 7; d++) {
    try { if (el.matches?.(INTERACTIVE)) return el; } catch { /* ignore */ }
    el = el.parentElement;
  }
  return null;
}

/* ── Main installer ─────────────────────────────────────────────────── */
let installed = false;

export function installLiquidGlass() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  /* Inject keyframes + global press rules */
  if (!document.getElementById("lg-styles")) {
    const st = document.createElement("style");
    st.id = "lg-styles";
    st.textContent = `
      /* Water-drop rings */
      @keyframes lg-drop-ring {
        0%   { transform:scale(0);   opacity:0.72; }
        50%  { opacity:0.45; }
        100% { transform:scale(2.8); opacity:0; }
      }
      @keyframes lg-drop-ring-2 {
        0%   { transform:scale(0);   opacity:0.38; }
        100% { transform:scale(2.2); opacity:0; }
      }
      /* Spring press */
      .lg-pressed {
        transform: scale(0.956) !important;
        transition: transform 0.08s cubic-bezier(0.4,0,1,1) !important;
      }
      /* Global interactive baseline */
      button,[role="button"],a,[tabindex="0"] {
        cursor:pointer;
        -webkit-tap-highlight-color:transparent;
        touch-action:manipulation;
        user-select:none;
      }
      /* Cards and glass buttons clip their ripples */
      .glass-card,.glass-card-strong,.glass-btn,.glass-action-btn,.glass-pill {
        position:relative;
        overflow:hidden;
      }
      /* Hover lift */
      .glass-card:hover,.glass-card-strong:hover {
        box-shadow:
          0 14px 44px rgba(15,23,42,0.14),
          0  4px 14px rgba(15,23,42,0.08),
          inset 0 1.5px 0 rgba(255,255,255,0.85),
          inset 0 -1px  0 rgba(200,215,240,0.35);
      }
      /* Enhanced active for anything the JS might miss */
      button:active,[role="button"]:active {
        transform:scale(0.960) !important;
        transition:transform 0.07s ease !important;
      }
    `;
    document.head.appendChild(st);
  }

  /* ── Tap handler ────────────────────────────────────────────────── */
  document.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = findInteractive(e.target);
    if (!el) return;
    if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") return;

    spawnRipple(el, e.clientX, e.clientY);
    applySpring(el);
    if (isMorphTarget(el)) {
      el.classList.remove("lg-morph");
      void el.offsetWidth; // reflow to restart animation
      el.classList.add("lg-morph");
      el.addEventListener("animationend", () => el.classList.remove("lg-morph"), { once: true });
    }

    const up = () => {
      releaseSpring(el);
      document.removeEventListener("pointerup",     up, { capture: true });
      document.removeEventListener("pointercancel", up, { capture: true });
    };
    document.addEventListener("pointerup",     up, { capture: true, once: true });
    document.addEventListener("pointercancel", up, { capture: true, once: true });
  }, { passive: true });

  /* ── 3D tilt — desktop only ─────────────────────────────────────── */
  if (window.matchMedia("(pointer:fine)").matches) {
    document.addEventListener("pointermove", handleTilt, { passive: true });
    document.addEventListener("pointerleave", resetTilt, { passive: true, capture: true });
  }
}
