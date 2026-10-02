import type { SVGProps } from "react";
import { HILOS } from "./telaranaTrazo";

/**
 * Dibujos SVG del modo Halloween. Son decorativos: todos van `aria-hidden` y heredan el color de la
 * hoja de estilos del modo (`estilos/modos/halloween.css`), no lo llevan escrito.
 */

/**
 * Telaraña para una esquina (la del origen arriba a la izquierda); el llamador la voltea con CSS.
 * Los hilos (`HILOS`) llevan `data-hilo` para que anime.js los dibuje, y `data-tejedora` es la
 * araña que los teje; sin animacion los hilos quedan completos y la araña oculta por la hoja de
 * estilos.
 */
export function Telarana(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      overflow="visible"
      {...props}
    >
      {HILOS.map((d) => (
        <path key={d} data-hilo="" d={d} />
      ))}
      <g data-tejedora="" className="decoracion-modo-tejedora" opacity="0">
        <Arana x={-5} y={-5} width={10} height={10} />
      </g>
    </svg>
  );
}

/**
 * Murciélago con las alas abiertas. Cada ala es un grupo (`data-ala`) que gira sobre el hombro, para
 * que aletee de verdad en vez de aplastarse entero.
 */
export function Murcielago(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 24 16" fill="currentColor" {...props}>
      <g data-ala="izq" style={{ transformOrigin: "12px 7px" }}>
        <path d="M12 6 C9 6 5 5 1 4 C3 8 3 12 8 13 C9 11 11 11 12 12 Z" />
      </g>
      <g data-ala="der" style={{ transformOrigin: "12px 7px" }}>
        <path d="M12 6 C15 6 19 5 23 4 C21 8 21 12 16 13 C15 11 13 11 12 12 Z" />
      </g>
      <path d="M10.4 5 L10.6 1.4 L12 3.2 L13.4 1.4 L13.6 5 C14.2 8 13.4 11 12 12 C10.6 11 9.8 8 10.4 5 Z" />
    </svg>
  );
}

/**
 * Fantasma de cuerpo suave. El borde de abajo (`data-borde`) es la parte que ondula, los ojos
 * (`data-ojo`) parpadean y se mueven; todo hereda el color del texto.
 */
export function Fantasma(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 28"
      fill="none"
      stroke="currentColor"
      {...props}
    >
      <path
        data-borde=""
        d={BORDE_FANTASMA[0]}
        fill="currentColor"
        fillOpacity="0.16"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <g fill="currentColor" stroke="none" data-ojos="">
        <ellipse
          data-ojo=""
          cx="9"
          cy="11"
          rx="1.2"
          ry="1.7"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
        <ellipse
          data-ojo=""
          cx="15"
          cy="11"
          rx="1.2"
          ry="1.7"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      </g>
      <ellipse
        cx="12"
        cy="16"
        rx="1.4"
        ry="1.8"
        fill="currentColor"
        fillOpacity="0.5"
        stroke="none"
      />
    </svg>
  );
}

/**
 * Las dos formas del borde de abajo del fantasma, con la misma estructura de comandos para que
 * anime.js pueda pasar de una a otra.
 */
export const BORDE_FANTASMA = [
  "M3 12 A9 9 0 0 1 21 12 L21 24 Q18.5 21 16.5 24 Q14.5 27 12 24 Q9.5 21 7.5 24 Q5.5 27 3 24 Z",
  "M3 12 A9 9 0 0 1 21 12 L21 24 Q18.5 27 16.5 24 Q14.5 21 12 24 Q9.5 27 7.5 24 Q5.5 21 3 24 Z",
] as const;

/** Araña vista de arriba: cuerpo, cabeza y ocho patas. Hereda el color del texto. */
export function Arana(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" fill="currentColor" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13 16 L5 10 L2 14 M13 18 L4 18 L2 23 M13 20 L6 26 L4 30 M14 21 L11 28 L10 31" />
        <path d="M19 16 L27 10 L30 14 M19 18 L28 18 L30 23 M19 20 L26 26 L28 30 M18 21 L21 28 L22 31" />
      </g>
      <ellipse cx="16" cy="19" rx="5.2" ry="6.4" />
      <circle cx="16" cy="11.5" r="3.2" />
    </svg>
  );
}

/** Calabaza con cara; el cuerpo sale de `--calabaza` y la cara de `--calabaza-cara`. */
export function Calabaza(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden viewBox="0 0 64 60" {...props}>
      <path
        d="M32 10 C32 4 36 2 40 2"
        fill="none"
        stroke="var(--calabaza-tallo, #3F7D1F)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <ellipse
        cx="32"
        cy="36"
        rx="28"
        ry="22"
        fill="var(--calabaza, #FF7A00)"
      />
      <ellipse
        cx="20"
        cy="36"
        rx="10"
        ry="20"
        fill="var(--calabaza-sombra, #B34700)"
        opacity="0.35"
      />
      <ellipse
        cx="44"
        cy="36"
        rx="10"
        ry="20"
        fill="var(--calabaza-sombra, #B34700)"
        opacity="0.35"
      />
      <path
        d="M17 30 L25 30 L21 22 Z M39 30 L47 30 L43 22 Z"
        fill="var(--calabaza-cara, #2A1A00)"
      />
      <path
        d="M18 42 L24 47 L28 43 L32 48 L36 43 L40 47 L46 42 L44 51 L20 51 Z"
        fill="var(--calabaza-cara, #2A1A00)"
      />
    </svg>
  );
}
