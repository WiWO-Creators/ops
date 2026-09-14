import { ColaCorreoAlCliente } from '@/componentes/administracion/ColaCorreoAlCliente'
import { ConfiguracionCorreo } from '@/componentes/administracion/ConfiguracionCorreo'
import { FormularioDeAjustes } from '@/componentes/administracion/FormularioDeAjustes'
import { ModoCorreoAlCliente } from '@/componentes/administracion/ModoCorreoAlCliente'
import { VisorColaCorreo } from '@/componentes/administracion/VisorColaCorreo'
import { VistaColaCorreo } from '@/componentes/administracion/VistaColaCorreo'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { leerAjustes } from '@/datos/ajustes'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import {
  clavesDeAvisosDeLicitacion, GRUPO_AVISOS_LICITACION
} from '@/dominio/alertas-licitacion'
import { esResumenColaCliente } from '@/dominio/correo-cliente'
import { nombrar } from '@/dominio/glosario'
import type {
  Ajustes, ConfiguracionCorreo as ConfiguracionCorreoTipo, FilaColaCorreo, FilaColaCorreoCliente
} from '@/datos/recursos'
import type { ResumenColaCorreo, ResumenColaCorreoCliente } from '@/datos/tipos'
import type { ResultadoLista } from '@/definiciones/tipos'

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
 * Pestaña «Avisos por correo» de Administración: el interruptor de `Nucleo\EfectosExternos` con el
 * visor de `tblmail_queue`, y el motor de correo al cliente —su modo y su cola— que **no envía
 * nada**.
 *
 * Era una pantalla propia (`/administracion/correo`) hasta que las opciones del superadministrador
 * se unificaron en una sola sección: ahora es un panel más, y quien comprueba `is_superadmin` es la
 * página que lo monta. La compuerta real sigue estando en la API, que exige superadmin en cada una
 * de estas rutas.
 */
export async function PanelAvisosPorCorreo () {
  const [detalle, colaCliente] = await Promise.all([cargarDetalle(), cargarColaCliente()])

  if (detalle instanceof ErrorApi) {
    if (detalle.codigo === 'forbidden') return <SinPermiso className="mt-10" />
    return <ErrorEstado detalle={detalle.message} className="mt-10" />
  }

  return (
    <section className="flex flex-col gap-8">
      <p className="text-texto-tenue text-sm">
        El interruptor de efectos externos y la cola de correo que gobierna. Nada de esto toca la lógica de
        envío: vive en el backend y ya funciona; esta pestaña solo la prende, la apaga y la mira.
      </p>

      <ConfiguracionCorreo inicial={detalle.configuracion} />

      {/*
        El interruptor de los avisos de plazo de Licitaciones. Va debajo del de efectos externos
        porque depende de el: con el correo en «apagado» esto no manda nada aunque este encendido.
        Nace apagado —`FormularioDeAjustes` marca la casilla solo con `value === true`, y la clave
        ausente vale `null`—, que es como se mergea en esta casa todo lo que sale por correo.
      */}
      <FormularioDeAjustes
        inicial={detalle.ajustes}
        grupo={GRUPO_AVISOS_LICITACION}
        claves={clavesDeAvisosDeLicitacion(detalle.ajustes)}
        dominios={{}}
      />

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
          <VistaColaCorreo inicial={detalle.cola} />
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
