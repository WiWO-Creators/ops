import { GLOSARIO } from '../../dominio/glosario.ts'
import type { FilaDeLive, StaffEnVivo } from '@/datos/live'

/**
 * Como se lee y como se ordena el tablero del equipo antes de pintarlo.
 *
 * Vive fuera del `.tsx` por lo mismo que `componentes/proyecto/cronometro.ts`: Node despoja los tipos
 * de un `.ts` pero no el JSX, asi que solo lo que esta fuera del componente se puede probar. Y esto
 * merece prueba: un orden que se reacomoda solo mueve las filas bajo el dedo de quien las lee, y una
 * jerarquia que se come un nivel deja a alguien "trabajando en nada" sin que se note por que.
 *
 * Sin React y sin `fetch`: recibe filas y devuelve texto y orden.
 */

/** Un escalon de la jerarquia de una fila: el Espacio, o la Tarea, ya traducidos a la interfaz. */
export interface NivelDeTrabajo {
  /** Como llama la interfaz a este nivel. Sale del glosario, nunca escrito a mano. */
  etiqueta: string
  /** El nombre, o el aviso de que todavia no hay ninguno. */
  valor: string
  /** `true` cuando `valor` es el aviso y no un nombre: se pinta distinto. */
  pendiente: boolean
}

/**
 * En que esta trabajando una persona, en el orden en que se lee.
 *
 * Union discriminada y no un objeto con campos opcionales: quien mide tiene niveles y no motivo, y
 * quien no mide tiene motivo y no niveles. Un solo objeto con los dos obligaria a cada consumidor a
 * comprobar cual de los dos vino, que es exactamente la comprobacion que `midiendo` ya hace.
 */
export type TrabajoEnVivo =
  | { midiendo: true, niveles: NivelDeTrabajo[] }
  | { midiendo: false, motivo: string }

/**
 * Que cuelga de una persona en el tablero: el Espacio primero, la Tarea despues.
 *
 * Los dos niveles se devuelven **siempre** que haya medidor, incluso vacios. Un medidor de Espacio
 * sin Tarea elegida es el caso que la pantalla existe para delatar —es tiempo que despues no se puede
 * imputar a nada— y esconderlo tras un hueco lo vuelve invisible justo para quien tendria que
 * pedirlo. Lo mismo con el medidor huerfano, que la API admite y `datos/live.ts` documenta: se
 * muestra tal como esta en vez de desaparecer de la lista.
 *
 * Cuando no hay medidor no hay jerarquia que colgar, y lo que queda es el motivo: o no hay jornada
 * abierta —y entonces ningun cronometro puede arrancar— o la hay y nadie arranco ninguno.
 *
 * @param fila una persona tal como llega de `GET /live`
 * @returns los dos niveles si mide, o la frase que explica por que no
 */
export function trabajoDeLaFila (fila: FilaDeLive): TrabajoEnVivo {
  const { medidor, jornada } = fila

  if (medidor === null) {
    return {
      midiendo: false,
      motivo: jornada === null ? 'Sin jornada abierta' : 'Con jornada, sin medir'
    }
  }

  return {
    midiendo: true,
    niveles: [
      {
        etiqueta: GLOSARIO.espacio.singular,
        valor: medidor.project?.name ?? `Sin ${GLOSARIO.espacio.singular.toLowerCase()}`,
        pendiente: medidor.project === null
      },
      {
        etiqueta: GLOSARIO.proceso.singular,
        valor: medidor.task?.name ?? `Falta elegir ${GLOSARIO.proceso.singular}`,
        pendiente: medidor.task === null
      }
    ]
  }
}

/**
 * El titulo de una persona: su cargo y su area, en una linea.
 *
 * Los dos campos vienen de la ficha de Perfex y los dos pueden faltar o venir en blanco, asi que se
 * limpian antes de unirlos: un `" · "` suelto bajo un nombre no dice nada y parece un error de
 * pintado. Se deduplican porque en varias fichas el cargo repite el area ("Diseño" en las dos), y
 * "Diseño · Diseño" es ruido.
 *
 * @param staff la persona de la fila
 * @returns la linea lista para mostrar, o `null` si no hay nada que decir
 */
export function cargoYArea (staff: Pick<StaffEnVivo, 'cargo' | 'area'>): string | null {
  const partes = [staff.cargo, staff.area]
    .map((parte) => parte?.trim() ?? '')
    .filter((parte) => parte.length > 0)

  if (partes.length === 0) return null

  return [...new Set(partes)].join(' · ')
}

/**
 * El tablero ordenado: quien mide arriba, quien solo tiene jornada despues, el resto al final.
 *
 * Reemplaza al agrupado por Espacio. Con la persona como raiz de la jerarquia, un encabezado de
 * Espacio sobre un grupo repetiria el mismo Proyecto que ya dice cada fila —dos veces el mismo dato,
 * uno encima del otro— y ademas partiria en dos listas a la gente que no esta midiendo.
 *
 * Devuelve una copia: `filas` es el estado de React y ordenarlo en el sitio lo mutaria, que es como
 * se consiguen los repintados que no ocurren.
 *
 * @param filas el tablero tal como llega de `GET /live`
 * @returns las mismas filas, ordenadas; nunca la lista original
 */
export function ordenarPorActividad (filas: FilaDeLive[]): FilaDeLive[] {
  return [...filas].sort(compararPersonas)
}

/**
 * Quien esta midiendo va antes que quien solo tiene jornada, y ese antes que quien no tiene nada.
 *
 * A igualdad, alfabetico por nombre: cualquier otro criterio —el id, el orden de la API— reordena la
 * lista sola en cada refresco, y el tablero se repregunta cada treinta segundos mientras alguien lo
 * esta leyendo.
 */
function compararPersonas (a: FilaDeLive, b: FilaDeLive): number {
  const peso = rangoDeActividad(b) - rangoDeActividad(a)

  if (peso !== 0) return peso

  return a.staff.name.localeCompare(b.staff.name, 'es')
}

/** 2 midiendo, 1 con jornada abierta, 0 sin nada. */
function rangoDeActividad (fila: FilaDeLive): number {
  if (fila.medidor !== null) return 2
  if (fila.jornada !== null) return 1

  return 0
}
