import type { SVGProps } from 'react'

/**
 * Dibujos SVG del modo Halloween. Son decorativos: todos van `aria-hidden` y heredan el color de la
 * hoja de estilos del modo (`estilos/modos/halloween.css`), no lo llevan escrito.
 */

/**
 * Telaraña para una esquina (la del origen arriba a la izquierda); el llamador la voltea con CSS.
 * Los hilos llevan `data-hilo` para que anime.js los dibuje al entrar.
 */
export function Telarana (props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1" {...props}>
      <path data-hilo="" d="M0 0 L100 0" />
      <path data-hilo="" d="M0 0 L94 34" />
      <path data-hilo="" d="M0 0 L78 66" />
      <path data-hilo="" d="M0 0 L52 90" />
      <path data-hilo="" d="M0 0 L22 98" />
      <path data-hilo="" d="M0 0 L0 100" />
      <path data-hilo="" d="M20 0 Q14 14 0 20" />
      <path data-hilo="" d="M40 0 Q30 30 0 40" />
      <path data-hilo="" d="M60 0 Q45 45 0 60" />
      <path data-hilo="" d="M80 0 Q60 60 0 80" />
      <path data-hilo="" d="M98 0 Q74 74 0 98" />
    </svg>
  )
}

/** Murciélago con las alas abiertas. */
export function Murcielago (props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 24 16" fill="currentColor" {...props}>
      <path d="M12 2 C10 6 6 6 1 4 C3 8 3 12 8 13 C9 11 11 11 12 13 C13 11 15 11 16 13 C21 12 21 8 23 4 C18 6 14 6 12 2 Z" />
    </svg>
  )
}

/** Araña vista de arriba: cuerpo, cabeza y ocho patas. Hereda el color del texto. */
export function Arana (props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" fill="currentColor" {...props}>
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 16 L5 10 L2 14 M13 18 L4 18 L2 23 M13 20 L6 26 L4 30 M14 21 L11 28 L10 31" />
        <path d="M19 16 L27 10 L30 14 M19 18 L28 18 L30 23 M19 20 L26 26 L28 30 M18 21 L21 28 L22 31" />
      </g>
      <ellipse cx="16" cy="19" rx="5.2" ry="6.4" />
      <circle cx="16" cy="11.5" r="3.2" />
    </svg>
  )
}

/** Calabaza con cara; el cuerpo sale de `--calabaza` y la cara de `--calabaza-cara`. */
export function Calabaza (props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 64 60" {...props}>
      <path d="M32 10 C32 4 36 2 40 2" fill="none" stroke="var(--calabaza-tallo, #3F7D1F)" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="32" cy="36" rx="28" ry="22" fill="var(--calabaza, #FF7A00)" />
      <ellipse cx="20" cy="36" rx="10" ry="20" fill="var(--calabaza-sombra, #B34700)" opacity="0.35" />
      <ellipse cx="44" cy="36" rx="10" ry="20" fill="var(--calabaza-sombra, #B34700)" opacity="0.35" />
      <path d="M17 30 L25 30 L21 22 Z M39 30 L47 30 L43 22 Z" fill="var(--calabaza-cara, #2A1A00)" />
      <path d="M18 42 L24 47 L28 43 L32 48 L36 43 L40 47 L46 42 L44 51 L20 51 Z" fill="var(--calabaza-cara, #2A1A00)" />
    </svg>
  )
}
