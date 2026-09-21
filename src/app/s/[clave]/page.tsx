import { notFound } from 'next/navigation'
import { pedir } from '@/datos/servidor'
import { ErrorApi } from '@/datos/errores'
import type { Estado } from './tipos'
import { Tablero } from './Tablero'
import './panel.css'

export const metadata = { title: 'WiWO Ops' }

/**
 * El segmento no se valida aca y no hace falta: no es una credencial.
 *
 * Quien lo adivine igual se come el 404 de la API, que es la unica puerta. Lo que hace el segmento
 * es que la ruta no exista como texto en ningun bundle: viaja en `/me` y solo a quien entra.
 */
export default async function Pagina () {
  let estado: Estado

  try {
    const sobre = await pedir<Estado>('/mantenimiento/estado')
    estado = sobre.data
  } catch (error) {
    // La API contesta 404 a quien no entra, igual que a un recurso inexistente. Se respeta tal cual:
    // una pantalla de "sin permiso" diria que aca hay algo.
    if (error instanceof ErrorApi && error.estado === 404) notFound()
    throw error
  }

  // El camino de escritura viaja como prop y no escrito dentro de `Tablero`. `Tablero` es de
  // cliente: cualquier literal suyo termina en un chunk servido como archivo estatico. Esto en
  // cambio viaja en la carga RSC, que solo recibe quien ya entro.
  return <Tablero estado={estado} escritura="/api/bff/mantenimiento/interruptores" />
}
