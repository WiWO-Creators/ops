import type { ReactElement } from 'react'
import { PantallasDeArea } from '@/componentes/administracion/PantallasDeArea'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { PantallaDeAreaEnPanel } from '@/datos/recursos'

export const metadata = { title: 'Pantallas · WiWO Ops' }

/**
 * El inventario de pantallas de área.
 *
 * Una pantalla es un televisor colgado en la pared de un área que muestra sola su propia actividad:
 * quién abrió jornada, qué cronómetros corren, en qué está trabajando el área. Se enlaza con una URL
 * que se pega una vez en el aparato y queda puesta — no caduca, y se revoca desde acá.
 *
 * **Sin compuerta por rol en esta página, a propósito.** La de verdad la pone la API: las tres rutas
 * de `/accesos` exigen superadministrador. Replicar acá esa regla sería una segunda copia que puede
 * quedar desincronizada de la que manda, y esconder no autoriza.
 */
export default async function PantallasPage (): Promise<ReactElement> {
  const cargado = await cargar()

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Pantallas"
        descripcion="El código de cada área, para el televisor de su pared. Se teclea con el control remoto, no caduca, y en 'Qué se ve' se elige qué escenas muestra, en qué orden y cuánto dura cada una."
      />

      {cargado instanceof ErrorApi
        ? cargado.codigo === 'forbidden'
          ? <SinPermiso />
          : <ErrorEstado detalle={cargado.message} />
        : <PantallasDeArea inicial={cargado} />}
    </section>
  )
}

/**
 * Trae el inventario, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`, igual que en el resto de
 * Administración: React no renderiza el JSX en el momento en que se lee, así que un error de render
 * ahí no lo atraparía el `catch` — y el lint del proyecto lo rechaza.
 */
async function cargar (): Promise<PantallaDeAreaEnPanel[] | ErrorApi> {
  try {
    const sobre = await pedir<PantallaDeAreaEnPanel[]>('/accesos/pantallas')

    return sobre.data
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}
