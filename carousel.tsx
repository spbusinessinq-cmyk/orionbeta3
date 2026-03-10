@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-inter);
  --font-mono: var(--font-jetbrains);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

:root {
  --radius: 0.625rem;
  --background: #0b0b0d;
  --foreground: #e8e8e8;
  --card: #1a1a1d;
  --card-foreground: #e8e8e8;
  --popover: #1a1a1d;
  --popover-foreground: #e8e8e8;
  --primary: #b00020;
  --primary-foreground: #ffffff;
  --secondary: #121214;
  --secondary-foreground: #e8e8e8;
  --muted: #121214;
  --muted-foreground: #6b6b70;
  --accent: #b00020;
  --accent-foreground: #ffffff;
  --destructive: #ff1744;
  --border: #2a2a2d;
  --input: #2a2a2d;
  --ring: #b00020;
  --chart-1: #b00020;
  --chart-2: #ff1744;
  --chart-3: #ffab00;
  --chart-4: #00e676;
  --chart-5: #6b6b70;
  --sidebar: #121214;
  --sidebar-foreground: #e8e8e8;
  --sidebar-primary: #b00020;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #1a1a1d;
  --sidebar-accent-foreground: #e8e8e8;
  --sidebar-border: #2a2a2d;
  --sidebar-ring: #b00020;
  
  /* Custom colors */
  --bg: #0b0b0d;
  --surface: #121214;
  --card-bg: #1a1a1d;
  --border-custom: #2a2a2d;
  --accent-main: #b00020;
  --accent-dark: #8a0019;
  --breaking: #ff1744;
  --watch: #ffab00;
  --verified: #00e676;
  --muted-text: #6b6b70;
  --text-main: #e8e8e8;
}

* { 
  box-sizing: border-box; 
}

body { 
  font-family: "Inter", sans-serif; 
  background: #0b0b0d;
  color: #e8e8e8;
}

::-webkit-scrollbar { 
  width: 6px; 
  height: 6px; 
}
::-webkit-scrollbar-track { 
  background: #121214; 
}
::-webkit-scrollbar-thumb { 
  background: rgba(255,255,255,0.1); 
  border-radius: 3px; 
}
::-webkit-scrollbar-thumb:hover { 
  background: rgba(255,255,255,0.18); 
}

.panel-tab {
  position: fixed;
  top: 65%;
  transform: translateY(-50%);
  width: 32px;
  height: 120px;
  background: linear-gradient(180deg, #1e1e22 0%, #141416 100%);
  border: 1px solid rgba(255,255,255,0.09);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9999;
  transition: all 0.3s ease;
  box-shadow: 0 0 16px rgba(0,0,0,0.6);
}
.panel-tab:hover {
  background: linear-gradient(180deg, #242428 0%, #1a1a1e 100%);
  border-color: rgba(255,255,255,0.16);
  box-shadow: 0 0 20px rgba(0,0,0,0.8);
  width: 36px;
}
.panel-tab.left { 
  left: 0; 
  border-radius: 0 8px 8px 0;
  border-left: none;
}
.panel-tab.right { 
  right: 0; 
  border-radius: 8px 0 0 8px;
  border-right: none;
}
.panel-tab span {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  color: white;
  text-shadow: 0 1px 3px rgba(0,0,0,0.4);
}
.panel-tab .arrow {
  margin-top: 8px;
  transition: transform 0.3s ease;
}
.panel-tab.collapsed .arrow {
  transform: rotate(180deg);
}

.leaflet-container { 
  background: #0b0b0d; 
}
.leaflet-tile-pane { 
  filter: brightness(0.75) saturate(0.85) contrast(1.1); 
}

.leaflet-control-container {
  display: none !important;
}

/* ============================================
   TACTICAL SIGNAL MARKERS - Subtle Beacon Style
   ============================================ */

/* Base tactical marker icon (removes Leaflet defaults) */
.tactical-marker-icon {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.pin-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  cursor: pointer;
  transition: transform 0.2s ease-out;
}

.pin-wrapper:hover {
  transform: scale(1.15);
}

.pin-wrapper.pin-selected {
  transform: scale(1.25);
}

.pin-wrapper.pin-selected .pin-core {
  box-shadow: 0 0 6px currentColor, 0 0 12px currentColor;
}

.pin-wrapper.pin-selected .pin-halo {
  opacity: 0.5 !important;
}

/* Core node - small dim beacon light */
.pin-core {
  position: relative;
  z-index: 10;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 4px currentColor;
  transition: box-shadow 0.2s ease;
}

/* Size variants by threat level - subtle sizing */
.pin-threat-low .pin-core { width: 4px; height: 4px; }
.pin-threat-moderate .pin-core { width: 5px; height: 5px; }
.pin-threat-high .pin-core { width: 6px; height: 6px; }
.pin-threat-critical .pin-core { width: 7px; height: 7px; }

/* Glow halo - subtle ambient glow */
.pin-halo {
  position: absolute;
  border-radius: 50%;
  z-index: 5;
  pointer-events: none;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.pin-threat-low .pin-halo { 
  width: 12px; height: 12px; 
  box-shadow: 0 0 3px currentColor;
  opacity: 0.25;
}
.pin-threat-moderate .pin-halo { 
  width: 14px; height: 14px; 
  box-shadow: 0 0 4px currentColor;
  opacity: 0.3;
}
.pin-threat-high .pin-halo { 
  width: 16px; height: 16px; 
  box-shadow: 0 0 5px currentColor;
  opacity: 0.35;
}
.pin-threat-critical .pin-halo { 
  width: 18px; height: 18px; 
  box-shadow: 0 0 6px currentColor;
  opacity: 0.4;
}

/* Pulse ring - very slow subtle pulse */
.pin-pulse {
  position: absolute;
  border-radius: 50%;
  border: 1px solid currentColor;
  opacity: 0;
  pointer-events: none;
  top: 50%;
  left: 50%;
  animation: beacon-pulse 5s ease-out infinite;
}

.pin-threat-low .pin-pulse { animation-delay: 0s; animation-duration: 6s; }
.pin-threat-moderate .pin-pulse { animation-delay: 1.5s; animation-duration: 5.5s; }
.pin-threat-high .pin-pulse { animation-delay: 0.8s; animation-duration: 4.5s; }
.pin-threat-critical .pin-pulse { animation-delay: 0s; animation-duration: 4s; }

/* ── Zoom-based cluster markers — tactical intel style ─────────────────── */
.cluster-marker-icon {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.cluster-marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgba(8, 8, 10, 0.94);
  border: 1.5px solid;
  cursor: pointer;
  position: relative;
  transition: transform 0.18s ease;
  backdrop-filter: blur(6px);
}

.cluster-marker:hover {
  transform: scale(1.12);
}

.cluster-count {
  font-family: 'JetBrains Mono', 'Courier New', monospace;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
  position: relative;
  z-index: 2;
}

/* Soft pulse ring — only on high-density clusters (count >= 25) */
@keyframes cluster-pulse {
  0%   { width: 26px; height: 26px; opacity: 0.35; transform: translate(-50%, -50%); }
  100% { width: 42px; height: 42px; opacity: 0; transform: translate(-50%, -50%); }
}

.cluster-pulse::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  border-radius: 50%;
  border: 1px solid currentColor;
  animation: cluster-pulse 3.5s ease-out infinite;
  pointer-events: none;
}

/* ── Pin tier hierarchy ──────────────────────────────────────────────────── */

/* Breaking — highest presence, red, strong pulse */
.pin-breaking { color: #ff1744; }
.pin-breaking .pin-core {
  box-shadow: 0 0 5px #ff1744, 0 0 2px rgba(255,23,68,0.6);
}
.pin-breaking .pin-halo {
  background: radial-gradient(circle, rgba(255,23,68,0.18) 0%, transparent 68%);
}
.pin-breaking .pin-pulse {
  border-color: rgba(255,23,68,0.42);
}

/* Watch — amber, controlled pulse */
.pin-watch { color: #ffab00; }
.pin-watch .pin-core {
  box-shadow: 0 0 4px #ffab00, 0 0 2px rgba(255,171,0,0.4);
}
.pin-watch .pin-halo {
  background: radial-gradient(circle, rgba(255,171,0,0.12) 0%, transparent 68%);
}
.pin-watch .pin-pulse {
  border-color: rgba(255,171,0,0.32);
}

/* Verified — premium teal/green, clean halo */
.pin-verified { color: #00e676; }
.pin-verified .pin-core {
  box-shadow: 0 0 4px #00e676, 0 0 2px rgba(0,230,118,0.35);
}
.pin-verified .pin-halo {
  background: radial-gradient(circle, rgba(0,230,118,0.11) 0%, transparent 68%);
}
.pin-verified .pin-pulse {
  border-color: rgba(0,230,118,0.28);
}

/* Country-level Watch/Verified: secondary tactical presence — dimmer, slower pulse */
.pin-country-level {
  opacity: 0.62;
}
.pin-country-level .pin-pulse {
  animation: country-pulse 10s ease-out infinite;
  animation-delay: 2s;
}
.pin-country-level .pin-halo {
  opacity: 0.35;
}
.pin-country-level .pin-core {
  box-shadow: 0 0 2px currentColor !important;
}

/* Slow beacon pulse animation */
@keyframes beacon-pulse {
  0% { 
    width: 6px; 
    height: 6px; 
    opacity: 0.4;
    transform: translate(-50%, -50%) scale(1);
  }
  40% { 
    opacity: 0.2;
  }
  100% { 
    width: 28px; 
    height: 28px; 
    opacity: 0;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* Country-level secondary pulse — slower, smaller expansion than beacon-pulse */
@keyframes country-pulse {
  0% {
    width: 6px;
    height: 6px;
    opacity: 0.22;
    transform: translate(-50%, -50%) scale(1);
  }
  40% {
    opacity: 0.1;
  }
  100% {
    width: 20px;
    height: 20px;
    opacity: 0;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* Legacy support - keep old classes working */
.pin-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  position: relative;
  z-index: 10;
  box-shadow: 0 0 6px currentColor;
}

.pin-glow {
  position: absolute;
  border-radius: 50%;
  opacity: 0;
  animation: gentle-pulse 3s ease-in-out infinite;
}

.pin-glow-1 { width: 20px; height: 20px; animation-delay: 0s; }
.pin-glow-2 { width: 30px; height: 30px; animation-delay: 1s; }
.pin-glow-3 { width: 40px; height: 40px; animation-delay: 2s; }

.pin-breaking .pin-dot { background: #ff1744; color: #ff1744; }
.pin-breaking .pin-glow { border: 1px solid rgba(255, 23, 68, 0.4); box-shadow: 0 0 8px rgba(255, 23, 68, 0.2); }

.pin-watch .pin-dot { background: #ffab00; color: #ffab00; }
.pin-watch .pin-glow { border: 1px solid rgba(255, 171, 0, 0.35); box-shadow: 0 0 8px rgba(255, 171, 0, 0.15); }

.pin-verified .pin-dot { background: #00e676; color: #00e676; }
.pin-verified .pin-glow { border: 1px solid rgba(0, 230, 118, 0.35); box-shadow: 0 0 8px rgba(0, 230, 118, 0.15); }

@keyframes gentle-pulse {
  0% { transform: scale(0.5); opacity: 0; }
  50% { opacity: 0.5; }
  100% { transform: scale(1.2); opacity: 0; }
}

.spy-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: 
    linear-gradient(rgba(176, 0, 32, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(176, 0, 32, 0.02) 1px, transparent 1px);
  background-size: 60px 60px;
  z-index: 500;
}

.feed-item { 
  transition: all 0.2s ease; 
}
.feed-item.active {
  background: linear-gradient(90deg, rgba(176, 0, 32, 0.2) 0%, transparent 100%);
  border-left: 3px solid #b00020;
}
.feed-item:hover { 
  background: rgba(26, 26, 29, 0.8); 
}

.tier-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  padding: 3px 8px;
  border-radius: 3px;
  text-transform: uppercase;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #2a2a2d;
  border-top-color: #b00020;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { 
  to { transform: rotate(360deg); } 
}

.panel-wrapper {
  position: fixed;
  top: 56px;
  bottom: 0;
  width: 380px;
  z-index: 9998;
  pointer-events: none;
}
.panel-wrapper.left { left: 0; }
.panel-wrapper.right { right: 0; }

/* Only the side-panel itself receives pointer events */
.side-panel {
  pointer-events: auto;
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease;
}
.side-panel.collapsed {
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
}
.side-panel.right.collapsed {
  transform: translateX(100%);
}

.map-hint {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(12, 12, 15, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 10px;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.28);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: "JetBrains Mono", monospace;
}
.map-hint svg { color: rgba(255,255,255,0.18); }

.filter-scroll-container {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 12px 16px;
  background: rgba(18, 18, 20, 0.95);
  border-bottom: 1px solid #2a2a2d;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) #121214;
}

.filter-scroll-container::-webkit-scrollbar { height: 4px; }
.filter-scroll-container::-webkit-scrollbar-track { background: #121214; }
.filter-scroll-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

.filter-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.25s ease;
  border: 2px solid transparent;
  background: #1a1a1d;
  white-space: nowrap;
  flex-shrink: 0;
}

.filter-chip:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.14);
}

.filter-chip.selected {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.28);
}

.filter-chip.selected .filter-chip-label { color: #fff; }

.filter-chip-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 0.25s ease;
}

.filter-chip.selected .filter-chip-dot { box-shadow: 0 0 10px currentColor; }

.filter-chip-dot.all { background: #e8e8e8; }
.filter-chip-dot.breaking { background: #ff1744; }
.filter-chip-dot.watch { background: #ffab00; }
.filter-chip-dot.verified { background: #00e676; }

.filter-chip-label {
  font-size: 12px;
  font-weight: 600;
  color: #a0a0a5;
  transition: color 0.25s ease;
}

.filter-chip-count {
  font-size: 11px;
  font-family: "JetBrains Mono", monospace;
  color: #6b6b70;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 8px;
  border-radius: 10px;
  transition: all 0.25s ease;
}

.filter-chip.selected .filter-chip-count {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.current-filter-display {
  background: rgba(7, 7, 9, 0.90);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 8px 40px rgba(0, 0, 0, 0.75);
  border-radius: 10px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.current-filter-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #8a8a92;
  text-transform: uppercase;
}

.current-filter-value {
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 6px;
}

.current-filter-dot { 
  width: 8px; 
  height: 8px; 
  border-radius: 50%; 
}

.state-hidden { display: none !important; }

.single-pin-mode {
  background: rgba(7, 7, 9, 0.90);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 8px 40px rgba(0, 0, 0, 0.75);
  border-radius: 10px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.single-pin-mode:hover { background: rgba(32, 32, 38, 0.98); border-color: rgba(255,255,255,0.18); }
.single-pin-mode span { font-size: 11px; font-weight: 600; color: #fff; }

.map-border-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.4);
  z-index: 600;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* ============================================
   O.R.I.O.N. PREMIUM UI SYSTEM
   Glass panel, command surface, scan line
   ============================================ */

/* Primary glass surface — all map overlay HUD panels */
.orion-glass {
  background: rgba(7, 7, 9, 0.90);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 8px 40px rgba(0, 0, 0, 0.75),
    0 1px 0 rgba(0, 0, 0, 0.5);
}

/* Glass divider — horizontal rule inside panels */
.orion-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.05);
  margin: 0 -12px;
}

/* System label — panel section heading text */
.orion-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.32);
}

/* Data value — monospace metric value */
.orion-mono {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.72);
  font-variant-numeric: tabular-nums;
}

/* Accent bar — left-side colored stripe for panel section headers */
.orion-accent-bar {
  border-left: 2px solid rgba(255, 255, 255, 0.13);
  padding-left: 8px;
}

/* Header scan line — subtle bottom highlight under command bar */
.orion-header-scanline::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.04) 20%,
    rgba(255, 255, 255, 0.08) 50%,
    rgba(255, 255, 255, 0.04) 80%,
    transparent 100%
  );
}

/* Status rail — right side of header — system command strip */
.orion-status-pill {
  display: flex;
  align-items: stretch;
  gap: 0;
  background: rgba(5, 5, 7, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 6px;
  backdrop-filter: blur(16px);
  overflow: hidden;
}

.orion-status-pill .seg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  padding: 6px 14px;
}

.orion-status-pill .seg + .seg {
  border-left: 1px solid rgba(255, 255, 255, 0.05);
}

/* Horizontal layout variant (for status + value inline) */
.orion-status-pill .seg.row {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.orion-status-pill .seg-label {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.30);
  white-space: nowrap;
  font-family: "JetBrains Mono", monospace;
}

.orion-status-pill .seg-value {
  font-family: "JetBrains Mono", monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.82);
  font-weight: 600;
}

/* ── Tactical command button — hard-edged system action ─────────────────── */
.orion-cmd-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 14px;
  background: transparent;
  border: 1px solid rgba(176, 0, 32, 0.35);
  border-radius: 4px;
  font-family: "JetBrains Mono", monospace;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(176, 0, 32, 0.7);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  white-space: nowrap;
}

.orion-cmd-btn:hover {
  background: rgba(176, 0, 32, 0.12);
  border-color: rgba(176, 0, 32, 0.65);
  color: #e53935;
}

.orion-cmd-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.orion-cmd-btn:disabled:hover {
  background: transparent;
  border-color: rgba(176, 0, 32, 0.35);
  color: rgba(176, 0, 32, 0.7);
}

/* ── Panel section title — stronger than orion-label ────────────────────── */
.orion-section-title {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.42);
  font-family: "JetBrains Mono", monospace;
}

/* Layer dot — active layer indicator in Intel HUD */
.orion-layer-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Feed item — premium variant */
.feed-item-orion {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.15s ease;
}

.feed-item-orion:hover {
  background: rgba(255, 255, 255, 0.02);
}

.feed-item-orion.active {
  background: linear-gradient(90deg, rgba(176, 0, 32, 0.15) 0%, transparent 100%);
  border-left: 2px solid #b00020;
}

/* ============================================
   O.R.I.O.N. MOTION SYSTEM — restrained tactical animations
   ============================================ */

@keyframes orion-status-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 5px #00e676, 0 0 10px rgba(0,230,118,0.3); }
  50%       { opacity: 0.55; box-shadow: 0 0 3px #00e676; }
}

@keyframes orion-glow-breathe {
  0%, 100% {
    box-shadow: 0 0 10px rgba(0,200,150,0.12), inset 0 0 8px rgba(0,200,150,0.04);
    border-color: rgba(0,200,150,0.28);
    color: rgba(0,200,150,0.7);
  }
  50% {
    box-shadow: 0 0 20px rgba(0,200,150,0.26), inset 0 0 14px rgba(0,200,150,0.09);
    border-color: rgba(0,200,150,0.48);
    color: rgba(0,200,150,0.9);
  }
}

@keyframes orion-dot-flicker {
  0%, 100% { opacity: 1; }
  45%       { opacity: 0.38; }
  55%       { opacity: 0.38; }
}

@keyframes orion-tab-glow {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}

@keyframes orion-cmd-breathe {
  0%, 100% { border-color: rgba(176,0,32,0.35); }
  50%       { border-color: rgba(176,0,32,0.62); }
}

/* Utility classes */
.orion-live-dot {
  animation: orion-status-pulse 2.8s ease-in-out infinite;
}

.orion-badge-live {
  animation: orion-glow-breathe 3.6s ease-in-out infinite;
}

.orion-layer-dot-live {
  animation: orion-dot-flicker 2.4s ease-in-out infinite;
}

.orion-tab-underline-live {
  animation: orion-tab-glow 2.2s ease-in-out infinite;
}

.orion-cmd-btn {
  animation: orion-cmd-breathe 4s ease-in-out infinite;
}
.orion-cmd-btn:disabled {
  animation: none;
}

/* ── Orion belt star marker animation ──────────────────────────────────── */
@keyframes orion-belt-shimmer {
  0%, 100% {
    filter:
      drop-shadow(0 0 6px rgba(255,255,255,0.75))
      drop-shadow(0 0 12px rgba(255,255,255,0.35));
  }
  50% {
    filter:
      drop-shadow(0 0 10px rgba(220,235,255,0.95))
      drop-shadow(0 0 20px rgba(200,220,255,0.55));
  }
}

.orion-belt {
  animation: orion-belt-shimmer 9s ease-in-out infinite;
}

/* Individual star shimmer — brightness-only, no movement */
@keyframes orion-star-a {
  0%, 100% { opacity: 0.78; }
  50%       { opacity: 1.00; }
}
@keyframes orion-star-b {
  0%, 100% { opacity: 1.00; }
  50%       { opacity: 0.85; }
}
@keyframes orion-star-c {
  0%, 100% { opacity: 0.82; }
  50%       { opacity: 1.00; }
}

/* Mintaka — left */
.orion-belt circle:nth-child(1) { animation: orion-star-a  8s ease-in-out infinite 0s;   }
/* Alnilam — center (brightest) */
.orion-belt circle:nth-child(3) { animation: orion-star-b  9s ease-in-out infinite 2.5s; }
/* Alnitak — right */
.orion-belt circle:nth-child(5) { animation: orion-star-c 10s ease-in-out infinite 5s;   }

/* ── Warning panel glow — ESCALATION WATCH / HIGH THREAT EVENTS headings ── */
@keyframes orion-warning-breathe {
  0%, 100% {
    text-shadow:
      0 0 6px rgba(255, 107, 53, 0.28),
      0 0 14px rgba(255, 107, 53, 0.10);
  }
  50% {
    text-shadow:
      0 0 9px rgba(255, 107, 53, 0.45),
      0 0 20px rgba(255, 107, 53, 0.18);
  }
}

.orion-warning-glow {
  animation: orion-warning-breathe 4.5s ease-in-out infinite;
}

/* ── Ingest state overrides ─────────────────────────────────────────────── */
@keyframes orion-sync-pulse {
  0%, 100% { border-color: rgba(0, 200, 150, 0.38); box-shadow: 0 0 5px rgba(0,200,150,0.08); }
  50%       { border-color: rgba(0, 200, 150, 0.68); box-shadow: 0 0 10px rgba(0,200,150,0.16); }
}
@keyframes orion-error-pulse {
  0%, 100% { border-color: rgba(255, 23, 68, 0.45); }
  50%       { border-color: rgba(255, 23, 68, 0.75); }
}

.orion-ingest-syncing {
  border-color: rgba(0, 200, 150, 0.38) !important;
  color: rgba(0, 200, 150, 0.85) !important;
  animation: orion-sync-pulse 1.4s ease-in-out infinite !important;
}
.orion-ingest-syncing:hover {
  background: rgba(0, 200, 150, 0.08) !important;
  color: rgba(0, 200, 150, 1) !important;
}

.orion-ingest-live {
  border-color: rgba(0, 200, 150, 0.30) !important;
  color: rgba(0, 200, 150, 0.72) !important;
  animation: none !important;
}
.orion-ingest-live:hover {
  background: rgba(0, 200, 150, 0.07) !important;
  border-color: rgba(0, 200, 150, 0.55) !important;
  color: rgba(0, 200, 150, 0.9) !important;
}

.orion-ingest-error {
  border-color: rgba(255, 23, 68, 0.50) !important;
  color: rgba(255, 23, 68, 0.88) !important;
  animation: orion-error-pulse 2s ease-in-out infinite !important;
}
.orion-ingest-error:hover {
  background: rgba(255, 23, 68, 0.10) !important;
  border-color: rgba(255, 23, 68, 0.75) !important;
  color: #ff1744 !important;
}

/* ============================================
   Intel Tooltip Styles */
.intel-tooltip {
  background: rgba(18, 18, 20, 0.98) !important;
  border: 1px solid #2a2a2d !important;
  border-radius: 8px !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5) !important;
  padding: 10px 12px !important;
  pointer-events: none !important;
}

.intel-tooltip::before {
  border-top-color: #2a2a2d !important;
}

.intel-tooltip::after {
  border-top-color: rgba(18, 18, 20, 0.98) !important;
}

/* Leaflet tooltip arrow fix for dark theme */
.leaflet-tooltip-left.intel-tooltip::before {
  border-left-color: #2a2a2d !important;
}

.leaflet-tooltip-right.intel-tooltip::before {
  border-right-color: #2a2a2d !important;
}

.leaflet-tooltip-bottom.intel-tooltip::before {
  border-bottom-color: #2a2a2d !important;
}

.leaflet-tooltip-top.intel-tooltip::before {
  border-top-color: #2a2a2d !important;
}

/* ============================================
   Pin hover preview card
   ============================================ */
.orion-hover-preview {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
  background: rgba(7, 7, 9, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 10px 13px;
  max-width: 240px;
  min-width: 160px;
}

.orion-hover-preview-tier {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 5px;
}

.orion-hover-preview-title {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.80);
  line-height: 1.4;
  margin-bottom: 7px;
}

.orion-hover-preview-row {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.32);
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.3px;
  line-height: 1.5;
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.orion-hover-preview-row .label {
  color: rgba(255, 255, 255, 0.18);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  font-size: 8px;
  flex-shrink: 0;
}

/* ── Panel aurora glow — ambient white halo on key intelligence panels ── */
.orion-panel-aurora {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 8px 40px rgba(0, 0, 0, 0.75),
    0 1px 0 rgba(0, 0, 0, 0.5),
    0 0 16px rgba(255, 255, 255, 0.08),
    0 0 32px rgba(255, 255, 255, 0.05);
}

/* ── Sensor layer markers ─────────────────────────────────────────────── */

/* Thermal anomaly — orange pulse */
@keyframes sensor-thermal-ring {
  0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.6; }
  100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
}

.sensor-thermal-marker {
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 160, 30, 1) 0%, rgba(255, 90, 0, 0.9) 60%, rgba(255, 60, 0, 0.6) 100%);
  border: 1px solid rgba(255, 160, 60, 0.55);
  box-shadow: 0 0 6px rgba(255, 110, 0, 0.55), 0 0 12px rgba(255, 70, 0, 0.25);
  animation: sensor-thermal-pulse 2.4s ease-in-out infinite;
}
.sensor-thermal-marker::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  width: 160%; height: 160%;
  border-radius: 50%;
  background: rgba(255, 111, 0, 0.18);
  animation: sensor-thermal-ring 2.4s ease-out infinite;
}

@keyframes sensor-thermal-pulse {
  0%   { box-shadow: 0 0 5px rgba(255,110,0,0.5), 0 0 10px rgba(255,70,0,0.2); }
  50%  { box-shadow: 0 0 9px rgba(255,140,0,0.7), 0 0 18px rgba(255,90,0,0.35); }
  100% { box-shadow: 0 0 5px rgba(255,110,0,0.5), 0 0 10px rgba(255,70,0,0.2); }
}

/* Seismic event — purple pulse */
@keyframes sensor-seismic-ring {
  0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.55; }
  100% { transform: translate(-50%, -50%) scale(2.8); opacity: 0; }
}

.sensor-seismic-marker {
  position: relative;
  border-radius: 50%;
  background: rgba(171, 71, 188, 0.85);
  border: 1px solid rgba(206, 147, 216, 0.6);
  box-shadow: 0 0 6px rgba(156, 39, 176, 0.5);
}
.sensor-seismic-marker::after {
  content: '';
  position: absolute;
  top: 50%; left: 50%;
  width: 100%; height: 100%;
  border-radius: 50%;
  background: rgba(171, 71, 188, 0.35);
  animation: sensor-seismic-ring 2.8s ease-out infinite;
}

/* Aircraft marker — cyan triangle */
.sensor-aircraft-marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: rgba(0, 229, 255, 0.9);
  font-size: 13px;
  line-height: 1;
  text-shadow: 0 0 5px rgba(0, 229, 255, 0.6);
  filter: drop-shadow(0 0 3px rgba(0, 200, 255, 0.5));
}
