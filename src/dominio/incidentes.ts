import { GLOSARIO } from './glosario'
import type { Incidente, SujetoIncidente } from '@/datos/recursos'

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
