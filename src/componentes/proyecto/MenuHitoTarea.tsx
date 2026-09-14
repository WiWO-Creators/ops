'use client'

import { useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { InsigniaHito } from '@/componentes/presentadores/Hito'
import {
  ContenidoMenu,
  DisparadorMenu,
  GrupoRadioMenu,
  ItemMenuRadio,
  MenuContextual,
  SinResultadosMenu
} from '@/componentes/superposiciones/MenuContextual'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { movimientoAlHito, SIN_HITO } from './agregar-al-hito'
import { cuerpoMoverHito, opcionesDeFiltroDeHito } from './hitos'
import { etiquetaDeHito, rutaHitosDeEspacio } from './hito-de-tarea'
import type { Hito, Referencia } from '@/datos/recursos'
import type { Sobre } from '@/datos/tipos'
import type { OpcionFiltro } from '@/definiciones/tipos'

/**
 * El hito de una Tarea, convertido en menu para moverla ahi mismo.
 *
 * Es el hermano de `MenuEstadoTarea`, que resolvio el mismo gesto para el estado en el kanban de
 * Hitos: hasta ahora, mover una tarea de hito desde la ficha obligaba a abrir el formulario de
 * edicion completo y guardarlo entero, o a volver al tablero y arrastrar la tarjeta.
 *
 * Va por `POST /tasks/{id}/mover-hito` —el mismo endpoint del arrastre y del dialogo "+"— y no por
 * `PATCH /tasks/{id}`: el parche acepta `milestone`, pero no reordena la columna destino, y la tarea
 * quedaria con el hito nuevo y una posicion que no le corresponde.
 *
 * **Los hitos se piden recien al abrir el menu.** No hay catalogo global —un hito pertenece a un
 * Espacio, ver `opcionesDeHito`— asi que traerlos con la ficha seria una peticion mas en cada
 * apertura de tarea para un control que casi nunca se toca.
 *
 * Sin buscador a proposito: esta instalacion tiene 268 hitos repartidos en 275 Espacios, y un menu
 * de uno o dos items con un campo de busqueda encima es peor que la lista sola. Si algun Espacio
 * junta suficientes como para que moleste, la pieza que falta es `BuscadorMenu`, que ya existe.
 *
 * El cambio se pinta en optimista y se revierte si la API lo rechaza, con el motivo a la vista.
 */

/** Los hitos del Espacio, que se traen recien al abrir el menu. */
type CargaDeHitos =
  | { fase: 'sinPedir' }
  | { fase: 'cargando' }
  | { fase: 'listo', opciones: OpcionFiltro[] }
  | { fase: 'error', mensaje: string }

interface PropsMenuHitoTarea {
  tareaId: number
  /** Nombre de la tarea. Solo para el texto accesible: en la ficha ya se lee arriba. */
  nombreTarea: string
  /** El Espacio de la Tarea. Sin el no hay de donde sacar los hitos y el control no se dibuja. */
  espacioId: number
  /** El hito que devolvio la API en la ultima carga, o `null` si la tarea no cuelga de ninguno. */
  hito: Referencia | null
  /** Se llama despues de un cambio confirmado, para que la ficha se recargue. */
  onCambiado: () => void
}

export function MenuHitoTarea ({
  tareaId,
  nombreTarea,
  espacioId,
  hito,
  onCambiado
}: PropsMenuHitoTarea): ReactElement {
  // Lo que se pinta: arranca en el hito de la API y se adelanta al elegir. Se vuelve a alinear sola
  // cuando la recarga de la ficha trae otro hito. React admite este `setState` durante el render
  // —reinicia el render antes de pintar— y es lo que la regla de hooks pide en vez de encadenar
  // renders desde un efecto.
  const [pintado, setPintado] = useState<Referencia | null>(hito)
  const [ultimoDeLaApi, setUltimoDeLaApi] = useState<Referencia | null>(hito)
  const [hitos, setHitos] = useState<CargaDeHitos>({ fase: 'sinPedir' })
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if ((ultimoDeLaApi?.id ?? SIN_HITO) !== (hito?.id ?? SIN_HITO)) {
    setUltimoDeLaApi(hito)
    setPintado(hito)
    setError(null)
  }

  /**
   * Trae los hitos del Espacio la primera vez que se abre el menu.
   *
   * Se reintenta si la vez anterior fallo: el menu se vuelve a abrir, y quedarse con el error viejo
   * obligaria a cerrar la ficha entera para volver a intentar.
   */
  async function cargarHitos (): Promise<void> {
    if (hitos.fase === 'cargando' || hitos.fase === 'listo') return

    setHitos({ fase: 'cargando' })

    const control = new AbortController()
    const respuesta = await pedirRespuesta(rutaHitosDeEspacio(espacioId), control.signal)

    if (!respuesta.ok) {
      setHitos({ fase: 'error', mensaje: await mensajeDeRespuesta(respuesta) })

      return
    }

    const sobre = await respuesta.json() as Sobre<Hito[]>

    setHitos({ fase: 'listo', opciones: opcionesDeFiltroDeHito(sobre.data) })
  }

  /**
   * Mueve la tarea al hito elegido y revierte si la API lo rechaza.
   *
   * @param valor el id del hito, en texto: es lo que entrega el grupo de radio de Radix
   */
  async function elegir (valor: string): Promise<void> {
    const destino = Number(valor)

    if (!Number.isSafeInteger(destino) || destino < 0) {
      setError('No se pudo mover: la opción elegida no es válida.')

      return
    }

    if (destino === (pintado?.id ?? SIN_HITO) || enCurso) return

    const previo = pintado
    const opciones = hitos.fase === 'listo' ? hitos.opciones : []

    setPintado(
      destino === SIN_HITO
        ? null
        : { id: destino, name: etiquetaDeHito(opciones, destino, `#${destino}`) }
    )
    setError(null)
    setEnCurso(true)

    const resultado = await escribirEnBff(
      `tasks/${encodeURIComponent(String(tareaId))}/mover-hito`,
      'POST',
      cuerpoMoverHito(movimientoAlHito(destino))
    )

    setEnCurso(false)

    if (!resultado.ok) {
      setPintado(previo)
      setError(resultado.mensaje)

      return
    }

    onCambiado()
  }

  const nombreDelHito = pintado?.name ?? 'Sin hito'

  return (
    <div className="flex flex-col items-start gap-1">
      <MenuContextual onOpenChange={(abierto) => { if (abierto) void cargarHitos() }}>
        <DisparadorMenu asChild>
          <button
            type="button"
            disabled={enCurso}
            aria-label={
              `${GLOSARIO.hito.singular} de "${nombreTarea}": ${nombreDelHito}. `
              + `Cambiar ${GLOSARIO.hito.singular.toLowerCase()}.`
            }
            className={cn(
              'rounded-control cursor-pointer text-left',
              'transition-opacity duration-150',
              enCurso ? 'cursor-progress opacity-60' : 'hover:opacity-80'
            )}
          >
            <InsigniaHito hito={pintado} />
          </button>
        </DisparadorMenu>

        <ContenidoMenu align="start">
          {hitos.fase === 'cargando' && (
            <SinResultadosMenu>Cargando {GLOSARIO.hito.plural.toLowerCase()}…</SinResultadosMenu>
          )}

          {hitos.fase === 'error' && <SinResultadosMenu>{hitos.mensaje}</SinResultadosMenu>}

          {hitos.fase === 'listo' && hitos.opciones.length === 0 && (
            <SinResultadosMenu>
              Este {GLOSARIO.espacio.singular.toLowerCase()} todavía no tiene {GLOSARIO.hito.plural.toLowerCase()}.
            </SinResultadosMenu>
          )}

          {hitos.fase === 'listo' && hitos.opciones.length > 0 && (
            <GrupoRadioMenu
              value={String(pintado?.id ?? SIN_HITO)}
              onValueChange={(valor) => { void elegir(valor) }}
            >
              {hitos.opciones.map((opcion) => (
                <ItemMenuRadio key={opcion.valor} value={opcion.valor} disabled={enCurso}>
                  {opcion.etiqueta}
                </ItemMenuRadio>
              ))}
            </GrupoRadioMenu>
          )}
        </ContenidoMenu>
      </MenuContextual>

      {error !== null && (
        <p role="alert" className="text-texto-peligro text-xs">{error}</p>
      )}
    </div>
  )
}
