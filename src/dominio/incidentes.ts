import { GLOSARIO } from './glosario.ts'
import type { TonoInsignia } from '@/componentes/presentadores/Insignia'
import type { Incidente, OrigenIncidente, SujetoIncidente } from '@/datos/recursos'

/**
 * Como se nombra en pantalla a cada sujeto de un incidente.
 *
 * `proceso` sale del glosario y no escrito a mano: es el mismo recurso que el resto del panel
 * muestra como "Tarea", y un renombre futuro tiene que alcanzar tambien a esta pantalla.
 */
const SUJETOS: Record<SujetoIncidente, string> = {
  staff: 'Colaborador',
  contacto: 'Contacto',
  proceso: GLOSARIO.proceso.singular
}

/**
 * Quien estaba detras del error, en una linea.
 *
 * Devuelve `null` cuando la API no pudo atribuir la peticion a nadie —se cayo sin sesion, o antes de
 * resolverla—, para que la pantalla diga eso en vez de inventar un nombre. Vive aca y no en la
 * pagina porque el listado y el detalle muestran el mismo dato y tienen que decirlo igual.
 *
 * @param incidente la fila, o el detalle: solo se leen los tres campos del sujeto
 * @returns el sujeto listo para pintar, o `null` si el incidente no tiene ninguno
 */
export function describirSujeto (
  incidente: Pick<Incidente, 'sujeto_tipo' | 'sujeto_id' | 'sujeto_nombre'>
): string | null {
  if (incidente.sujeto_tipo === null) return null

  const tipo = SUJETOS[incidente.sujeto_tipo] ?? incidente.sujeto_tipo
  const nombre = incidente.sujeto_nombre ?? (incidente.sujeto_id === null ? null : `#${incidente.sujeto_id}`)

  return nombre === null ? tipo : `${tipo}: ${nombre}`
}

/**
 * Como se nombra y se pinta cada origen.
 *
 * El tono no es decorativo: `api` es un 500 con traza del servidor y es el caso mas grave, mientras
 * que uno del panel o del portal puede ser una pantalla que no se dibujo. Verlos distintos en el
 * listado ahorra abrir filas para descubrir de que tipo era cada una.
 */
const ORIGENES: Record<OrigenIncidente, { etiqueta: string, tono: TonoInsignia }> = {
  api: { etiqueta: 'API', tono: 'peligro' },
  panel: { etiqueta: 'Panel', tono: 'aviso' },
  portal: { etiqueta: 'Portal', tono: 'neutro' }
}

/**
 * El origen de un incidente, listo para pintar.
 *
 * Un origen que no este en la tabla se muestra tal cual y en neutro: la API puede empezar a
 * registrar un origen nuevo antes de que el panel lo conozca, y esconderlo seria peor que
 * mostrarlo sin nombre bonito.
 *
 * @param origen el valor que devolvio la API
 * @returns la etiqueta y el tono de la insignia
 */
export function describirOrigen (origen: OrigenIncidente): { etiqueta: string, tono: TonoInsignia } {
  return ORIGENES[origen] ?? { etiqueta: origen, tono: 'neutro' }
}
