import { ColaCorreoAlCliente } from '@/componentes/administracion/ColaCorreoAlCliente'
import { ConfiguracionCorreo } from '@/componentes/administracion/ConfiguracionCorreo'
import { ModoCorreoAlCliente } from '@/componentes/administracion/ModoCorreoAlCliente'
import { VisorColaCorreo } from '@/componentes/administracion/VisorColaCorreo'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { COLA_CORREO } from '@/definiciones/cola-correo'
import { leerAjustes } from '@/datos/ajustes'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import { esResumenColaCliente } from '@/dominio/correo-cliente'
import { nombrar } from '@/dominio/glosario'
import type {
  Ajustes, ConfiguracionCorreo as ConfiguracionCorreoTipo, FilaColaCorreo, FilaColaCorreoCliente
} from '@/datos/recursos'
import type { ResumenColaCorreo, ResumenColaCorreoCliente, Yo } from '@/datos/tipos'
import type { ResultadoLista } from '@/definiciones/tipos'

export const metadata = { title: 'Avisos por correo · WiWO Ops' }

interface Detalle {
  configuracion: ConfiguracionCorreoTipo
  cola: ResultadoLista<FilaColaCorreo>
  resumen: ResumenColaCorreo
  ajustes: Ajustes
}

interface DetalleColaCliente {
  filas: FilaColaCorreoCliente[]
  resumen: ResumenColaCorreoCliente
}

/**
 * Carga lo que la pantalla necesita: el interruptor, la primera pagina de la cola y los ajustes de la
 * instalacion, de donde sale el modo del motor de correo al cliente.
 *
 * Separada de la pagina para no construir JSX dentro del `try`: React no renderiza en el momento en
 * que se lee el JSX, asi que un error de render ahi no lo atraparia el `catch` — el lint del proyecto
 * lo rechaza (`react-hooks/error-boundaries`). Acá el `try` solo hace `await`, nunca JSX.
 */
async function cargarDetalle (): Promise<Detalle | ErrorApi> {
  try {
    const [configuracion, cola, ajustes] = await Promise.all([
      pedir<ConfiguracionCorreoTipo>('/notifications/settings'),
      pedir<FilaColaCorreo[]>('/notifications/mail-queue'),
      leerAjustes()
    ])

    // `meta.pagination.summary` siempre viene en este endpoint: no hay forma de pedir la cola sin
    // el resumen. Va dentro de `pagination`, no como hermano — así responde la API real.
    const resumen = cola.meta?.pagination?.summary
    if (resumen === undefined) throw new Error('La API no devolvió el resumen de la cola de correo.')
    // El campo lo comparten las dos colas: si llega el de la otra, los estados no coinciden y contar
    // con ellos daría ceros silenciosos.
    if (esResumenColaCliente(resumen)) throw new Error('La API devolvió el resumen de la cola equivocada.')

    return {
      configuracion: configuracion.data,
      cola: { filas: cola.data, paginacion: cola.meta?.pagination },
      resumen,
      ajustes
    }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Carga la cola de correo al cliente, aparte del resto.
 *
 * Va en su propio pedido y con su propio `catch` a proposito: la tabla `tblwiwo_correo_cliente_cola`
 * la crea la migracion `0130`, y en una instalacion que todavia no la aplico este endpoint falla.
 * Dentro del `Promise.all` de arriba eso tumbaria tambien el interruptor de efectos externos, que es
 * lo que esta pantalla viene sirviendo desde antes.
 */
async function cargarColaCliente (): Promise<DetalleColaCliente | ErrorApi> {
  try {
    const cola = await pedir<FilaColaCorreoCliente[]>('/notifications/client-mail-queue')
    const resumen = cola.meta?.pagination?.summary

    if (resumen === undefined || !esResumenColaCliente(resumen)) {
      throw new Error('La API no devolvió el resumen de la cola de correo al cliente.')
    }

    return { filas: cola.data, resumen }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Administración del correo: el interruptor de `Nucleo\EfectosExternos` con el visor de
 * `tblmail_queue`, y el motor de correo al cliente —su modo y su cola— que **no envía nada**.
 *
 * `is_superadmin` se revisa antes de pedir nada más: las rutas de abajo ya exigen superadmin del
 * lado de la API —ahí está la compuerta real—, pero pedirlas igual gastaría un viaje que sabemos que
 * va a volver 403. La comprobación es la misma que decide si la sección aparece en la barra lateral
 * (`seccionesDe` en el layout), y está acá para que entrar por URL directa tampoco pinte nada.
 */
export default async function AdministracionCorreoPage () {
  const { data: yo } = await pedir<Yo>('/me')

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  const [detalle, colaCliente] = await Promise.all([cargarDetalle(), cargarColaCliente()])

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
        <VisorColaCorreo
          contadores={[
            { clave: 'pending', etiqueta: 'pendientes', valor: detalle.resumen.pending, tono: 'neutro' },
            { clave: 'sending', etiqueta: 'enviando', valor: detalle.resumen.sending, tono: 'acento' },
            { clave: 'sent', etiqueta: 'enviados', valor: detalle.resumen.sent, tono: 'exito' },
            { clave: 'failed', etiqueta: 'fallidos', valor: detalle.resumen.failed, tono: 'peligro' }
          ]}
          total={detalle.resumen.total}
        >
          <TablaRecurso definicion={COLA_CORREO} inicial={detalle.cola} claveFila={(fila) => fila.id} />
        </VisorColaCorreo>
      </div>

      <div>
        <h2 className="text-texto text-base font-semibold">Correo al {nombrar('cliente')}</h2>
        <p className="text-texto-tenue mt-1 mb-3 text-sm">
          Un motor aparte del de arriba, construido sin envío: se anota a quién habría que escribirle y ahí queda.
          El interruptor existe antes que el envío para que el día que exista ya esté puesto en apagado.
        </p>

        <div className="flex flex-col gap-6">
          <ModoCorreoAlCliente inicial={detalle.ajustes} />

          {colaCliente instanceof ErrorApi
            ? <ErrorEstado titulo="No se pudo leer la cola de correo al cliente" detalle={colaCliente.message} />
            : <ColaCorreoAlCliente filas={colaCliente.filas} resumen={colaCliente.resumen} />}
        </div>
      </div>
    </section>
  )
}
