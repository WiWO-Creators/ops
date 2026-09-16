import type { ReactElement } from 'react'
import Link from 'next/link'
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
        descripcion="El código de cada área —y el de toda la compañía— para el televisor de su pared. Se teclea con el control remoto, no caduca, y en 'Qué se ve' se elige qué escenas muestra, en qué orden y cuánto dura cada una."
      />

      <p className="text-texto-tenue text-sm">
        Los avisos que salen en estos televisores se publican en{' '}
        <Link href="/administracion/pantallas/anuncios" className="text-acento underline">
          Anuncios de pantalla
        </Link>
        .
      </p>

      <ComoProyectar />

      {cargado instanceof ErrorApi
        ? cargado.codigo === 'forbidden'
          ? <SinPermiso />
          : <ErrorEstado detalle={cargado.message} />
        : <PantallasDeArea inicial={cargado.areas} global={cargado.global} />}
    </section>
  )
}

/**
 * Las dos formas de poner una pantalla, y la advertencia que se aprende a la mala.
 *
 * Va acá, en la pantalla donde alguien acaba de generar un código, y no en un manual que nadie va a
 * buscar: es el momento en que la pregunta "¿y ahora cómo la pongo?" se hace sola.
 */
function ComoProyectar (): ReactElement {
  return (
    <details className="border-linea bg-superficie-elevada rounded-lg border p-4">
      <summary className="text-texto cursor-pointer text-sm font-medium">
        Cómo poner una pantalla
      </summary>

      <div className="text-texto-tenue mt-3 flex flex-col gap-3 text-sm">
        <p>
          <strong className="text-texto">Lo mejor: abrir la dirección en el propio aparato.</strong>{' '}
          En el navegador del televisor, o en un stick HDMI conectado a él. La pantalla se mantiene
          sola: no se apaga, se actualiza cada medio minuto y se reinicia de madrugada para recoger
          las novedades.
        </p>
        <p>
          <strong className="text-texto">Si la envías desde tu computador</strong> (Chromecast,
          AirPlay o compartir pestaña), funciona igual, con un detalle: deja esa pestaña abierta y no
          apagues el computador. Puedes seguir trabajando en otras pestañas — la pantalla sigue
          rotando aunque no la estés mirando.
        </p>
        <p>
          <strong className="text-texto">Si el televisor te recorta los bordes</strong> y no se ve el
          reloj o la barra de abajo, agrega <code className="text-texto">?margen=4</code> al final de
          la dirección. Súbelo hasta que entre todo.
        </p>
      </div>
    </details>
  )
}

/** Lo que la página necesita: el inventario de áreas y la pantalla de toda la compañía. */
interface Inventario {
  areas: PantallaDeAreaEnPanel[]
  /** `null` solo si la API no supo contestar por ella; ver `cargar()`. */
  global: PantallaDeAreaEnPanel | null
}

/**
 * Trae el inventario y la pantalla global, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`, igual que en el resto de
 * Administración: React no renderiza el JSX en el momento en que se lee, así que un error de render
 * ahí no lo atraparía el `catch` — y el lint del proyecto lo rechaza.
 *
 * === DOS PETICIONES Y NO UNA, Y POR QUÉ UNA DE ELLAS PUEDE FALLAR SOLA ===
 *
 * `GET /accesos/pantallas` devuelve **solo las áreas**: la global está deliberadamente fuera, porque
 * su `area_id` es `null` y colarla en ese arreglo la dejaría caer en cualquier código que dé por hecho
 * que ahí hay un área. Vive en `/accesos/pantallas/global`, que nunca da 404 — si nadie generó su
 * código todavía, contesta la fila con `shared: false`.
 *
 * Se piden en paralelo, pero **el fallo de la global no tumba la página**: el inventario de áreas es
 * lo que casi todo el mundo viene a buscar, y dejarlo sin dibujar porque falló una segunda petición
 * sería castigar el caso frecuente por el raro. Si falla, la fila de la global no aparece y las de
 * área siguen funcionando. Al revés no: sin inventario no hay pantalla que mostrar.
 */
async function cargar (): Promise<Inventario | ErrorApi> {
  try {
    const [areas, global] = await Promise.all([
      pedir<PantallaDeAreaEnPanel[]>('/accesos/pantallas'),
      pedir<PantallaDeAreaEnPanel>('/accesos/pantallas/global').catch(() => null)
    ])

    return { areas: areas.data, global: global?.data ?? null }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}
