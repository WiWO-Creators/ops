"use client";

import { animate, createTimeline, stagger, svg, utils } from "animejs";
import { Telarana } from "./Dibujos";
import {
  largoDeTramo,
  recorridoDeTejido,
  type Punto,
  type Tramo,
} from "./telaranaTrazo";
import {
  crearAgenda,
  useAnimacionDeModo,
  type Agenda,
} from "./useAnimacionDeModo";

/** Velocidad de la araña, en unidades del lienzo (100x100) por milisegundo: tejiendo y caminando. */
const VELOCIDAD_TEJIENDO = 0.32;
const VELOCIDAD_CAMINANDO = 0.7;
/** Un tramo nunca dura menos que esto, para que se vea el gesto. */
const MINIMO_MS = 90;
/** Lo que tarda la tela en deshacerse. */
const DESHACER_MS = 3600;
/** Cuanto queda tejida cada tela antes de deshacerse, y cuanto espera vacía antes de volver a tejerse. */
const VIVA_MS = [7_200_000, 10_800_000] as const;
const VACIA_MS = [5000, 15_000] as const;
/** Desfase entre esquinas para que casi nunca se esté tejiendo mas de una a la vez. */
const DESFASE_MS = 40_000;
/** Cada cuanto se vuelve a mirar si una tela escondida por el ancho de pantalla ya se ve. */
const REVISAR_MS = 5000;

/**
 * Angulo (en grados, con la cabeza de la araña mirando hacia arriba) para avanzar de `a` a `b`.
 *
 * @param a punto de partida
 * @param b punto de llegada
 * @returns el angulo en grados
 */
function anguloHacia(a: Punto, b: Punto): number {
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 90;
}

/**
 * Angulos de cada punto de un tramo, ajustados para que dos seguidos nunca difieran en mas de 180°:
 * asi anime.js no hace girar a la araña una vuelta entera al cruzar de -180 a 180.
 *
 * @param puntos los puntos del tramo
 * @param previo el angulo con que terminó el tramo anterior
 * @returns un angulo por punto
 */
function angulosDeTramo(puntos: Punto[], previo: number): number[] {
  const resultado: number[] = [];
  let anterior = previo;

  puntos.forEach((_, i) => {
    const desde = puntos[Math.max(i - 1, 0)];
    const hasta = puntos[Math.max(i, 1)];

    if (desde === undefined || hasta === undefined) return;
    let angulo = anguloHacia(desde, hasta);

    while (angulo - anterior > 180) angulo -= 360;
    while (angulo - anterior < -180) angulo += 360;
    resultado.push(angulo);
    anterior = angulo;
  });

  return resultado;
}

/**
 * Teje una tela: la araña recorre los tramos y cada hilo se dibuja a la par que ella lo pasa.
 *
 * @param tejedora la araña de esa tela
 * @param hilos los hilos dibujables, en el orden de `HILOS`
 * @param tramos el recorrido
 * @param alTerminar se llama cuando la araña ya se fue
 * @returns el timeline, para registrarlo en la agenda
 */
function tejer(
  tejedora: SVGGElement,
  hilos: ReturnType<typeof svg.createDrawable>,
  tramos: Tramo[],
  alTerminar: () => void,
) {
  const linea = createTimeline({
    defaults: { ease: "linear" },
    onComplete: alTerminar,
  });
  let cursor = 0;
  let angulo = 0;

  linea.add(tejedora, { opacity: [0, 0.85], duration: 300 }, 0);
  for (const tramo of tramos) {
    const duracion = Math.max(
      MINIMO_MS,
      largoDeTramo(tramo.puntos) /
        (tramo.hilo === null ? VELOCIDAD_CAMINANDO : VELOCIDAD_TEJIENDO),
    );
    const giros = angulosDeTramo(tramo.puntos, angulo);

    angulo = giros[giros.length - 1] ?? angulo;
    linea.add(
      tejedora,
      {
        translateX: tramo.puntos.map((p) => p[0]),
        translateY: tramo.puntos.map((p) => p[1]),
        rotate: giros,
        duration: duracion,
      },
      cursor,
    );
    const hilo = tramo.hilo === null ? undefined : hilos[tramo.hilo];

    if (hilo !== undefined) {
      linea.add(
        hilo,
        {
          draw: tramo.invertido ? ["1 1", "0 1"] : ["0 0", "0 1"],
          duration: duracion,
        },
        cursor,
      );
    }
    cursor += duracion;
  }
  linea.add(tejedora, { opacity: 0, duration: 400 }, cursor - 400);

  return linea;
}

/**
 * Programa el ciclo de una tela: se teje, queda un rato, se deshace, espera vacia y vuelve a
 * tejerse. Si la tela no se ve (esquina de abajo en pantallas chicas) espera y vuelve a mirar.
 *
 * @param tela el SVG de la esquina
 * @param agenda la agenda de la pieza
 * @param espera cuanto esperar antes del primer tejido
 */
function programarCiclo(
  tela: SVGSVGElement,
  agenda: Agenda,
  espera: number,
): void {
  const hilos = svg.createDrawable(tela.querySelectorAll("[data-hilo]"));
  const tejedora = tela.querySelector<SVGGElement>("[data-tejedora]");
  const tramos = recorridoDeTejido();

  utils.set(hilos, { draw: "0 0" });
  if (tejedora === null) return;

  const volverAEmpezar = (ms: number): void => {
    agenda.en(ms, empezar);
  };
  const deshacer = (): void => {
    agenda.guardar(
      animate(hilos, {
        draw: ["0 1", "1 1"],
        duration: DESHACER_MS,
        ease: "inOutQuad",
        delay: stagger(110),
        onComplete: () => {
          volverAEmpezar(utils.random(...VACIA_MS));
        },
      }),
    );
  };
  const empezar = (): void => {
    if (tela.getClientRects().length === 0) {
      volverAEmpezar(REVISAR_MS);
      return;
    }
    agenda.guardar(
      tejer(tejedora, hilos, tramos, () => {
        agenda.en(utils.random(...VIVA_MS), deshacer);
      }),
    );
  };

  volverAEmpezar(espera);
}

/**
 * Telarañas en las cuatro esquinas, tejidas por una araña: recorre los hilos dibujándolos, se va, y
 * la tela queda un rato antes de deshacerse hilo a hilo y volver a tejerse. Las esquinas van
 * desfasadas, asi que casi siempre se ve a lo mas una en obra.
 *
 * Con menos movimiento las telas quedan completas y quietas, y la araña no se muestra. Las de abajo
 * son mas chicas para no tapar la barra lateral ni el orbe.
 */
export function Telas() {
  const raizRef = useAnimacionDeModo<HTMLDivElement>((raiz) => {
    const agenda = crearAgenda();
    const telas = raiz.querySelectorAll<SVGSVGElement>("[data-tela]");

    telas.forEach((tela, i) => {
      programarCiclo(tela, agenda, 600 + i * DESFASE_MS);
    });

    return [agenda];
  });

  return (
    <div ref={raizRef}>
      <Telarana
        data-tela=""
        className="decoracion-modo-tela absolute top-0 left-0 size-28 sm:size-40"
      />
      <Telarana
        data-tela=""
        className="decoracion-modo-tela absolute top-0 right-0 size-28 -scale-x-100 sm:size-40"
      />
      <Telarana
        data-tela=""
        className="decoracion-modo-tela absolute bottom-0 left-0 hidden size-24 -scale-y-100 md:block"
      />
      <Telarana
        data-tela=""
        className="decoracion-modo-tela absolute right-0 bottom-0 hidden size-24 -scale-100 md:block"
      />
    </div>
  );
}
