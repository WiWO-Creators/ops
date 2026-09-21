import { notFound } from 'next/navigation'
import { pedir } from '@/datos/servidor'
import { ErrorApi } from '@/datos/errores'
import type { Estado } from './tipos'
import { Tablero } from './Tablero'
import './refugio.css'

export const metadata = { title: 'WiWO Ops' }

export default async function Pagina () {
  let estado: Estado

  try {
    const sobre = await pedir<Estado>('/refugio/estado')
    estado = sobre.data
  } catch (error) {
    // La API contesta 404 a quien no entra, igual que a un recurso inexistente. Se respeta tal cual:
    // una pantalla de "sin permiso" diria que aca hay algo.
    if (error instanceof ErrorApi && error.estado === 404) notFound()
    throw error
  }

  return <Tablero estado={estado} />
}
