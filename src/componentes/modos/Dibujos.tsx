import type { SVGProps } from 'react'

/**
 * Dibujos SVG del modo Halloween. Son decorativos: todos van `aria-hidden` y heredan el color de la
 * hoja de estilos del modo (`estilos/modos/halloween.css`), no lo llevan escrito.
 */

/** Telaraña para una esquina; el llamador la voltea con CSS para las demás. */
export function Telarana (props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" {...props} fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M0 0 L100 0 M0 0 L92 38 M0 0 L70 70 M0 0 L38 92 M0 0 L0 100" />
      <path d="M22 0 Q14 14 0 22 M46 0 Q34 34 0 46 M70 0 Q52 52 0 70 M94 0 Q70 70 0 94" />
    </svg>
  )
}

/** Murciélago con las alas abiertas. */
export function Murcielago (props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 24 16" {...props} fill="currentColor">
      <path d="M12 2 C10 6 6 6 1 4 C3 8 3 12 8 13 C9 11 11 11 12 13 C13 11 15 11 16 13 C21 12 21 8 23 4 C18 6 14 6 12 2 Z" />
    </svg>
  )
}

/** Calabaza con cara; el cuerpo sale de `--calabaza` y la cara de `--calabaza-cara`. */
export function Calabaza (props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 64 60" {...props}>
      <path d="M32 10 C32 4 36 2 40 2" fill="none" stroke="var(--calabaza-tallo)" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="32" cy="36" rx="28" ry="22" fill="var(--calabaza)" />
      <ellipse cx="20" cy="36" rx="10" ry="20" fill="var(--calabaza-sombra)" opacity="0.35" />
      <ellipse cx="44" cy="36" rx="10" ry="20" fill="var(--calabaza-sombra)" opacity="0.35" />
      <path d="M17 30 L25 30 L21 22 Z M39 30 L47 30 L43 22 Z" fill="var(--calabaza-cara)" />
      <path d="M18 42 L24 47 L28 43 L32 48 L36 43 L40 47 L46 42 L44 51 L20 51 Z" fill="var(--calabaza-cara)" />
    </svg>
  )
}
