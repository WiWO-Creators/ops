'use client'

import { useState, type ReactElement } from 'react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  ContenidoMenu,
  DisparadorMenu,
  GrupoRadioMenu,
  ItemMenuRadio,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { comprobarEntidad, mutarEnBff } from '@/componentes/datos/mutar'
import { useAviso } from '@/componentes/estado/useAviso'
import { pedirSobre } from '@/datos/cliente'
import { resolverEstado } from '@/dominio/estados-tarea'
import { cn } from '@/lib/clases'
import { DialogoCompletarConEntrega } from './DialogoCompletarConEntrega'
import { entregaEsRelevante, rutaDeSeguidoresDeContacto, type SeguidoresDeContacto } from './entrega-final'
import { accionDeEstado } from './estado-proceso'
import { ESTADO_COMPLETO, estaCerrada } from './tareas'
import type { EstadoLookup, Proceso } from '@/datos/recursos'

/**
 * La insignia de estado de una tarea, convertida en menu para cambiarlo ahi mismo.
 *
 * Existe para el kanban de Hitos, donde las columnas son hitos y no estados: mover la tarjeta no
 * cambia el estado, y hasta ahora la unica forma de avanzarlo era abrir el modal de detalle, tocar
 * el selector y guardar. Cuatro pasos para el gesto mas repetido del tablero.
 *
 * **Es la misma insignia que se lee en el resto del producto**, con el color que administra Perfex:
 * no se inventa un control nuevo, se le pone un menu al que ya estaba. Asi la tarjeta no crece y el
 * estado se sigue leyendo de un vistazo cuando no se piensa cambiarlo.
 *
 * `GrupoRadioMenu` y no una lista de items sueltos: elegir un estado apaga el anterior, y la
 * primitiva de Radix es la que emite `role="menuitemradio"` con `aria-checked`. Un tilde dibujado a
 * mano no le dice nada a un lector de pantalla.
 *
 * El cambio se pinta en optimista y se revierte si la API lo rechaza, con el motivo a la vista: una
 * tarjeta que se queda mostrando el estado que no se guardo es peor que no tener el control.
 *
 * **Completar puede llevar el archivo final al cliente.** Al elegir «Completo» se mira si el correo de
 * entrega tiene sentido (se manda de verdad, el cliente ve la tarea y alguien la sigue): solo entonces
 * se ofrece elegir el archivo, en un dialogo o —dentro de la ficha, que ya es un dialogo— en su bloque
 * en linea (`alElegirCompleto`). Si no, completar sigue siendo un clic, igual que siempre.
 */

interface PropsMenuEstadoTarea {
  tareaId: number
  /** Nombre de la tarea. Solo para el texto accesible: en la tarjeta ya se lee al lado. */
  nombreTarea: string
  /** El `status` que devolvio la API en la ultima carga. */
  estado: number
  /** `task_statuses` de `GET /lookups`. Vacio no pinta nada: sin catalogo no hay que ofrecer. */
  catalogo: EstadoLookup[]
  /** Se llama despues de un cambio confirmado, para que quien monta el control refresque su vista. */
  onCambiado: () => void
  /**
   * Que hacer cuando completar ofrece enviar el archivo final al cliente. Sin esto se abre un
   * dialogo; la ficha lo reemplaza por su bloque en linea para no apilar un dialogo sobre otro.
   */
  alElegirCompleto?: () => void
}

export function MenuEstadoTarea ({
  tareaId,
  nombreTarea,
  estado,
  catalogo,
  onCambiado,
  alElegirCompleto
}: PropsMenuEstadoTarea): ReactElement | null {
  // Lo que se pinta: arranca en el estado de la API y se adelanta al elegir. Se vuelve a alinear
  // sola cuando la recarga del tablero trae un `status` distinto al del render anterior. React
  // admite este `setState` durante el render —reinicia el render antes de pintar— y es lo que la
  // regla de hooks pide en vez de encadenar renders desde un efecto.
  const avisar = useAviso()
  const [pintado, setPintado] = useState(estado)
  const [ultimoDeLaApi, setUltimoDeLaApi] = useState(estado)
  const [enCurso, setEnCurso] = useState(false)
  const [completando, setCompletando] = useState(false)

  if (ultimoDeLaApi !== estado) {
    setUltimoDeLaApi(estado)
    setPintado(estado)
  }

  /**
   * Ofrece el archivo final si el correo de entrega tiene sentido para esta tarea.
   *
   * Lee quien la sigue y si el correo saldria de verdad. Si la lectura falla, no se ofrece nada y
   * completar sigue como siempre: un fallo al preguntar no puede impedir completar.
   *
   * @returns `true` si se ofrecio (quien completa sera el dialogo o la ficha), `false` si hay que seguir
   */
  async function entregaOfrecida (): Promise<boolean> {
    setEnCurso(true)

    const relevante = await pedirSobre<SeguidoresDeContacto>(
      rutaDeSeguidoresDeContacto(tareaId, 'panel'),
      new AbortController().signal
    ).then((sobre) => entregaEsRelevante(sobre.data)).catch(() => false)

    setEnCurso(false)

    if (!relevante) return false

    if (alElegirCompleto !== undefined) alElegirCompleto()
    else setCompletando(true)

    return true
  }

  /**
   * Manda el estado elegido y revierte si la API lo rechaza.
   *
   * @param valor el id del estado, en texto: es lo que entrega el grupo de radio de Radix
   */
  async function elegir (valor: string): Promise<void> {
    const destino = Number(valor)

    if (destino === pintado || enCurso) return

    if (destino === ESTADO_COMPLETO && !estaCerrada(pintado) && await entregaOfrecida()) return

    const accion = accionDeEstado(tareaId, destino)

    if (accion === null) {
      avisar.error('No se pudo cambiar el estado: la opción elegida no es válida.')

      return
    }

    const previo = pintado

    setPintado(destino)
    setEnCurso(true)

    // Pasar a un estado es absoluto —repetirlo da lo mismo—, asi que es seguro reintentarlo, y antes
    // de rendirse se lee la tarea para saber si el cambio ya habia llegado.
    const resultado = await mutarEnBff<Proceso>(accion.ruta, 'POST', accion.cuerpo, {
      servidorIdempotente: true,
      yaAplicada: comprobarEntidad<Proceso>(`tasks/${tareaId}`, (tarea) => tarea.status === destino)
    })

    setEnCurso(false)

    if (!resultado.ok) {
      if (resultado.incierta === true) {
        // No se sabe si quedo: se muestra lo que hay de verdad en vez de afirmar que no se guardo.
        avisar.advertencia(resultado.mensaje)
        onCambiado()

        return
      }

      setPintado(previo)
      avisar.error(resultado.mensaje)

      return
    }

    onCambiado()
  }

  // Sin catalogo no hay con que traducir ningun estado, y un menu de "#1" y "#4" no se puede usar.
  // Va despues de los hooks: una salida temprana arriba los saltearia entre renders.
  if (catalogo.length === 0) return null

  const resuelto = resolverEstado(pintado, catalogo)

  return (
    // `draggable={false}`: la tarjeta que contiene este control es arrastrable, y sin esto un
    // arrastre que empieza sobre la insignia mueve la tarjeta de columna en vez de abrir el menu.
    <div className="flex flex-col items-start gap-1" draggable={false}>
      <MenuContextual>
        <DisparadorMenu asChild>
          <button
            type="button"
            disabled={enCurso}
            aria-label={`Estado de "${nombreTarea}": ${resuelto.etiqueta}. Cambiar estado.`}
            className={cn(
              'rounded-control cursor-pointer',
              'transition-opacity duration-rapida ease-neo',
              enCurso ? 'cursor-progress opacity-60' : 'hover:opacity-80'
            )}
          >
            <Insignia
              tono={resuelto.desconocido ? 'contorno' : 'neutro'}
              tamano="chico"
              color={resuelto.color}
            >
              {resuelto.etiqueta}
            </Insignia>
          </button>
        </DisparadorMenu>

        <ContenidoMenu align="start">
          <GrupoRadioMenu
            value={String(pintado)}
            onValueChange={(valor) => { void elegir(valor) }}
          >
            {catalogo.map((opcion) => (
              <ItemMenuRadio key={opcion.id} value={String(opcion.id)} disabled={enCurso}>
                {opcion.name}
              </ItemMenuRadio>
            ))}
          </GrupoRadioMenu>
        </ContenidoMenu>
      </MenuContextual>

      {completando && (
        <DialogoCompletarConEntrega
          abierto
          tareaId={tareaId}
          nombreTarea={nombreTarea}
          onCerrar={() => setCompletando(false)}
          onCompletada={() => { setPintado(ESTADO_COMPLETO); onCambiado() }}
        />
      )}
    </div>
  )
}
