import type { Metadata } from 'next'
import { SinPermiso } from '@/componentes/estado/Estados'
import { EstadoDeMisProyectos } from '@/componentes/portal/EstadoDeMisProyectos'
import { TOPE_DE_ESPACIOS } from '@/componentes/portal/estado'
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
 * === LOS DOS PEDIDOS, Y POR QUÉ SON DOS ===
 *
 * `GET /portal/resumen` trae los agregados de TODOS los {espacios}, sumados en el servidor: es lo
 * único que no miente cuando el cliente tiene más {espacios} de los que entran en una página.
 * `GET /portal/projects` trae la lista que el bloque de avance dibuja fila por fila. Los números
 * salen del primero y las filas del segundo, nunca al revés: contar sobre una lista paginada es el
 * error que el endpoint de resumen vino a matar.
 *
 * Los dos se piden con `sinFallar`, igual que la portada: una sección apagada para este contacto
 * responde 403 o 404, y eso no puede tumbar la pantalla entera. Sin el resumen no queda nada que
 * dibujar —es de donde sale todo lo transversal—, así que ahí sí se muestra la pantalla de sin
 * permiso; sin la lista, los agregados siguen valiendo y el bloque de avance lo explica solo.
 */
export default async function EstadoDelClientePagina () {
  const [resumen, espacios] = await Promise.all([
    sinFallar<ResumenPortal>('/portal/resumen'),
    sinFallar<EspacioPortal[]>(`/portal/projects?per_page=${TOPE_DE_ESPACIOS}`)
  ])

  if (resumen === null) return <SinPermiso />

  return <EstadoDeMisProyectos resumen={resumen} espacios={espacios} />
}
