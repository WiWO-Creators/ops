import { GLOSARIO } from '../../dominio/glosario.ts'
import type { FilaDeLive } from '@/datos/live'

/**
 * Como se ordena el tablero del equipo antes de pintarlo.
 *
 * Vive fuera del `.tsx` por lo mismo que `componentes/proyecto/cronometro.ts`: Node despoja los tipos
 * de un `.ts` pero no el JSX, asi que solo lo que esta fuera del componente se puede probar. Y esto
 * merece prueba: un agrupado que pierde una fila deja a una persona invisible en el tablero de su
 * jefatura, y nadie la echa de menos porque no sabe que faltaba.
 *
 * Sin React y sin `fetch`: recibe filas y devuelve filas ordenadas.
 */

/** Clave del grupo de quien no esta midiendo nada, o mide algo sin Espacio detras. */
const CLAVE_SIN_ESPACIO = 'sin-espacio'

/** Un Espacio con la gente que lo esta midiendo ahora. */
export interface GrupoEnVivo {
  /** Unica en la lista: `espacio:{id}` o `sin-espacio`. Sirve de `key` de React. */
  clave: string
  nombre: string
  personas: FilaDeLive[]
}

/**
 * Agrupa el equipo por el Espacio que cada quien esta midiendo.
 *
 * Es un arbol de UN nivel a proposito, y no el de tres de `arbolDePresencia`. LIVE contesta "¿en que
 * esta trabajando el equipo ahora?", y la respuesta util es el Espacio: colgar ademas cliente y
 * proceso mete dos niveles de pliegue entre quien mira y el unico dato que vino a buscar.
 *
 * Quien no tiene medidor —o mide un proceso suelto, sin Espacio— cae en un grupo propio que va
 * **siempre al final**: son las filas de menos informacion y no pueden encabezar el tablero. El
 * grupo se omite entero si no hay nadie ahi.
 *
 * El nombre del grupo sobrante sale del glosario y no escrito a mano: la interfaz llama a un Espacio
 * "Proyecto", y ese renombre tiene que seguir siendo un archivo.
 *
 * El orden de los Espacios es por cantidad de gente y, a igualdad, alfabetico. No por id ni por el
 * orden en que llegaron: los dos hacen saltar los grupos de lugar entre un refresco y el siguiente,
 * justo mientras alguien los esta leyendo.
 *
 * @param filas el tablero tal como llega de `GET /live`
 * @returns los grupos ya ordenados; lista vacia si no hay nadie
 */
export function agruparPorEspacio (filas: FilaDeLive[]): GrupoEnVivo[] {
  const grupos = new Map<string, GrupoEnVivo>()

  for (const fila of filas) {
    const espacio = fila.medidor?.project ?? null
    const clave = espacio === null ? CLAVE_SIN_ESPACIO : `espacio:${espacio.id}`
    const nombre = espacio === null ? `Sin ${GLOSARIO.espacio.singular.toLowerCase()}` : espacio.name

    const grupo = grupos.get(clave) ?? { clave, nombre, personas: [] }
    grupo.personas.push(fila)
    grupos.set(clave, grupo)
  }

  for (const grupo of grupos.values()) grupo.personas.sort(compararPersonas)

  return [...grupos.values()].sort(compararGrupos)
}

/**
 * Quien esta midiendo va antes que quien solo tiene jornada, y ese antes que quien no tiene nada.
 *
 * A igualdad, alfabetico por nombre: cualquier otro criterio —el id, el orden de la API— reordena la
 * lista sola en cada refresco.
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

/** Los Espacios por cantidad de gente, y el grupo sin Espacio siempre ultimo. */
function compararGrupos (a: GrupoEnVivo, b: GrupoEnVivo): number {
  if (a.clave === CLAVE_SIN_ESPACIO) return 1
  if (b.clave === CLAVE_SIN_ESPACIO) return -1

  const porGente = b.personas.length - a.personas.length

  if (porGente !== 0) return porGente

  return a.nombre.localeCompare(b.nombre, 'es')
}
