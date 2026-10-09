/**
 * Geometria de la telaraña de una esquina (origen arriba a la izquierda, lienzo de 100x100) y la
 * secuencia en que la teje la araña. La comparten el dibujo (`Dibujos.tsx`) y la animacion
 * (`Telas.tsx`) para que los hilos y el recorrido de la araña no se desalineen.
 */

export type Punto = readonly [number, number];

/** Un tramo del recorrido: los puntos que sigue, y el hilo que va dejando (o `null` si solo camina). */
export interface Tramo {
  puntos: Punto[];
  /** Posicion del hilo en `HILOS`; `null` cuando camina sobre un hilo ya tejido. */
  hilo: number | null;
  /** `true` si recorre el hilo del final hacia el comienzo, para dibujarlo en ese sentido. */
  invertido: boolean;
}

const ORIGEN: Punto = [0, 0];

/** Extremos de los hilos que salen de la esquina. */
const RADIALES: Punto[] = [
  [100, 0],
  [94, 34],
  [78, 66],
  [52, 90],
  [22, 98],
  [0, 100],
];

/** Arcos entre el borde de arriba (`borde`, 0) y el de la izquierda (0, `borde`), con su control. */
const ARCOS: { borde: number; control: Punto }[] = [
  { borde: 20, control: [14, 14] },
  { borde: 40, control: [30, 30] },
  { borde: 60, control: [45, 45] },
  { borde: 80, control: [60, 60] },
  { borde: 98, control: [74, 74] },
];

/** Atributo `d` de cada hilo, en el orden en que se dibujan en el SVG: radiales y luego arcos. */
export const HILOS: string[] = [
  ...RADIALES.map(([x, y]) => `M0 0 L${x} ${y}`),
  ...ARCOS.map(
    ({ borde, control }) =>
      `M${borde} 0 Q${control[0]} ${control[1]} 0 ${borde}`,
  ),
];

/** Puntos de una curva cuadratica de Bezier, de la salida a la llegada. */
function puntosDeCurva(
  a: Punto,
  control: Punto,
  b: Punto,
  cantidad: number,
): Punto[] {
  return Array.from({ length: cantidad + 1 }, (_, i) => {
    const t = i / cantidad;
    const u = 1 - t;

    return [
      u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
    ] as const;
  });
}

/** Largo de una poligonal, para repartir el tiempo de cada tramo segun lo que recorre. */
export function largoDeTramo(puntos: Punto[]): number {
  return puntos.slice(1).reduce((suma, p, i) => {
    const previo = puntos[i] ?? p;

    return suma + Math.hypot(p[0] - previo[0], p[1] - previo[1]);
  }, 0);
}

/**
 * El recorrido completo de la araña: sale de la esquina por cada hilo radial y vuelve por el mismo
 * dejando el hilo, luego camina por los bordes tejiendo los arcos de a uno, alternando el sentido,
 * y se va. Cada tramo empieza donde terminó el anterior: la araña nunca se teletransporta.
 *
 * @returns los tramos en orden
 */
export function recorridoDeTejido(): Tramo[] {
  const tramos: Tramo[] = [];
  const caminar = (desde: Punto, hasta: Punto): void => {
    tramos.push({ puntos: [desde, hasta], hilo: null, invertido: false });
  };

  RADIALES.forEach((fin, i) => {
    tramos.push({ puntos: [ORIGEN, fin], hilo: i, invertido: false });
    caminar(fin, ORIGEN);
  });

  let enBordeSuperior = true;
  let actual: Punto = ORIGEN;

  ARCOS.forEach(({ borde, control }, i) => {
    const arriba: Punto = [borde, 0];
    const izquierda: Punto = [0, borde];
    const curva = puntosDeCurva(arriba, control, izquierda, 10);
    const salida = enBordeSuperior ? arriba : izquierda;

    caminar(actual, salida);
    tramos.push({
      puntos: enBordeSuperior ? curva : [...curva].reverse(),
      hilo: RADIALES.length + i,
      invertido: !enBordeSuperior,
    });
    actual = enBordeSuperior ? izquierda : arriba;
    enBordeSuperior = !enBordeSuperior;
  });

  caminar(actual, ORIGEN);
  caminar(ORIGEN, [-14, -14]);

  return tramos;
}
