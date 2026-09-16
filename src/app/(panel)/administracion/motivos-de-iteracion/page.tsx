import type { ReactElement } from 'react'
import { MotivosDeIteracion } from '@/componentes/administracion/MotivosDeIteracion'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { MotivoIteracion } from '@/datos/recursos'

export const metadata = { title: 'Motivos de iteración · WiWO Ops' }

/**
 * El catálogo de motivos de iteración.
 *
 * Una iteración es una vuelta atrás: el trabajo se hizo, no sirvió y hubo que rehacerlo. Antes el
 * motivo se escribía a mano, y eso alcanza para leer una iteración suelta pero no para lo que pide
 * el control de gestión: agrupar las rondas del mes por motivo y, sobre todo, separar el retrabajo
 * que se pudo evitar del que pidió el cliente sobre lo mismo y del que es trabajo nuevo. Esa
 * separación es la que permite conversar sobre retrabajo con datos en vez de con impresiones.
 *
 * **Sin compuerta por rol en esta página, a propósito.** La de verdad la pone la API: crear, editar
 * y borrar un motivo exige administrador. Replicar acá esa regla sería una segunda copia que puede
 * quedar desincronizada de la que manda, y esconder no autoriza. Quien no sea administrador ve el
 * catálogo y recibe un 403 con su mensaje si intenta tocarlo.
 */
export default async function MotivosDeIteracionPage (): Promise<ReactElement> {
  const cargado = await cargar()

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Motivos de iteración"
        descripcion="La lista cerrada de motivos entre los que se elige al registrar una vuelta atrás. Cada motivo cae en una de tres categorías: error evitable, ajuste de contenido o cambio de alcance."
      />

      {cargado instanceof ErrorApi
        ? cargado.codigo === 'forbidden'
          ? <SinPermiso />
          : <ErrorEstado detalle={cargado.message} />
        : <MotivosDeIteracion inicial={cargado} />}
    </section>
  )
}

/**
 * Trae el catálogo completo —desactivados incluidos— o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`, igual que en el resto de
 * Administración: React no renderiza el JSX en el momento en que se lee, así que un error de render
 * ahí no lo atraparía el `catch` — y el lint del proyecto lo rechaza.
 *
 * Se piden **con los inactivos**: sin ellos no habría forma de volver a activar un motivo que se
 * sacó de circulación, y la pantalla quedaría sin la mitad de su trabajo.
 */
async function cargar (): Promise<MotivoIteracion[] | ErrorApi> {
  try {
    const sobre = await pedir<MotivoIteracion[]>('/motivos-iteracion?incluir_inactivos=1')

    return sobre.data
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}
