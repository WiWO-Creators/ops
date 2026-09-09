import { ControlJornada } from '@/componentes/live/ControlJornada'
import { PanelEquipo } from '@/componentes/live/PanelEquipo'
import { ErrorApi } from '@/datos/errores'
import { intervaloDeLive, type EstadoDeJornada, type FilaDeLive } from '@/datos/live'
import { pedir } from '@/datos/servidor'
import type { Sobre, Yo } from '@/datos/tipos'
import { alcanceDeLive } from '@/dominio/live'

export const metadata = { title: 'En vivo · WiWO Ops' }

/**
 * Pide un recurso de LIVE y devuelve el error de la API **como valor** en vez de lanzarlo.
 *
 * Los dos bloques son independientes: que el tablero del equipo falle no puede dejar a la persona sin
 * poder abrir su jornada, que es lo unico de esta pantalla que solo se hace aca. Mismo patron que
 * `auditoria/page.tsx`, y separado de la pagina por lo mismo: para no armar JSX dentro del `try`.
 */
async function traer<T> (ruta: string): Promise<Sobre<T> | ErrorApi> {
  try {
    return await pedir<T>(ruta)
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** El mensaje del error, o `null` si vino bien. */
function mensaje (resultado: unknown): string | null {
  return resultado instanceof ErrorApi ? resultado.message : null
}

/**
 * LIVE: mi jornada y la del equipo.
 *
 * === POR QUE NO HAY COMPUERTA POR ROL ===
 *
 * Porque todo el mundo tiene al menos su propia vista: abrir la jornada, arrancar el medidor y ver
 * cuanto lleva. Lo que cambia con el rol es **cuanta gente mas** se ve, y eso lo decide
 * `alcanceDeLive()` — que solo evita pedir un tablero que sabemos que devuelve una sola fila. La
 * compuerta real esta en la API: `meta.scope` dice hasta donde llego de verdad.
 *
 * === POR QUE EL CONTROL APARECE DOS VECES ===
 *
 * No aparece dos veces: es el MISMO componente que la cabecera monta en `variante="compacta"`, aca en
 * `variante="panel"`. Los dos hablan con el mismo endpoint y se enteran del mismo pub/sub, asi que no
 * pueden divergir. Un componente aparte para la pantalla grande seria la segunda copia de la logica
 * de arranque, y con ella la segunda forma de que los numeros no coincidan.
 */
export default async function LivePage () {
  const { data: yo } = await pedir<Yo>('/me')
  const alcance = alcanceDeLive(yo)
  const segundos = intervaloDeLive()

  const [jornada, equipo] = await Promise.all([
    traer<EstadoDeJornada>('/me/jornada'),
    alcance === 'propio' ? Promise.resolve(null) : traer<FilaDeLive[]>('/live')
  ])

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-texto text-xl font-semibold">En vivo</h1>
        <p className="text-texto-tenue max-w-prose text-sm">
          Tu jornada y el tiempo que estás midiendo ahora. La jornada es la ventana en la que se puede
          medir: sin ella abierta, ningún cronómetro arranca.
        </p>
      </div>

      <ControlJornada
        variante="panel"
        segundos={segundos}
        inicial={jornada instanceof ErrorApi ? null : jornada.data}
        errorInicial={mensaje(jornada)}
      />

      {equipo !== null && (
        <PanelEquipo
          alcance={alcance}
          segundos={segundos}
          inicial={equipo instanceof ErrorApi ? [] : equipo.data}
          errorInicial={mensaje(equipo)}
        />
      )}
    </section>
  )
}
