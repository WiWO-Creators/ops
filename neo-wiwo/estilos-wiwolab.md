# Sistema de estilos — WiwoLab

Referencia **completa y autocontenida** de todos los tokens, estilos, componentes y efectos del proyecto, separados por **modo claro** y **modo oscuro**. Todo lo necesario está en este archivo.

Tema **claro por defecto**; la clase **`.dark`** en el `<html>`/`<body>` activa el modo oscuro.

## Cómo se consumen los tokens

- **Tokens shadcn** (`--background`, `--foreground`, `--card`, `--primary`, `--accent`, `--border`, `--ring`, `--muted-foreground`) → están en **formato HSL sin `hsl()`** (`60 20% 99%`). Se usan con **`hsl(var(--token))`** y Tailwind los expone como clases (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, `bg-card`, `text-muted-foreground`, etc.).
- **Tokens Wiwo** (`--ink`, `--surface`, `--line`, gradientes, sombras, etc.) → están en **hex/rgba/valor final**. Se usan **directo con `var(--token)`**.

> ⚠️ **Gotcha de `--muted`:** está definido **dos veces**. La capa shadcn lo define como triplete HSL (`48 18% 95%`), y la capa Wiwo lo **pisa** con un hex (`#66645D`). Como la capa Wiwo va después, **gana el hex** → `var(--muted)` = color de texto atenuado Wiwo, y **`hsl(var(--muted))` es inválido**. Para el "muted" de fondo shadcn usá `bg-muted` (Tailwind); para texto atenuado, `hsl(var(--muted-foreground))`.

---

# 🎨 Tokens de color — Claro vs Oscuro

Solo se listan aquí los tokens **cuyo valor cambia** entre modos. Lo que no cambia está en [Tokens compartidos](#-tokens-compartidos-no-cambian-entre-modos).

## Base y superficies (shadcn · HSL · `hsl(var(--x))`)

| Token | Claro | Oscuro |
|---|---|---|
| `--background` | `60 20% 99%` | `0 0% 7%` |
| `--foreground` | `0 0% 12%` | `60 20% 96%` |
| `--card` | `0 0% 100%` | `0 0% 13%` |
| `--card-foreground` | `0 0% 12%` | `60 20% 96%` |
| `--primary` | `240 100% 63%` (#4242FF) | `240 100% 69%` |
| `--primary-foreground` | `0 0% 100%` | `0 0% 100%` |
| `--accent` | `106 100% 50%` (#3BFF00) | `106 100% 52%` |
| `--accent-foreground` | `0 0% 16%` (#292929) | `60 20% 96%` (beige) |
| `--muted` (shadcn) | `48 18% 95%` | `0 0% 16%` (⚠️ pisado por la capa Wiwo) |
| `--muted-foreground` | `30 5% 42%` | `0 0% 64%` |
| `--border` | `48 16% 90%` | `0 0% 20%` |
| `--ring` | `240 100% 63%` | `240 100% 69%` |

## Semánticos Wiwo (hex/rgba · `var(--x)`)

| Token | Claro | Oscuro |
|---|---|---|
| `--ink` | `#292929` | `#F8FAD7` |
| `--ink-2` | `#3F3F3F` | `#EDEFDD` |
| `--muted` (Wiwo) | `#66645D` | `rgba(248,250,215,.66)` |
| `--muted-inverse` | `rgba(248,250,215,.74)` | `rgba(41,41,41,.68)` |
| `--surface` | `#F8FAD7` | `#292929` |
| `--surface-2` | `#EDEFDD` | `#303030` |
| `--surface-3` | `#E8F0FE` | `#343434` |
| `--surface-container-low` | `#F8FAD7` | `#303030` |
| `--surface-container` | `#EDEFDD` | `#363636` |
| `--surface-container-high` | `#EDEFDD` | `#424242` |
| `--surface-inverse` | `#292929` | `#F8FAD7` |
| `--ink-inverse` | `#F8FAD7` | `#292929` |
| `--line` | `#D8D2C4` | `rgba(248,250,215,.16)` |
| `--control-surface` | `rgba(255,253,233,.76)` | `rgba(255,255,255,.06)` |
| `--control-surface-hover` | `#FFFFFF` | `rgba(255,255,255,.1)` |
| `--on-accent` | `#292929` | `#292929` |
| `--error` | `#BA1A1A` | `#FFB4AB` |
| `--error-soft` | `rgba(186,26,26,.1)` | `rgba(255,180,171,.14)` |
| `--focus-ring` | `rgba(66,66,255,.52)` (azul) | `rgba(59,255,0,.72)` (verde) |
| `--focus-glow` | `rgba(66,66,255,.16)` | `rgba(59,255,0,.18)` |
| `--chart-grid` | `rgba(41,41,41,.12)` | `rgba(248,250,215,.16)` |

## Gráficos — paleta categórica (5 herramientas)

Orden **fijo**, nunca ciclado. No es un volteo automático: son pasos elegidos y validados contra cada fondo. El color **nunca identifica una serie solo**: siempre con leyenda/etiquetas.

| Token | Herramienta | Claro | Oscuro |
|---|---|---|---|
| `--chart-1` | CHAT / WiwoBot | `#2a78d6` | `#3987e5` |
| `--chart-2` | IMAGE / Imagen | `#1baf7a` | `#199e70` |
| `--chart-3` | VIDEO / Film | `#eda100` | `#c98500` |
| `--chart-4` | MUSIC / Música | `#008300` | `#008300` |
| `--chart-5` | PPT / Presentaciones | `#4a3aa7` | `#9085e9` |

## Semáforo de precio (cost tiers)

El color **nunca va solo**: siempre acompañado del precio en texto.

| Token | Nivel | Claro | Oscuro |
|---|---|---|---|
| `--cost-low` | barato | `#0B7A46` | `#12A36C` |
| `--cost-mid` | moderado | `#B08800` | `#B78A10` |
| `--cost-high` | caro | `#8C3B00` | `#A9541C` |
| `--cost-max` | muy caro | `#C51E2E` | `#E85C55` |

## Sombra dependiente del modo

| Token | Claro | Oscuro |
|---|---|---|
| `--shadow-glass` | `0 26px 76px rgba(41,41,41,.22), inset 0 1px 0 rgba(255,255,255,.7), inset 0 -1px 0 rgba(255,255,255,.2)` | `0 26px 76px rgba(0,0,0,.4), inset 0 1px 0 rgba(248,250,215,.08), inset 0 -1px 0 rgba(0,0,0,.2)` |

_(Las demás sombras — `--shadow-1/2/expressive` — no cambian; ver compartidos.)_

## Glass (`.wiwo-glass`)

| Propiedad | Claro | Oscuro (`.dark .wiwo-glass`) |
|---|---|---|
| `background` | `var(--glass-fill)` = `rgba(255,255,255,.24)` | `var(--glass-fill-dark)` = `rgba(41,41,41,.34)` |
| `border-color` | `var(--glass-stroke)` = `rgba(255,255,255,.42)` | `rgba(248,250,215,.12)` |

## Aurora de fondo (`.aurora-bg::before`) — opacidades por modo

| Capa | Claro | Oscuro |
|---|---|---|
| Verde (12% 28%) | `rgba(59,255,0,0.13)` | `rgba(59,255,0,0.07)` |
| Azul (72% 18%) | `rgba(66,66,255,0.10)` | `rgba(66,66,255,0.06)` |

---

# 🔒 Tokens compartidos (no cambian entre modos)

## Primitivos de marca

| Token | Valor |
|---|---|
| `--wiwo-blue` | `#4242FF` |
| `--wiwo-blue-deep` | `#2e2ee6` |
| `--wiwo-blue-700` | `#2F31D9` |
| `--wiwo-purple` | `#8d7cff` |
| `--wiwo-green` | `#3BFF00` |
| `--wiwo-cyan` | `#00c2ff` |
| `--wiwo-beige` | `#F8FAD7` |
| `--wiwo-beige-alt` | `#EDEFDD` |
| `--wiwo-ink` | `#292929` |
| `--wiwo-gradient-primary` | `linear-gradient(103deg, #3BFF00 0%, #4242FF 100%)` |

## Colores de estado y acento

| Token | Valor |
|---|---|
| `--ok` | `#0F7A34` |
| `--warn` | `#9B6600` |
| `--danger` | `#BA1A1A` |
| `--accent-coral` | `#FF6F61` |
| `--accent-sky` | `#A8C7FA` |
| `--accent-mint` | `#C3ECD0` |

## Data-viz (paleta semántica)

| Token | Valor |
|---|---|
| `--chart-primary` | `#4242FF` |
| `--chart-positive` | `#3BFF00` |
| `--chart-attention` | `#A8C7FA` |
| `--chart-warning` | `#FFB84D` |
| `--chart-danger` | `#BA1A1A` |
| `--chart-neutral` | `#8B8B7A` |
| `--chart-purple` | `#8D7CFF` |
| `--chart-mint` | `#C3ECD0` |

## Sombras (no cambian)

| Token | Valor |
|---|---|
| `--shadow-1` | `0 1px 2px rgba(41,41,41,.08), 0 8px 28px rgba(41,41,41,.08)` |
| `--shadow-2` | `0 18px 42px rgba(41,41,41,.16)` |
| `--shadow-expressive` | `0 24px 70px rgba(66,66,255,.18), 0 8px 28px rgba(41,41,41,.12)` |

## Formas / radios

| Token | Valor |
|---|---|
| `--shape-xs` | `6px` |
| `--shape-sm` | `12px` |
| `--shape-md` | `18px` |
| `--shape-lg` | `28px` |
| `--shape-xl` | `40px` |
| `--shape-full` | `999px` |
| `--radius-card` | `8px` |
| `--radius-control` | `999px` |

## Tipografía

| Token | Valor |
|---|---|
| `--font-system` | `"Plus Jakarta Sans", Arial, sans-serif` |
| `--font-mono` | `ui-monospace, SFMono-Regular, Consolas, monospace` |
| `--step--1` | `clamp(.82rem, .79rem + .16vw, .92rem)` |
| `--step-0` | `clamp(.96rem, .92rem + .24vw, 1.08rem)` |
| `--step-1` | `clamp(1.16rem, 1.04rem + .55vw, 1.42rem)` |
| `--step-2` | `clamp(1.42rem, 1.16rem + 1.12vw, 2.05rem)` |
| `--step-3` | `clamp(2.1rem, 1.54rem + 2.24vw, 3.5rem)` |
| `--step-4` | `clamp(3rem, 2.16rem + 3.6vw, 5.7rem)` |

**Medidas de línea:** `--measure-display: 12ch` · `--measure-lead: 36ch` · `--measure-body: 62ch`

**Pesos:** `--weight-body: 400` · `--weight-meta: 500` · `--weight-nav: 600` · `--weight-action: 700` · `--weight-display: 800`

## Spacing (escala 4px)

| Token | Valor |
|---|---|
| `--space-1` | `.25rem` (4px) |
| `--space-2` | `.5rem` (8px) |
| `--space-2-5` | `.625rem` (10px) |
| `--space-3` | `.75rem` (12px) |
| `--space-4` | `1rem` (16px) |
| `--space-5` | `1.5rem` (24px) |
| `--space-6` | `2rem` (32px) |
| `--space-7` | `3rem` (48px) |
| `--space-8` | `4.5rem` (72px) |

**Padding responsive:** `--ui-card-pad: clamp(1rem, 1.45vw, 1.45rem)` · `--ui-panel-pad: clamp(1.2rem, 2.2vw, 2rem)` · `--ui-section-pad: clamp(3.4rem, 6vw, 4.8rem)`

## Iconos

| Token | Valor |
|---|---|
| `--icon-size-sm` | `18px` |
| `--icon-size-md` | `20px` |
| `--icon-size-lg` | `24px` |
| `--icon-stroke` | `2` |

## Movimiento

| Token | Valor |
|---|---|
| `--motion-fast` | `160ms` |
| `--motion-medium` | `280ms` |
| `--motion-slow` | `420ms` |
| `--motion-loop` | `6800ms` |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` |
| `--ease-spring` | `cubic-bezier(0.34, 1.4, 0.64, 1)` |
| `--ease-expressive` | `cubic-bezier(.2, 0, 0, 1)` |
| `--ease-emphasized` | `cubic-bezier(.3, 0, 0, 1)` |

## Glass / frosted (valores base)

| Token | Valor |
|---|---|
| `--glass-fill` | `rgba(255,255,255,.24)` |
| `--glass-fill-strong` | `rgba(255,255,255,.36)` |
| `--glass-fill-dark` | `rgba(41,41,41,.34)` |
| `--glass-stroke` | `rgba(255,255,255,.42)` |
| `--glass-highlight` | `rgba(255,255,255,.74)` |
| `--glass-blur` | `22px` |

## Gradientes

| Token | Valor |
|---|---|
| `--gradient-primary` | `linear-gradient(103deg, #3BFF00 0%, #4242FF 85%)` |
| `--gradient-soft` | `linear-gradient(135deg, rgba(59,255,0,.34) 0%, rgba(66,66,255,.28) 100%)` |
| `--gradient-dark` | `linear-gradient(103deg, #3BFF00 0%, #4242FF 58%, #292929 100%)` |
| `--gradient-animated` | `linear-gradient(103deg, #3BFF00, #6DFF7C, #4242FF, #3BFF00)` |

## Accesibilidad

| Token | Valor |
|---|---|
| `--disabled-opacity` | `.48` |

---

# 🧩 Clases, utilidades y efectos base

```css
/* Base */
body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: var(--font-sans), 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  font-weight: var(--weight-body);
  line-height: 1.6;
}

/* Focus visible — outline 3px + glow 7px */
:where(a, button, input, select, textarea, summary):focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 7px var(--focus-glow);
}

/* Aurora de fondo (fondo de firma Wiwo) */
@keyframes aurora-drift {
  from { background-position: 12% 28%, 72% 18%; }
  to   { background-position: 22% 38%, 62% 28%; }
}
.aurora-bg { position: relative; }
.aurora-bg::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background-image:
    radial-gradient(ellipse 60% 40% at 12% 28%, rgba(59, 255, 0, 0.13) 0%, transparent 70%),
    radial-gradient(ellipse 50% 35% at 72% 18%, rgba(66, 66, 255, 0.10) 0%, transparent 70%);
  background-size: 200% 200%, 200% 200%;
  filter: blur(14px);
  animation: aurora-drift var(--motion-loop) var(--ease-expressive) infinite alternate;
  pointer-events: none;
}
.dark .aurora-bg::before {
  background-image:
    radial-gradient(ellipse 60% 40% at 12% 28%, rgba(59, 255, 0, 0.07) 0%, transparent 70%),
    radial-gradient(ellipse 50% 35% at 72% 18%, rgba(66, 66, 255, 0.06) 0%, transparent 70%);
}

/* Animaciones de entrada / utilidades */
@keyframes fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes skeleton-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
@keyframes gradient-shift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

.animate-in { animation: fade-up var(--motion-slow) var(--ease-expressive) both; }
.gradient-text {
  background: var(--gradient-animated);
  background-size: 300% 300%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-shift var(--motion-loop) var(--ease-expressive) infinite;
}
.wiwo-gradient-band { background: var(--gradient-primary); }  /* acento, NO fondo de página */
.wiwo-gradient-soft { background: var(--gradient-soft); }

/* Glassmorphism */
.wiwo-glass {
  background: var(--glass-fill);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-stroke);
}
.dark .wiwo-glass {
  background: var(--glass-fill-dark);
  border-color: rgba(248, 250, 215, .12);
}

/* Scrollbar sutil (aplica a todo; oculta flechas nativas de Windows) */
* {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / .35) transparent;
}
*::-webkit-scrollbar { width: 8px; height: 8px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / .28);
  border-radius: 9999px;
  border: 2px solid transparent;
  background-clip: content-box;
}
*:hover::-webkit-scrollbar-thumb { background-color: hsl(var(--muted-foreground) / .45); }
*::-webkit-scrollbar-button { display: none; width: 0; height: 0; }

/* Reduced motion (obligatorio) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## "Unlock the MaGiC" — switch + overlay

```css
.unlock-track--on {
  background-image: var(--gradient-animated);
  background-size: 220% 220%;
  animation: gradient-shift 3.4s var(--ease-expressive) infinite;
}
@keyframes unlock-pop { 0% { transform: scale(1); } 45% { transform: scale(1.24); } 100% { transform: scale(1); } }
.unlock-thumb--pop { animation: unlock-pop var(--motion-medium) var(--ease-spring); }

.unlock-overlay { position: fixed; inset: 0; z-index: 9999; pointer-events: none; overflow: hidden; animation: unlock-overlay-fade 3200ms var(--ease-out) forwards; }
@keyframes unlock-overlay-fade { 0% { opacity: 0; } 8% { opacity: 1; } 74% { opacity: 1; } 100% { opacity: 0; } }
.unlock-overlay-aurora {
  position: absolute; inset: -25%;
  background:
    radial-gradient(38% 38% at 28% 30%, rgba(59, 255, 0, .38), transparent 70%),
    radial-gradient(44% 44% at 72% 64%, rgba(66, 66, 255, .42), transparent 70%),
    radial-gradient(34% 34% at 50% 82%, rgba(0, 194, 255, .32), transparent 70%);
  filter: blur(34px);
  animation: unlock-aurora-bloom 3200ms var(--ease-out) forwards;
}
@keyframes unlock-aurora-bloom { 0% { opacity: 0; transform: scale(1.18); } 22% { opacity: .95; transform: scale(1); } 70% { opacity: .8; transform: scale(1.02); } 100% { opacity: 0; transform: scale(1.06); } }
.unlock-overlay-ring {
  position: absolute; left: 50%; top: 50%; width: 42vmax; height: 42vmax; border-radius: 9999px;
  border: 2px solid rgba(59, 255, 0, .55);
  box-shadow: 0 0 70px rgba(66, 66, 255, .5), inset 0 0 70px rgba(59, 255, 0, .28);
  animation: unlock-ring 2600ms var(--ease-out) forwards;
}
@keyframes unlock-ring { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.2); } 18% { opacity: .8; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(2.5); } }
.unlock-overlay-spark { position: absolute; border-radius: 9999px; animation: unlock-overlay-spark 2400ms var(--ease-out) forwards; }
@keyframes unlock-overlay-spark { 0% { transform: translateY(16px) scale(0); opacity: 0; } 22% { transform: translateY(0) scale(1); opacity: 1; } 70% { transform: translateY(-16px) scale(.9); opacity: .9; } 100% { transform: translateY(-48px) scale(.3); opacity: 0; } }
```

## React Flow (editor de Workflows)

```css
/* Reset de los nodos integrados (usamos NodeShell custom) */
.react-flow__node-output, .react-flow__node-input, .react-flow__node-default, .react-flow__node-group {
  padding: 0 !important; border: 0 !important; border-radius: 0 !important;
  background: transparent !important; width: auto !important; box-shadow: none !important;
  text-align: left !important; color: inherit !important; font-size: inherit !important;
}
/* Control de zoom alineado al tema (RF viene con botones blancos) */
.react-flow__controls {
  border: 1px solid hsl(var(--border)) !important;
  border-radius: 10px !important;
  overflow: hidden !important;
  box-shadow: 0 2px 8px hsl(0 0% 0% / 0.18) !important;
}
.react-flow__controls-button {
  background: hsl(var(--card)) !important;
  border-bottom: 1px solid hsl(var(--border)) !important;
  color: hsl(var(--foreground)) !important;
}
.react-flow__controls-button:hover { background: hsl(var(--foreground) / 0.08) !important; }
.react-flow__controls-button svg { fill: hsl(var(--foreground)) !important; }
```

---

# 🧱 Componentes

> **Nota de alias:** los patrones de componentes usan los nombres del design system: `--scale-*` = los `--step-*` de arriba; `[data-theme="dark"]` equivale a la clase `.dark`; `--state-ok`/`--state-danger` = `--ok`/`--danger`. Todo se construye **solo con tokens** (nunca colores hardcodeados). El foco visible es obligatorio; disabled usa `opacity: var(--disabled-opacity)` + `cursor: not-allowed` + `pointer-events: none`. Controles → `--radius-control` (999px); cards → `--radius-card` (8px).

## Botones

```css
/* Primario — CTA principal */
.btn-primary {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-5);   /* 12px 24px */
  background: var(--wiwo-green);             /* #3BFF00 */
  color: var(--wiwo-blue-700);              /* #2F31D9 — azul oscuro sobre verde */
  border: none; border-radius: var(--radius-control);
  font-family: var(--font-system); font-size: var(--step-0); font-weight: var(--weight-action);
  white-space: nowrap; cursor: pointer;
  transition: opacity var(--motion-fast) var(--ease-expressive),
              transform var(--motion-fast) var(--ease-expressive),
              box-shadow var(--motion-fast) var(--ease-expressive);
}
.btn-primary:hover  { opacity: .9; transform: scale(1.02); }
.btn-primary:active { transform: scale(.98); }

/* Secundario */
.btn-secondary {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--control-surface); color: var(--ink);
  border: 1px solid var(--line); border-radius: var(--radius-control);
  font-size: var(--step-0); font-weight: var(--weight-action); cursor: pointer;
  transition: background var(--motion-fast) var(--ease-expressive),
              border-color var(--motion-fast) var(--ease-expressive);
}
.btn-secondary:hover { background: var(--control-surface-hover); border-color: var(--wiwo-blue); }

/* Ghost (terciario, solo texto) */
.btn-ghost {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: transparent; color: var(--wiwo-blue); border: none; border-radius: var(--radius-control);
  font-size: var(--step-0); font-weight: var(--weight-action); cursor: pointer;
  transition: text-decoration var(--motion-fast) var(--ease-expressive), opacity var(--motion-fast) var(--ease-expressive);
}
.btn-ghost:hover { text-decoration: underline; }

/* Destructivo (acciones irreversibles) */
.btn-destructive {
  padding: var(--space-3) var(--space-5); border-radius: var(--radius-control);
  font-size: var(--step-0); font-weight: var(--weight-action);
  background: var(--error); color: #FFFFFF; border: none; cursor: pointer;
  transition: opacity var(--motion-fast) var(--ease-expressive);
}
.btn-destructive:hover { opacity: .85; }

/* Botón de ícono (cuadrado/circular) */
.btn-icon {
  display: inline-flex; align-items: center; justify-content: center;
  padding: var(--space-2); border-radius: var(--radius-control);
  background: var(--control-surface); border: 1px solid var(--line); color: var(--ink);
  width: calc(var(--icon-size-md) + var(--space-2) * 2);
  height: calc(var(--icon-size-md) + var(--space-2) * 2);
  cursor: pointer; transition: background var(--motion-fast) var(--ease-expressive);
}
.btn-icon:hover { background: var(--control-surface-hover); }
.btn-icon svg  { width: var(--icon-size-md); height: var(--icon-size-md); stroke-width: 2; }

/* Disabled (todas las variantes) */
.btn-primary:disabled, .btn-secondary:disabled, .btn-ghost:disabled, .btn-destructive:disabled {
  opacity: var(--disabled-opacity); cursor: not-allowed; pointer-events: none;
}
```

**Tamaños:** `sm` → `--step--1`, padding `space-2`/`space-3`, ícono 18px · `md` (default) → `--step-0`, padding `space-3`/`space-5`, ícono 20px · `lg` → `--step-1`, padding `space-4`/`space-6`, ícono 24px.

## Cards

```css
/* Default */
.card {
  background: var(--surface-container); border: 1px solid var(--line);
  border-radius: var(--radius-card); box-shadow: var(--shadow-1);
  padding: var(--ui-card-pad); overflow: hidden;
}
/* Elevada */
.card-elevated { box-shadow: var(--shadow-2); }
/* Expresiva (features/IA/premium) */
.card-expressive { box-shadow: var(--shadow-expressive); border-top: 2px solid transparent; background-clip: padding-box; }
/* Glass (solo sobre gradiente/imagen) */
.card-glass {
  background: var(--glass-fill);
  backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-stroke); border-radius: var(--shape-md);
  box-shadow: var(--shadow-glass); padding: var(--ui-card-pad);
}
[data-theme="dark"] .card-glass { background: var(--glass-fill-dark); border-color: rgba(248, 250, 215, .12); }
/* Interactiva (clickeable) */
.card-interactive {
  transition: transform var(--motion-medium) var(--ease-expressive), box-shadow var(--motion-medium) var(--ease-expressive);
  cursor: pointer;
}
.card-interactive:hover  { transform: scale(1.01); box-shadow: var(--shadow-2); }
.card-interactive:active { transform: scale(.99); }

/* Estructura interna */
.card__header  { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
.card__title   { font-size: var(--step-1); font-weight: var(--weight-nav); color: var(--ink); margin: 0; }
.card__divider { border: none; border-top: 1px solid var(--line); margin: var(--space-4) 0; }
.card__body    { font-size: var(--step-0); line-height: 1.6; color: var(--ink); }
.card__footer  { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--line); display: flex; align-items: center; gap: var(--space-3); }

/* Métrica (dashboards) */
.card-metric { display: flex; flex-direction: column; gap: var(--space-2); }
.card-metric__label  { font-size: var(--step--1); font-weight: var(--weight-meta); color: var(--ink-2); text-transform: uppercase; letter-spacing: .04em; }
.card-metric__value  { font-size: var(--step-3); font-weight: var(--weight-display); color: var(--ink); line-height: 1; }
.card-metric__delta  { font-size: var(--step--1); font-weight: var(--weight-meta); color: var(--ok); }
.card-metric__delta--negative { color: var(--danger); }
```

## Formularios

```css
.input {
  display: block; width: 100%; padding: var(--space-3) var(--space-4);
  background: var(--control-surface); border: 1px solid var(--line);
  border-radius: var(--shape-sm); color: var(--ink);
  font-family: var(--font-system); font-size: var(--step-0); font-weight: var(--weight-body);
  outline: none;
  transition: border-color var(--motion-fast) var(--ease-expressive),
              box-shadow var(--motion-fast) var(--ease-expressive),
              background var(--motion-fast) var(--ease-expressive);
}
.input::placeholder { color: var(--muted); }
.input:hover { background: var(--control-surface-hover); }
.input:focus {
  border-color: var(--wiwo-blue);
  box-shadow: 0 0 0 3px var(--focus-ring), 0 0 8px 2px var(--focus-glow);
  background: var(--control-surface-hover);
}
.input:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }

.label { display: block; font-size: var(--step--1); font-weight: var(--weight-meta); color: var(--ink-2); margin-bottom: var(--space-1); }
.label--required::after { content: " *"; color: var(--error); }
.input-hint { display: block; font-size: var(--step--1); color: var(--muted); margin-top: var(--space-1); }

/* Error */
.input--error { border-color: var(--error); background: var(--error-soft); }
.input--error:focus { border-color: var(--error); box-shadow: 0 0 0 3px rgba(186, 26, 26, .2); }
.input-error-message { display: block; font-size: var(--step--1); font-weight: var(--weight-meta); color: var(--error); margin-top: var(--space-1); }

.textarea { resize: vertical; min-height: 100px; line-height: 1.6; }  /* hereda .input */

/* Select (chevron via ::after) */
.select { appearance: none; padding-right: var(--space-8); cursor: pointer; }

/* Checkbox / radio */
.checkbox, .radio {
  appearance: none; width: 18px; height: 18px;
  background: var(--control-surface); border: 1.5px solid var(--line);
  border-radius: var(--shape-xs);   /* radio: 999px */
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-expressive), border-color var(--motion-fast) var(--ease-expressive);
}
.checkbox:checked, .radio:checked { background: var(--wiwo-blue); border-color: var(--wiwo-blue); }
.checkbox:focus-visible, .radio:focus-visible { box-shadow: 0 0 0 3px var(--focus-ring); }

.form-field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-5); }

/* Búsqueda (pill + ícono a la izquierda) */
.input-search { padding-left: calc(var(--icon-size-md) + var(--space-4) + var(--space-3)); border-radius: var(--radius-control); }
```

## Navegación

```css
/* Barra principal (sticky, con blur) */
.nav {
  position: sticky; top: 0; z-index: 100;
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-5);
  padding: var(--space-3) var(--ui-panel-pad); height: 64px;
  background: var(--surface);
  backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur));
  border-bottom: 1px solid var(--line);
}
.nav__links { display: flex; align-items: center; gap: var(--space-5); list-style: none; margin: 0; padding: 0; }
.nav__item { font-size: var(--step-0); font-weight: var(--weight-nav); color: var(--ink); text-decoration: none; white-space: nowrap; transition: color var(--motion-fast) var(--ease-expressive); }
.nav__item:hover { color: var(--wiwo-blue); }
.nav__item--active { color: var(--wiwo-blue); position: relative; }
.nav__item--active::after { content: ""; position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 999px; background: var(--wiwo-green); }

/* Sidebar */
.sidebar-nav { width: 240px; padding: var(--ui-panel-pad); background: var(--surface-container); border-right: 1px solid var(--line); height: 100vh; position: sticky; top: 0; overflow-y: auto; }
.sidebar-nav__section-label { font-size: var(--step--1); font-weight: var(--weight-meta); color: var(--muted); text-transform: uppercase; letter-spacing: .06em; padding: var(--space-2) var(--space-3); margin-bottom: var(--space-1); }
.sidebar-nav__item { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--shape-sm); font-size: var(--step-0); font-weight: var(--weight-nav); color: var(--ink-2); text-decoration: none; transition: background var(--motion-fast) var(--ease-expressive), color var(--motion-fast) var(--ease-expressive); }
.sidebar-nav__item:hover { background: var(--surface-container-high); color: var(--ink); }
.sidebar-nav__item--active { background: rgba(66, 66, 255, .08); color: var(--wiwo-blue); font-weight: var(--weight-action); }

/* Breadcrumbs */
.breadcrumbs { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-1); list-style: none; margin: 0; padding: 0; }
.breadcrumbs__link { font-size: var(--step--1); font-weight: var(--weight-meta); color: var(--ink-2); text-decoration: none; transition: color var(--motion-fast) var(--ease-expressive); }
.breadcrumbs__link:hover { color: var(--wiwo-blue); text-decoration: underline; }
.breadcrumbs__separator, .breadcrumbs__item--current { font-size: var(--step--1); color: var(--muted); }

/* Mobile nav (drawer) */
.mobile-nav { position: fixed; inset: 0; z-index: 200; background: var(--surface-container); padding: var(--ui-panel-pad); display: flex; flex-direction: column; gap: var(--space-1); transform: translateX(100%); transition: transform var(--motion-slow) var(--ease-emphasized); }
.mobile-nav--open { transform: translateX(0); }

/* Tabs */
.tabs { display: flex; border-bottom: 1px solid var(--line); gap: var(--space-1); }
.tab { padding: var(--space-3) var(--space-4); font-size: var(--step-0); font-weight: var(--weight-nav); color: var(--ink-2); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; cursor: pointer; transition: color var(--motion-fast) var(--ease-expressive), border-color var(--motion-fast) var(--ease-expressive); }
.tab:hover { color: var(--ink); }
.tab--active { color: var(--wiwo-blue); border-bottom-color: var(--wiwo-blue); font-weight: var(--weight-action); }
```

---

# 🏷️ Marca

**Filosofía:** *AI-first, calm-yet-electric, brutally simple.* Cuatro palabras que gobiernan cada decisión: **claro, enérgico, humano, preciso**. Nunca corporativo, nunca frío.

**Primitivos (los 4 que SON la marca):** azul `#4242FF` (identidad, foco, inteligencia) · verde `#3BFF00` (acción, launch, energía IA) · beige `#F8FAD7` (calma, lectura, fondo primario) · tinta `#292929` (autoridad, texto — **nunca negro puro**). Secundarios: `wiwo-blue-700 #2F31D9` (texto azul sobre colores saturados, p. ej. verde) · `wiwo-beige-alt #EDEFDD`.

**Logos:** wordmark `wiwo-logotype.svg` (nav/headers, mín 80px), marca `wiwo-mark.svg` (favicons/avatares/espacios chicos, mín 24px), `wiwo-favicon.svg` (solo tab). PNG: **Blue** (fondos claros/beige), **Beige** (fondos tinta/azul), **Green** (énfasis sobre tinta), **Mark**. Reglas: no distorsionar, zona de exclusión = 1× la altura de la cap, no recolorear (usar la variante correcta), sin sombras/gradientes/filtros (salvo `filter: brightness(0) invert(1)` para poner el logo en blanco sobre oscuro), contraste WCAG AA mínimo.

**Gradiente de firma:** `linear-gradient(103deg, #3BFF00 0%, #4242FF 85%)`. Es **puntuación**, no papel tapiz: acentos de hero, glow de CTA hover, loaders, momentos de "launch". Nunca fondo de página completa.

**Fotografía:** creadores Gen Z / emprendedores / talento diverso (personas reales, no stock). Fondos limpios: estudio blanco, degradés beige suaves o entornos urban/tech desenfocados. Tratamiento levemente desaturado con tinte beige en neutros; verde/azul como acentos, no fondos. Evitar: negro puro, viñetas pesadas, clip-art, clichés de stock, degradés neón fuera de paleta.

---

## Notas de uso

- **Verde con texto:** el texto sobre verde usa tinta/beige (`--accent-foreground` / `--on-accent`), **nunca blanco**.
- **Anillo de foco:** azul en claro, **verde en oscuro** (máxima visibilidad) — a propósito.
- **Dark mode automático:** los tokens semánticos invierten con `.dark`; no hacen falta estilos por-componente.
- **Radios semánticos:** controles (botones/inputs) → `--radius-control` (999px, pill); cards → `--radius-card` (8px); genéricos → `--shape-sm..xl`.
- **Transiciones:** siempre con tokens de movimiento, nunca `ms` arbitrarios.
- **Tipografía:** Plus Jakarta Sans (variable). La escala es fluida (`clamp`), así que no hay tamaños fijos por breakpoint.
