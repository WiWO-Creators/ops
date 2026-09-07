import 'server-only'

import { pedirOpcional } from '@/datos/servidor'
import type { Cliente } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { CLIENTE_PERSONALES } from '@/definiciones/procesos'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Tope de Clientes que se traen para el selector.
 *
 * Es el maximo que acepta la API en una pagina — el mismo numero que usa el listado de Espacios. Con
 * mas Clientes que eso el selector deja de ser exhaustivo: el reemplazo es un filtro con busqueda
 * contra el servidor, no subir el numero.
 */
const TOPE_DE_OPCIONES = 100

/**
 * Opciones del filtro de Cliente de la vista de Procesos, para tabla y tablero.
 *
 * Vive aparte de las dos paginas porque las dos lo necesitan igual y una copia que se desincronice
 * deja el tablero filtrando distinto que la tabla.
 *
 * `pedirOpcional` y no `pedir`: `/clients` exige `customers.view` y le responde 403 a parte del
 * equipo. Sin permiso el selector no se dibuja —`ControlesTabla` oculta un filtro sin opciones— y el
 * resto de la pantalla carga igual.
 *
 * @returns Las opciones del desplegable: primero "Mis Procesos personales" y despues los Clientes por
 *          nombre. Lista vacia si `/clients` no contesto.
 */
export async function opcionesDeCliente (): Promise<OpcionFiltro[]> {
  const clientes = await pedirOpcional<Cliente[]>(`/clients?per_page=${TOPE_DE_OPCIONES}`)

  if (clientes.datos === null) return []

  return [
    { valor: CLIENTE_PERSONALES, etiqueta: `Mis ${GLOSARIO.proceso.plural.toLowerCase()} personales` },
    ...clientes.datos.map((cliente) => ({ valor: String(cliente.id), etiqueta: cliente.company }))
  ]
}
