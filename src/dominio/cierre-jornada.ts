/**
 * Reglas del cierre de jornada que no dependen de React ni de la red.
 *
 * El modal de cierre es la ultima pantalla del dia y la unica donde alguien mira el reparto completo
 * de su tiempo. Lo que se rompe en silencio aca es el **reparto**: un item que se pierde al agrupar,
 * un total que no cuadra con la suma de sus lineas o un orden que salta entre dos lecturas del mismo
 * resumen. Nada de eso lanza un error: solo deja a la persona confirmando un cierre que no dice la
 * verdad. Por eso vive aparte, en un `.ts`, y se prueba (`pruebas/cierre-jornada.test.js`).
 *
 * Los segundos NO se calculan aca. Llegan hechos de `GET /me/jornada/resumen`, igual que en el resto
 * de LIVE: el reloj de quien mira no entra en el dato. Esto solo los agrupa, los ordena y los suma.
 *
 * Lo que **no** se hace es sumar los items para contrastarlos con `measured_seconds`: el backend
 * recorta cada item por `start_time` dentro de la jornada, asi que un cronometro heredado del dia
 * anterior cuenta en `measured_seconds` y no aparece como linea. La suma de las lineas puede ser
 * legitimamente menor, y presentarlo como un descuadre seria inventar un error.
 */
import { GLOSARIO } from './glosario.ts'
import type { ItemDeResumen } from '@/datos/live'

/** Un Espacio del resumen, con sus lineas y su total ya sumado. */
export interface GrupoDeCierre {
  /** El Espacio, o `null` para el grupo de las Tareas sueltas. */
  espacioId: number | null
  /** Como se muestra el encabezado del grupo. */
  nombre: string
  /** Suma de los segundos de sus items. */
  segundos: number
  items: ItemDeResumen[]
}

/**
 * Los segundos de una linea, saneados.
 *
 * La API los manda enteros, pero un `null` mal serializado o un negativo por un desfase de reloj del
 * servidor convertirian el total en `NaN` y la pantalla en un guion. Un cero es peor dato que el
 * real, pero es un dato: `NaN` contamina la suma entera.
 *
 * @param item una linea del resumen
 * @returns segundos, nunca negativo y nunca `NaN`
 */
export function segundosDeItem (item: ItemDeResumen): number {
  const crudo = Number(item.seconds)

  return Number.isFinite(crudo) && crudo > 0 ? Math.floor(crudo) : 0
}

/**
 * Como se nombra la linea dentro de su grupo.
 *
 * Sin Tarea es tiempo medido sobre el Espacio a secas — lo que pasa cuando se arranca el medidor
 * desde la cabecera sin elegir Tarea— y se dice con palabras en vez de dejar la celda vacia: es
 * precisamente el tiempo que despues nadie sabe imputar, o sea lo que este modal existe para sacar a
 * la luz.
 *
 * @param item una linea del resumen
 * @returns el texto a mostrar; nunca vacio
 */
export function nombreDeItem (item: ItemDeResumen): string {
  return item.task?.name ?? `Sin ${GLOSARIO.proceso.singular.toLowerCase()}`
}

/**
 * Agrupa las lineas por Espacio: Proyecto → Tarea → tiempo, que es la jerarquia que se pidio.
 *
 * Las Tareas sueltas —las que no cuelgan de ningun Espacio— caen en un grupo propio que va **siempre
 * al final**, por el mismo motivo que en el tablero (`agruparPorEspacio`): son las lineas de menos
 * informacion y no pueden encabezar la lista. El grupo no se emite si no hay ninguna.
 *
 * El orden es por tiempo descendente y, a igualdad, alfabetico. No por el orden en que llego la
 * respuesta: tras agregar una linea el resumen se vuelve a pedir, y un orden que dependa del backend
 * hace saltar de lugar los grupos que la persona esta leyendo.
 *
 * No se reusa `agruparPorEspacio()` de `live/presentacion.ts`: aquella agrupa **personas** de
 * `GET /live` por el Espacio de su medidor y ordena por actividad. Ni la entrada ni el criterio de
 * orden son los mismos; compartirlas obligaria a una funcion con dos formas y dos ordenes.
 *
 * @param items las lineas tal como llegan de `GET /me/jornada/resumen`
 * @returns los grupos ya ordenados, con sus items ordenados dentro; lista vacia si no hay lineas
 */
export function agruparCierre (items: ItemDeResumen[]): GrupoDeCierre[] {
  const grupos = new Map<string, GrupoDeCierre>()

  for (const item of items) {
    const espacio = item.project ?? null
    const clave = espacio === null ? 'sin-espacio' : `espacio:${espacio.id}`

    const grupo = grupos.get(clave) ?? {
      espacioId: espacio?.id ?? null,
      nombre: espacio?.name ?? `Sin ${GLOSARIO.espacio.singular.toLowerCase()}`,
      segundos: 0,
      items: []
    }

    grupo.items.push(item)
    grupo.segundos += segundosDeItem(item)
    grupos.set(clave, grupo)
  }

  for (const grupo of grupos.values()) {
    grupo.items.sort((a, b) => segundosDeItem(b) - segundosDeItem(a) || nombreDeItem(a).localeCompare(nombreDeItem(b), 'es'))
  }

  return [...grupos.values()].sort(compararGrupos)
}

/** El grupo sin Espacio siempre ultimo; el resto por tiempo y, a igualdad, alfabetico. */
function compararGrupos (a: GrupoDeCierre, b: GrupoDeCierre): number {
  if (a.espacioId === null) return 1
  if (b.espacioId === null) return -1

  return b.segundos - a.segundos || a.nombre.localeCompare(b.nombre, 'es')
}
