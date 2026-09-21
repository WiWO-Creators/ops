import type { Metadata } from 'next'
import { SinPermiso } from '@/componentes/estado/Estados'
import { EstadoDeMisProyectos } from '@/componentes/portal/EstadoDeMisProyectos'
import { TOPE_DE_DETALLES, TOPE_DE_ESPACIOS } from '@/componentes/portal/estado'
import type { ResumenDeProyecto } from '@/componentes/proyecto/overview'
import type { EspacioPortal, ResumenPortal } from '@/datos/portal'
import { GLOSARIO } from '@/dominio/glosario'
import { sinFallar } from '../detalle'

export const metadata: Metadata = {
  title: `Estado de mis ${GLOSARIO.espacio.plural.toLowerCase()} · Portal de clientes`
}

/**
 * El estado de los {espacios} del cliente: cómo van y qué necesita algo de su parte.
 *
 * Server Component puro, sin parámetros de URL: a diferencia del tablero de gestión, esta pantalla
 * no tiene estado —no hay mes que elegir ni filtro que guardar—, así que el enlace es siempre el
 * mismo y siempre muestra lo de hoy.
 *
 * === LOS TRES PEDIDOS, Y POR QUÉ SON TRES ===
 *
 * `GET /portal/resumen` trae los agregados de TODOS los {espacios}, sumados en el servidor: es lo
 * único que no miente cuando el cliente tiene más {espacios} de los que entran en una página.
 * `GET /portal/projects` trae la lista que el bloque de avance dibuja tarjeta por tarjeta. Los
 * números salen del primero y las tarjetas del segundo, nunca al revés: contar sobre una lista
 * paginada es el error que el endpoint de resumen vino a matar.
 *
 * El tercero es `GET /portal/projects/{id}/overview`, **uno por {espacio}**. Es el precio de que
 * esto sea un dashboard y no un índice: no existe ninguna ruta que traiga el detalle de varios
 * {espacios} a la vez, y sin él la tarjeta no puede decir cuántos {hitos} del {espacio} están
 * vencidos de verdad —`proximos_hitos` viene recortada— ni cuánto queda del plazo. Se piden en
 * paralelo y con tope: ver {@link TOPE_DE_DETALLES}.
 *
 * Todos se piden con `sinFallar`, igual que la portada: una sección apagada para este contacto
 * responde 403 o 404, y eso no puede tumbar la pantalla entera. Sin el resumen no queda nada que
 * dibujar —es de donde sale todo lo transversal—, así que ahí sí se muestra la pantalla de sin
 * permiso; sin la lista, los agregados siguen valiendo y el bloque de avance lo explica solo; y sin
 * el detalle de un {espacio} concreto, su tarjeta se dibuja con lo que trae la lista.
 */
export default async function EstadoDelClientePagina () {
  const [resumen, espacios] = await Promise.all([
    sinFallar<ResumenPortal>('/portal/resumen'),
    sinFallar<EspacioPortal[]>(`/portal/projects?per_page=${TOPE_DE_ESPACIOS}`)
  ])

  if (resumen === null) return <SinPermiso />

  const detalles = await detallesDeLosEspacios(espacios ?? [])

  return <EstadoDeMisProyectos resumen={resumen} espacios={espacios} detalles={detalles} />
}

/**
 * Pide el detalle de cada {espacio}, en paralelo y tolerando el que no se pueda.
 *
 * Un {espacio} que no comparte la pestaña de resumen responde 403 y queda fuera del mapa; su tarjeta
 * se dibuja igual con lo que trae la lista. Por eso cada pedido se aísla: un `Promise.all` que se
 * rechaza por uno solo dejaría sin detalle a los otros once, y eso es peor que no pedirlo.
 *
 * @param espacios las filas del listado, en el orden en que llegaron
 * @returns el detalle por id; los {espacios} que no lo comparten no están en el mapa
 */
async function detallesDeLosEspacios (
  espacios: readonly EspacioPortal[]
): Promise<Map<number, ResumenDeProyecto>> {
  const pedidos = espacios.slice(0, TOPE_DE_DETALLES).map(
    async (espacio) => [
      espacio.id,
      await sinFallar<ResumenDeProyecto>(`/portal/projects/${espacio.id}/overview`)
    ] as const
  )

  const detalles = new Map<number, ResumenDeProyecto>()

  for (const [id, detalle] of await Promise.all(pedidos)) {
    if (detalle !== null) detalles.set(id, detalle)
  }

  return detalles
}
