"use client";

import { animate } from "animejs";
import { useAviso } from "@/componentes/estado/useAviso";
import { Fantasma as DibujoDeFantasma, BORDE_FANTASMA } from "./Dibujos";
import { elegirDistinta, FRASES_DE_FANTASMA } from "./huevos";
import { useAnimacionDeModo } from "./useAnimacionDeModo";

/** Lo que tarda en cruzar, y cuanto espera para volver a aparecer. */
const CRUCE_MS = 18_000;
const PAUSA_MS = 52_000;
/** Lo que tarda en ondular el borde de abajo de ida y de vuelta. */
const ONDA_MS = 900;
/** Cada cuanto parpadea. */
const PARPADEO_MS = 3800;

/**
 * Un fantasma que cruza de derecha a izquierda flotando, aparece y se desvanece, y no vuelve en casi
 * un minuto. Es lo mas raro de ver de toda la decoracion, a proposito: si estuviera siempre se
 * volveria parte del fondo. Mientras flota se mueve el: el borde de abajo ondula, el cuerpo se
 * estira al subir y se achata al bajar, se inclina hacia donde va, parpadea y mira de reojo. Si
 * alguien logra hacerle clic mientras pasa, lo atrapa y dice algo.
 */
export function Fantasma() {
  const aviso = useAviso();
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => {
    const cuerpo = raiz.querySelectorAll("[data-cuerpo]");
    const borde = raiz.querySelectorAll("[data-borde]");
    const ojos = raiz.querySelectorAll("[data-ojo]");
    const mirada = raiz.querySelectorAll("[data-ojos]");

    return [
      animate(raiz, {
        translateX: ["112vw", "-16vw"],
        translateY: [
          { to: -26, duration: CRUCE_MS / 4, ease: "inOutSine" },
          { to: 20, duration: CRUCE_MS / 4, ease: "inOutSine" },
          { to: -22, duration: CRUCE_MS / 4, ease: "inOutSine" },
          { to: 14, duration: CRUCE_MS / 4, ease: "inOutSine" },
        ],
        opacity: [
          { to: 0.4, duration: CRUCE_MS * 0.12 },
          { to: 0.4, duration: CRUCE_MS * 0.76 },
          { to: 0, duration: CRUCE_MS * 0.12 },
        ],
        duration: CRUCE_MS,
        ease: "linear",
        loop: true,
        loopDelay: PAUSA_MS,
        delay: 9000,
      }),
      animate(borde, {
        d: [BORDE_FANTASMA[0], BORDE_FANTASMA[1]],
        duration: ONDA_MS,
        ease: "inOutSine",
        alternate: true,
        loop: true,
      }),
      animate(cuerpo, {
        scaleY: [1.05, 0.96],
        scaleX: [0.97, 1.03],
        rotate: [-7, -2],
        duration: CRUCE_MS / 4,
        ease: "inOutSine",
        alternate: true,
        loop: true,
      }),
      animate(ojos, {
        scaleY: [
          { to: 1, duration: PARPADEO_MS },
          { to: 0.1, duration: 90 },
          { to: 1, duration: 110 },
        ],
        loop: true,
      }),
      animate(mirada, {
        translateX: [
          { to: 0, duration: 4200 },
          { to: -0.9, duration: 500, ease: "inOutQuad" },
          { to: -0.9, duration: 1500 },
          { to: 0, duration: 500, ease: "inOutQuad" },
        ],
        loop: true,
      }),
    ];
  });

  return (
    <div
      ref={raizRef}
      style={{ top: "38vh", left: 0 }}
      onClick={() => {
        aviso.info(elegirDistinta(FRASES_DE_FANTASMA, null));
      }}
      className="decoracion-modo-fantasma decoracion-modo-vuelo pointer-events-auto absolute hidden cursor-pointer opacity-0 md:block"
    >
      <span
        data-cuerpo=""
        className="block"
        style={{ transformOrigin: "50% 100%" }}
      >
        <DibujoDeFantasma className="h-16 w-14" />
      </span>
    </div>
  );
}
