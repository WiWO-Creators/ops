import { formatearFecha } from '../../lib/fechas.ts'

/**
 * Agrupacion del feed de actividad por dia.
 *
 * Vive en un `.ts` sin React ni `fetch` para que `pruebas/actividad.test.js` la pueda recorrer: es la
 * misma division que `overview.ts` y `timesheet.ts`. Los imports son relativos y con extension porque
 * el runner de Node no resuelve el alias `@/` fuera de `import type`.
 *
 * **Aca no se calcula ninguna fecha.** El dia y la hora salen de `formatearFecha`, el mismo
 * formateador que usa el resto del panel: derivar el dia con otra zona horaria haria que una entrada
 * de las 22:00 cayera en un dia distinto segun quien la pinte.
 */

/** Lo que `formatearFecha` devuelve cuando no hay fecha. Misma marca en todo el producto. */
const SIN_DATO = '—'

/**
 * Lo minimo que una entrada tiene que traer para pintarse.
 *
 * Se declara lo que se NECESITA y no el tipo del panel: la misma linea de tiempo la pintan el feed
 * del Espacio (`ActividadEspacio`), el historial de una persona y el portal del cliente
 * (`ActividadPortal`), y cada contrato trae campos de mas que acá no importan. Atarla a uno de los
 * tres era lo que obligaba a los otros a escribir su propia copia.
 *
 * `profile_image_url` es opcional porque el portal no lo manda: ahi el avatar sale con iniciales.
 */
export interface EntradaDeActividad {
  description: string
  additional_data: string | null
  date_added: string | null
  staff: { full_name: string, profile_image_url?: string | null } | null
  contact: { full_name: string } | null
}

/** Un dia del feed con sus entradas, en el orden en que las mando la API. */
export interface DiaDeActividad<T = EntradaDeActividad> {
  /** El dia ya formateado (`24 ago 2026`), o el guion largo si las entradas no traen fecha. */
  titulo: string
  entradas: T[]
}

/**
 * Parte el feed en dias.
 *
 * Agrupa **corridas consecutivas** y no por clave: la API devuelve el feed ordenado (`-date_added`) y
 * juntar entradas separadas por otro dia reordenaria lo que el backend ya ordeno. Si dos entradas del
 * mismo dia llegan separadas, salen como dos bloques, que es lo que el dato dice.
 *
 * @param entradas el feed tal como llego
 * @returns los dias, en el mismo orden en que llegaron las entradas
 */
export function agruparPorDia<T extends { date_added: string | null }> (
  entradas: T[]
): Array<DiaDeActividad<T>> {
  const dias: Array<DiaDeActividad<T>> = []

  for (const entrada of entradas) {
    const titulo = formatearFecha(entrada.date_added)
    const ultimo = dias[dias.length - 1]

    if (ultimo !== undefined && ultimo.titulo === titulo) {
      ultimo.entradas.push(entrada)
      continue
    }

    dias.push({ titulo, entradas: [entrada] })
  }

  return dias
}

/**
 * Hora de una entrada, sin la fecha.
 *
 * En la linea de tiempo el dia lo dice el encabezado del grupo, asi que repetirlo en cada fila es
 * ruido. Se saca restandole al texto con hora el texto sin hora, en vez de partir por la coma: el
 * separador lo pone `Intl` segun el locale y no es nuestro para asumirlo.
 *
 * @param valor instante ISO tal como llega en `date_added`
 * @returns la hora, o el guion largo cuando la entrada no trae una fecha usable
 */
export function horaDeEntrada (valor: string | null | undefined): string {
  const dia = formatearFecha(valor)
  const completo = formatearFecha(valor, true)

  // El guion largo y no cadena vacia: es lo que el resto del producto pone donde no hay dato, y una
  // celda en blanco en la canaleta se lee como un error de pintado y no como "esto no vino".
  if (dia === SIN_DATO || !completo.startsWith(dia)) return SIN_DATO

  return completo.slice(dia.length).replace(/^[\s,]+/, '')
}

/**
 * Quien hizo una entrada del feed.
 *
 * El backend manda `staff` cuando fue alguien del equipo, `contact` cuando fue el cliente desde el
 * portal, y ninguno de los dos cuando la genero el sistema. No se inventa un nombre: "Sistema" es el
 * mismo texto que ya usaba la columna de la tabla.
 *
 * @param entrada una entrada del feed
 * @returns el nombre a mostrar
 */
export function autorDeEntrada (entrada: EntradaDeActividad): string {
  return entrada.staff?.full_name ?? entrada.contact?.full_name ?? 'Sistema'
}
