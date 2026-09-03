import { ConfiguracionCorreo } from '@/componentes/administracion/ConfiguracionCorreo'
import { VisorColaCorreo } from '@/componentes/administracion/VisorColaCorreo'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { ConfiguracionCorreo as ConfiguracionCorreoTipo, FilaColaCorreo } from '@/datos/recursos'
import type { ResumenColaCorreo, Yo } from '@/datos/tipos'
import type { ResultadoLista } from '@/definiciones/tipos'

export const metadata = { title: 'Avisos por correo · WiWO Ops' }

interface Detalle {
  configuracion: ConfiguracionCorreoTipo
  cola: ResultadoLista<FilaColaCorreo>
  resumen: ResumenColaCorreo
}

/**
 * Carga lo que la pantalla necesita: el interruptor y la primera pagina de la cola.
 *
 * Separada de la pagina para no construir JSX dentro del `try`: React no renderiza en el momento en
 * que se lee el JSX, asi que un error de render ahi no lo atraparia el `catch` — el lint del proyecto
 * lo rechaza (`react-hooks/error-boundaries`). Acá el `try` solo hace `await`, nunca JSX.
 */
async function cargarDetalle (): Promise<Detalle | ErrorApi> {
  try {
    const [configuracion, cola] = await Promise.all([
      pedir<ConfiguracionCorreoTipo>('/notifications/settings'),
      pedir<FilaColaCorreo[]>('/notifications/mail-queue')
    ])

    // `meta.pagination.summary` siempre viene en este endpoint: no hay forma de pedir la cola sin
    // el resumen. Va dentro de `pagination`, no como hermano — así responde la API real.
    const resumen = cola.meta?.pagination?.summary
    if (resumen === undefined) throw new Error('La API no devolvió el resumen de la cola de correo.')

    return {
      configuracion: configuracion.data,
      cola: { filas: cola.data, paginacion: cola.meta?.pagination },
      resumen
    }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Administración del correo de la ola 1 de brechas del board: el interruptor de
 * `Nucleo\EfectosExternos` y el visor de `tblmail_queue`.
 *
 * `is_admin` se revisa antes de pedir nada más: las dos rutas de abajo ya exigen admin del lado de la
 * API, pero pedirlas igual gastaría un viaje que sabemos que va a volver 403. La comprobación es la
 * misma que decide si la sección aparece en la barra lateral — ver `seccionesDe` en el layout.
 */
export default async function AdministracionCorreoPage () {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_admin) return <SinPermiso className="mt-10" />

  const detalle = await cargarDetalle()

  if (detalle instanceof ErrorApi) {
    if (detalle.codigo === 'forbidden') return <SinPermiso className="mt-10" />
    return <ErrorEstado detalle={detalle.message} className="mt-10" />
  }

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="text-texto text-xl font-semibold">Avisos por correo</h1>
        <p className="text-texto-tenue mt-1 text-sm">
          El interruptor de efectos externos y la cola de correo que gobierna. Nada de esto toca la lógica de
          envío: vive en el backend y ya funciona; esta pantalla solo la prende, la apaga y la mira.
        </p>
      </div>

      <ConfiguracionCorreo inicial={detalle.configuracion} />

      <div>
        <h2 className="text-texto mb-3 text-base font-semibold">Cola de correo</h2>
        <VisorColaCorreo inicial={detalle.cola} resumen={detalle.resumen} />
      </div>
    </section>
  )
}
