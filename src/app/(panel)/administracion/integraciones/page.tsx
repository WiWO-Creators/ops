import type { ReactElement } from 'react'
import { IntegracionesAdmin } from '@/componentes/administracion/IntegracionesAdmin'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { IntegracionDeAccesos } from '@/datos/accesos'

export const metadata = { title: 'Integraciones · WiWO Ops' }

/**
 * Las integraciones: los otros sistemas que usan Ops sin ser una persona.
 *
 * **Sin compuerta por rol en esta página, a propósito**, igual que Pantallas: la de verdad la pone la
 * API, que exige superadministrador en todas las rutas de `/accesos`. Replicarla acá sería una segunda
 * copia que puede desincronizarse, y esconder no autoriza.
 */
export default async function IntegracionesPage (): Promise<ReactElement> {
  const cargado = await cargar()

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Integraciones"
        descripcion="Los sistemas de WiWO (Metriq, WiwoLab…) que usan Ops en nombre de una persona, identificada por su correo. Todo lo que escriben llega como propuesta que la persona aprueba en Propuestas."
      />

      {cargado instanceof ErrorApi
        ? cargado.codigo === 'forbidden'
          ? <SinPermiso />
          : <ErrorEstado detalle={cargado.message} />
        : <IntegracionesAdmin inicial={cargado} />}
    </section>
  )
}

/** Trae las integraciones vivas, o el error de la API como valor (sin JSX dentro del `try`). */
async function cargar (): Promise<IntegracionDeAccesos[] | ErrorApi> {
  try {
    return (await pedir<IntegracionDeAccesos[]>('/accesos/integraciones')).data
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}
