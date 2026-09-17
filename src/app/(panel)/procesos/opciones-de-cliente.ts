import 'server-only'

import { pedirOpcional } from '@/datos/servidor'
import type { ClienteMinimo } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { CLIENTE_PERSONALES } from '@/definiciones/procesos'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Tope de Clientes que se traen para el selector.
 *
 * Es el maximo que acepta la API en una pagina — el mismo numero que usa el listado de Espacios. Con
 * cien, la cartera —que pasa de ciento veinte— se cortaba a mitad del alfabeto y el filtro escondia
 * Clientes que existen.
 */
const TOPE_DE_OPCIONES = 500

/**
 * Opciones del filtro de Cliente de la vista de Procesos, para tabla y tablero.
 *
 * Vive aparte de las dos paginas porque las dos lo necesitan igual y una copia que se desincronice
 * deja el tablero filtrando distinto que la tabla.
 *
 * `/clients/minimos` y no `/clients`: trae la cartera entera con lo unico que el filtro necesita
 * —id y razon social— y corre antes de la compuerta de `customers.view`, que le responde 403 a parte
 * del equipo. `pedirOpcional` se conserva igual: si la ruta falla, el filtro no se dibuja
 * —`ControlesTabla` oculta un filtro sin opciones— y el resto de la pantalla carga.
 *
 * @returns Las opciones del desplegable: primero "Mis Procesos personales" y despues los Clientes por
 *          nombre. Lista vacia si la cartera no contesto.
 */
export async function opcionesDeCliente (): Promise<OpcionFiltro[]> {
  const clientes = await pedirOpcional<ClienteMinimo[]>(`/clients/minimos?sort=company&per_page=${TOPE_DE_OPCIONES}`)

  if (clientes.datos === null) return []

  return [
    { valor: CLIENTE_PERSONALES, etiqueta: `Mis ${GLOSARIO.proceso.plural.toLowerCase()} personales` },
    ...clientes.datos.map((cliente) => ({ valor: String(cliente.id), etiqueta: cliente.company }))
  ]
}
