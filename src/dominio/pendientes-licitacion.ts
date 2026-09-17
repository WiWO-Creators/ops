import { GLOSARIO } from './glosario.ts'

/**
 * Lo que una Licitacion quedo debiendo al crearse, sin nada de React ni de Next.
 *
 * === QUE PROBLEMA RESUELVE ===
 *
 * El alta de una Licitacion se frenaba en la persona de contacto: el flujo exigia cargar una antes
 * de llegar al tercer paso, y el dia que se abre una licitacion no siempre se sabe a quien llamar.
 * Lo que pasaba era peor que el hueco: se inventaba un contacto para poder seguir. Lo mismo con el
 * {@link GLOSARIO.focal}, que ya era opcional y por eso se quedaba vacio sin que nadie se enterara.
 *
 * Asi que los dos se pueden dejar para despues, y esto es lo que hace que "despues" exista: la ficha
 * pregunta que falta y lo dice arriba de todo, con el camino para completarlo.
 *
 * === POR QUE SOLO LAS ABIERTAS ===
 *
 * Una licitacion ganada o perdida ya no se puede completar: nombrarle un focal a algo cerrado no
 * cambia nada, y el aviso seria ruido historico permanente en una ficha que solo se consulta. Es el
 * mismo corte que hace la banda de plazos (`alertas-licitacion.ts`), y por el mismo motivo.
 *
 * === POR QUE UNA CUENTA Y NO LA LISTA DE CONTACTOS ===
 *
 * Porque lo unico que se decide aca es si hay alguien. La API manda `prospecto.contactos_count` en
 * la misma consulta del listado, asi que saberlo no cuesta una peticion mas; traer las personas
 * enteras si, y no se pintan: se leen y se editan en el prospecto, que es donde viven.
 *
 * Node puede ejecutar este archivo tal cual (`pruebas/pendientes-licitacion.test.js`): por eso no
 * importa nada del framework, las importaciones son relativas y los tipos de entrada son
 * estructurales minimos.
 */

/** Que quedo pendiente. Son claves, no texto: el rotulo se arma aparte y puede cambiar. */
export type ClaveDePendiente = 'contacto' | 'focal'

/** Lo minimo que hace falta de una Licitacion para saber que le falta. */
export interface LicitacionParaPendientes {
  id: number
  estado: string
  prospecto_id: number
  prospecto: { empresa: string, contactos_count: number }
  focal_id: number | null
}

/** Un pendiente, ya con el texto que se lee y el camino para resolverlo. */
export interface PendienteDeLicitacion {
  clave: ClaveDePendiente
  /** El rotulo corto de la insignia. */
  titulo: string
  /** Que falta y por que importa, en una frase. */
  detalle: string
  /**
   * A donde ir a completarlo, cuando se completa en OTRA pantalla.
   *
   * `null` significa que se resuelve en la ficha misma y no que no se pueda resolver: el
   * {@link GLOSARIO.focal} se nombra ahi mismo, y mandar a la persona a otro lado para elegir de una
   * lista de dos casillas seria un viaje de ida y vuelta para nada.
   */
  enlace: { href: string, etiqueta: string } | null
}

/**
 * Que le falta a una Licitacion para estar completa.
 *
 * @param licitacion la licitacion ya cargada, del listado o de la ficha
 * @returns los pendientes en el orden en que conviene resolverlos; vacio si no falta nada o si la
 *   licitacion ya esta cerrada
 */
export function pendientesDeLicitacion (
  licitacion: LicitacionParaPendientes
): PendienteDeLicitacion[] {
  if (licitacion.estado !== 'abierta') return []

  const pendientes: PendienteDeLicitacion[] = []

  // El contacto va primero: es el que bloquea el trabajo comercial —sin el no hay a quien
  // escribirle— y ademas es el que se copia al cliente el dia que la licitacion se gana.
  if (licitacion.prospecto.contactos_count <= 0) {
    pendientes.push({
      clave: 'contacto',
      titulo: 'Falta la persona de contacto',
      detalle: `Todavía no hay a quién escribirle en ${licitacion.prospecto.empresa}. Las personas de contacto viven en el prospecto y se copian al cliente el día que esta ${nombreDeLicitacion()} se gane.`,
      enlace: {
        href: `/prospectos/${licitacion.prospecto_id}?tab=contactos`,
        etiqueta: 'Cargar contacto en el prospecto'
      }
    })
  }

  if (licitacion.focal_id === null) {
    pendientes.push({
      clave: 'focal',
      titulo: `Falta el ${GLOSARIO.focal.singular}`,
      detalle: `Nadie responde por esta ${nombreDeLicitacion()} en el día a día. Puede ser la misma persona que el owner.`,
      enlace: null
    })
  }

  return pendientes
}

/** El nombre visible de una Licitacion en minuscula, para meterlo dentro de una frase. */
function nombreDeLicitacion (): string {
  return GLOSARIO.licitacion.singular.toLowerCase()
}
