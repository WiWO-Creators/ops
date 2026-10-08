"use client";

import { animate, createTimeline, stagger, utils } from "animejs";
import { cumpleConsulta, MENOS_MOVIMIENTO } from "@/lib/useConsultaDeMedios";
import { Murcielago } from "./Dibujos";
import {
  crearAgenda,
  useAnimacionDeModo,
  type Agenda,
} from "./useAnimacionDeModo";

/** Cuantos murciélagos hay disponibles para volar, y cuantos cuelgan boca abajo de la cabecera. */
const EN_VUELO = 3;
const COLGADOS = 3;
/** Cuanto tarda en cruzar cada murciélago, y la pausa entre una oleada y la siguiente (min, max). */
const CRUCE_MS = [11_000, 17_000] as const;
const PAUSA_MS = [45_000, 80_000] as const;
/** Espera antes de la primera oleada, para que no coincida con la entrada del modo. */
const PRIMERA_MS = [6000, 12_000] as const;
/** Franja de la pantalla por donde vuelan, en vh: arriba, lejos del contenido. */
const FRANJA_VH = [4, 24] as const;
/** Puntos de la ruta ondulada de cada vuelo. */
const PUNTOS_DE_RUTA = 6;
/** Duracion de un aletazo (subir o bajar), en milisegundos (min, max). */
const ALETAZO_MS = [130, 190] as const;
/** Angulos de las alas: arriba, abajo y planeando, medidos en el ala izquierda (la derecha es su espejo). */
const ALA_ARRIBA = 38;
const ALA_ABAJO = -28;
const ALA_PLANEO = 8;

/** Cada cuanto uno de los colgados se acomoda, y cuanto tarda en volver a su lugar tras un susto. */
const GESTO_MS = [15_000, 30_000] as const;
const REGRESO_MS = 9000;

/** Las dos alas de un murciélago: izquierda y derecha. */
function alasDe(sprite: Element): [Element, Element] | null {
  const izquierda = sprite.querySelector('[data-ala="izq"]');
  const derecha = sprite.querySelector('[data-ala="der"]');

  return izquierda !== null && derecha !== null ? [izquierda, derecha] : null;
}

/**
 * Aleteo en rafagas: unos cuantos aletazos seguidos y luego un planeo con las alas casi abiertas,
 * que se repite. Cada ala gira sobre el hombro y el cuerpo sube un poco con cada aletazo.
 *
 * @param sprite el murciélago (contiene las dos alas)
 * @returns el timeline en bucle, para pausarlo cuando termina el vuelo
 */
function crearAleteo(sprite: HTMLElement) {
  const alas = alasDe(sprite);
  const dibujo = sprite.querySelector("svg");
  const linea = createTimeline({ loop: true, defaults: { ease: "inOutSine" } });

  // El balanceo va en el dibujo: el sprite ya tiene su propio `translateY` con la ruta del vuelo.
  if (alas === null || dibujo === null) return linea;

  const [izquierda, derecha] = alas;
  const golpe = utils.random(...ALETAZO_MS);
  const golpes = utils.random(3, 6);
  let t = 0;

  for (let i = 0; i < golpes; i++) {
    const desde = i === 0 ? ALA_PLANEO : ALA_ABAJO;

    linea.add(izquierda, { rotate: [desde, ALA_ARRIBA], duration: golpe }, t);
    linea.add(derecha, { rotate: [-desde, -ALA_ARRIBA], duration: golpe }, t);
    linea.add(dibujo, { translateY: [0, -2], duration: golpe }, t);
    t += golpe;
    linea.add(
      izquierda,
      { rotate: [ALA_ARRIBA, ALA_ABAJO], duration: golpe },
      t,
    );
    linea.add(
      derecha,
      { rotate: [-ALA_ARRIBA, -ALA_ABAJO], duration: golpe },
      t,
    );
    linea.add(dibujo, { translateY: [-2, 0], duration: golpe }, t);
    t += golpe;
  }
  const planeo = utils.random(800, 1300);

  linea.add(
    izquierda,
    { rotate: [ALA_ABAJO, ALA_PLANEO], duration: planeo },
    t,
  );
  linea.add(
    derecha,
    { rotate: [-ALA_ABAJO, -ALA_PLANEO], duration: planeo },
    t,
  );

  return linea;
}

/**
 * Ruta de un vuelo: alturas que suben y bajan dentro de la franja alta y la inclinación del cuerpo
 * en cada punto, para que se vea que sigue la curva y no que se desliza.
 *
 * @param sentido 1 si cruza de izquierda a derecha, -1 al reves
 * @returns las alturas en vh y los angulos en grados, uno por punto
 */
function crearRuta(sentido: 1 | -1): { alturas: string[]; giros: number[] } {
  const ys = Array.from({ length: PUNTOS_DE_RUTA }, () =>
    utils.random(...FRANJA_VH),
  );
  const pasoX = (window.innerWidth * 1.2) / (PUNTOS_DE_RUTA - 1);
  const giros = ys.map((y, i) => {
    const previo = ys[Math.max(i - 1, 0)] ?? y;
    const siguiente = ys[Math.min(i + 1, ys.length - 1)] ?? y;
    const dy = ((siguiente - previo) * window.innerHeight) / 100;

    return (
      sentido *
      Math.max(-18, Math.min(18, (Math.atan2(dy, pasoX * 2) * 180) / Math.PI))
    );
  });

  return { alturas: ys.map((y) => `${y}vh`), giros };
}

/**
 * Lanza una oleada: de uno a tres murciélagos que cruzan por la franja alta, cada uno con su
 * profundidad (los lejanos mas chicos y tenues), su ruta y su aleteo.
 *
 * @param raiz contenedor con los murciélagos de vuelo
 * @param agenda agenda de la pieza
 * @param alTerminar se llama cuando el ultimo termino de cruzar
 */
function lanzarOleada(
  raiz: HTMLElement,
  agenda: Agenda,
  alTerminar: () => void,
): void {
  const sprites = Array.from(
    raiz.querySelectorAll<HTMLElement>("[data-murcielago]"),
  );
  const azar = utils.random(0, 99);
  const cantidad = Math.min(azar < 55 ? 1 : azar < 90 ? 2 : 3, sprites.length);
  let pendientes = cantidad;

  sprites.slice(0, cantidad).forEach((sprite, i) => {
    const sentido = utils.random(0, 1) === 0 ? 1 : -1;
    const escala = utils.random(60, 100) / 100;
    const opacidad = 0.3 + (escala - 0.6) * 0.6;
    const duracion = utils.random(...CRUCE_MS);
    const { alturas, giros } = crearRuta(sentido);
    const aleteo = agenda.guardar(crearAleteo(sprite));

    aleteo.pause();
    agenda.guardar(
      animate(sprite, {
        translateX: {
          from: sentido === 1 ? "-10vw" : "110vw",
          to: sentido === 1 ? "110vw" : "-10vw",
          ease: "linear",
        },
        translateY: alturas,
        rotate: giros,
        scale: escala,
        opacity: [
          { from: 0, to: opacidad, duration: duracion * 0.1, ease: "linear" },
          { to: opacidad, duration: duracion * 0.8, ease: "linear" },
          { to: 0, duration: duracion * 0.1, ease: "linear" },
        ],
        duration: duracion,
        delay: i * 900 + utils.random(0, 1500),
        ease: "inOutSine",
        onBegin: () => {
          aleteo.play();
        },
        onComplete: () => {
          aleteo.pause();
          pendientes -= 1;
          if (pendientes === 0) alTerminar();
        },
      }),
    );
  });
}

/** Encadena oleadas con pausas largas y valores nuevos cada vez. */
function programarOleadas(
  raiz: HTMLElement,
  agenda: Agenda,
  espera: number,
): void {
  agenda.en(espera, () => {
    lanzarOleada(raiz, agenda, () => {
      programarOleadas(raiz, agenda, utils.random(...PAUSA_MS));
    });
  });
}

/** Cada tanto uno de los colgados se acomoda: abre y cierra las alas un par de veces. */
function programarGestos(colgados: Element[], agenda: Agenda): void {
  agenda.en(utils.random(...GESTO_MS), () => {
    const elegido = colgados[utils.random(0, colgados.length - 1)];
    const alas = elegido === undefined ? null : alasDe(elegido);

    if (alas !== null) {
      agenda.guardar(
        animate(alas[0], {
          rotate: [0, -32, 0, -32, 0],
          duration: 1100,
          ease: "inOutSine",
        }),
      );
      agenda.guardar(
        animate(alas[1], {
          rotate: [0, 32, 0, 32, 0],
          duration: 1100,
          ease: "inOutSine",
        }),
      );
    }
    programarGestos(colgados, agenda);
  });
}

/**
 * Hace huir a un murciélago colgado: sale volando hacia arriba y a un lado, aleteando, y mas tarde
 * vuelve a colgarse donde estaba. Solo toca `translate` y `opacity`: el balanceo vive en `rotate`.
 */
function asustar(colgado: HTMLElement): void {
  if (cumpleConsulta(MENOS_MOVIMIENTO) || colgado.dataset.huyendo === "1")
    return;

  const lado = utils.random(0, 1) === 0 ? -1 : 1;
  const alas = alasDe(colgado);

  colgado.dataset.huyendo = "1";
  if (alas !== null) {
    animate(alas[0], {
      rotate: [ALA_ABAJO, ALA_ARRIBA],
      duration: 90,
      alternate: true,
      loop: 5,
    });
    animate(alas[1], {
      rotate: [-ALA_ABAJO, -ALA_ARRIBA],
      duration: 90,
      alternate: true,
      loop: 5,
    });
  }
  animate(colgado, {
    translateX: lado * utils.random(120, 260),
    translateY: -utils.random(90, 160),
    opacity: [0.6, 0],
    duration: 900,
    ease: "inQuad",
    onComplete: () => {
      animate(colgado, {
        translateX: 0,
        translateY: 0,
        opacity: [0, 0.6],
        duration: 1400,
        delay: REGRESO_MS,
        ease: "outQuad",
        onComplete: () => {
          delete colgado.dataset.huyendo;
        },
      });
    },
  });
}

/**
 * Murciélagos de dos clases. De vez en cuando una oleada de uno a tres cruza por arriba, aleteando
 * en rafagas y planeando entre ellas, cada uno a su profundidad, y despues deja la pantalla en paz
 * casi un minuto. Y unos pocos cuelgan boca abajo del borde de la cabecera, balanceandose y, cada
 * tanto, acomodando las alas.
 *
 * Con menos movimiento los de vuelo no se muestran (la hoja de estilos los esconde) y los colgados
 * quedan quietos.
 */
export function Murcielagos() {
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => {
    const agenda = crearAgenda();
    const colgados = Array.from(
      raiz.querySelectorAll("[data-murcielago-colgado]"),
    );

    programarOleadas(raiz, agenda, utils.random(...PRIMERA_MS));
    programarGestos(colgados, agenda);

    return [
      agenda,
      animate(colgados, {
        rotate: [-7, 7],
        duration: 2600,
        ease: "inOutSine",
        alternate: true,
        loop: true,
        delay: stagger(450),
      }),
    ];
  });

  return (
    <div ref={raizRef}>
      {Array.from({ length: EN_VUELO }, (_, i) => (
        <span
          key={`v${i}`}
          data-murcielago=""
          style={{ top: 0, left: 0, opacity: 0 }}
          className="decoracion-modo-murcielago decoracion-modo-vuelo absolute block h-4 w-7 -translate-x-full sm:h-5 sm:w-8"
        >
          <Murcielago className="size-full" />
        </span>
      ))}
      {Array.from({ length: COLGADOS }, (_, i) => (
        <span
          key={`c${i}`}
          data-murcielago-colgado=""
          style={{
            top: 50,
            left: `${34 + i * 16}vw`,
            transformOrigin: "50% 0",
          }}
          onClick={(evento) => {
            asustar(evento.currentTarget);
          }}
          className="decoracion-modo-murcielago pointer-events-auto absolute hidden h-4 w-6 cursor-pointer rotate-180 md:block"
        >
          <Murcielago className="size-full" />
        </span>
      ))}
    </div>
  );
}
