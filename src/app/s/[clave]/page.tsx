import { notFound } from 'next/navigation'
import { pedir } from '@/datos/servidor'
import { ErrorApi } from '@/datos/errores'
import type { Estado, Horario, TextosHorario } from './tipos'
import { Tablero } from './Tablero'
import './panel.css'

export const metadata = { title: 'WiWO Ops' }

type EstadoApi = Omit<Estado, 'horario'> & { rutina: Horario }

const TEXTOS_HORARIO: TextosHorario = {
  rotulo: 'Rutina',
  interruptor: 'Rutina diaria',
  nota: 'Lunes a viernes, a la hora fijada. Se salta los días omitidos, los que ya tienen registro y los '
    + 'que pasaron más de una hora de la fijada.'
}

/**
 * El segmento no se valida aca y no hace falta: no es una credencial.
 *
 * Quien lo adivine igual se come el 404 de la API, que es la unica puerta. Lo que hace el segmento
 * es que la ruta no exista como texto en ningun bundle: viaja en `/me` y solo a quien entra.
 */
export default async function Pagina () {
  let estado: Estado

  try {
    const { rutina: horario, ...resto } = (await pedir<EstadoApi>('/mantenimiento/estado')).data
    estado = { ...resto, horario }
  } catch (error) {
    // La API contesta 404 a quien no entra, igual que a un recurso inexistente. Se respeta tal cual:
    // una pantalla de "sin permiso" diria que aca hay algo.
    if (error instanceof ErrorApi && error.estado === 404) notFound()
    throw error
  }

  // Los caminos de escritura y los textos de la rutina viajan como props y no escritos
  // dentro de `Tablero`. `Tablero` es de cliente: cualquier literal suyo termina en un chunk servido
  // como archivo estatico. Esto en cambio viaja en la carga RSC, que solo recibe quien ya entro.
  return (
    <Tablero
      estado={estado}
      escritura="mantenimiento/interruptores"
      escrituraHorario="mantenimiento/rutina"
      textosHorario={TEXTOS_HORARIO}
    />
  )
}
