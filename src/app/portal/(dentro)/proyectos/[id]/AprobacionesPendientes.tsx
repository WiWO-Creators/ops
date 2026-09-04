'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { EnlacePanelClasico } from '@/componentes/presentadores/EnlacePanelClasico'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'
import type { AprobacionPortal, TareaPortal } from '@/datos/portal'

/**
 * Las {procesos} que esperan el visto bueno del cliente, arriba de todo en el detalle del proyecto.
 *
 * Es lo unico de esa pantalla que pide una accion, y por eso va **antes de las pestañas**: abajo,
 * compitiendo con ocho pestañas, no se ve. Si no hay pendientes el bloque no existe — un cartel que
 * dice "no hay nada para aprobar" es ruido en la pantalla de alguien que entra a mirar su proyecto.
 *
 * **Ni ETA ni desviacion ni SLA aparecen aca.** Son metricas internas: miden al equipo contra su
 * propio compromiso, y el backend ni siquiera las manda al portal.
 *
 * Es la unica escritura de todo el portal, asi que no hay estado optimista: la fila sale de la lista
 * cuando la API confirmo. Una aprobacion que se deshace sola es peor que medio segundo de espera.
 */

interface PropsAprobaciones {
  proyectoId: number
  /** Solo las que estan en `pendiente`; el filtrado lo hace la API. */
  tareas: TareaPortal[]
}

export function AprobacionesPendientes ({ proyectoId, tareas }: PropsAprobaciones) {
  // Las resueltas se sacan de la lista sin recargar la pantalla entera; el `refresh` deja al servidor
  // ponerse al dia para la proxima visita.
  const [resueltas, setResueltas] = useState<number[]>([])
  const pendientes = tareas.filter((tarea) => !resueltas.includes(tarea.id))

  if (pendientes.length === 0) return null

  // La tarjeta se escribe aca y no se reusa `Bloque` de `detalle.tsx`: ese modulo arrastra
  // `pedirPortal`, que es `server-only`, y desde un componente cliente el build se cae. Son tres
  // clases; importarlas costaria partir aquel archivo en dos.
  return (
    <section className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5">
      <h2 className="font-titular text-texto border-linea-suave mb-4 border-b pb-2 text-sm font-semibold">
        Esperan tu visto bueno
      </h2>

      <p className="text-texto-tenue mb-3 text-sm">
        Estas {GLOSARIO.proceso.plural.toLowerCase()} arrancan cuando les des el visto bueno.
      </p>

      <ul className="divide-linea-suave divide-y">
        {pendientes.map((tarea) => (
          <FilaAprobacion
            key={tarea.id}
            tarea={tarea}
            onResuelta={() => { setResueltas((previas) => [...previas, tarea.id]) }}
          />
        ))}
      </ul>

      <EnlacePanelClasico entidad="espacio-cliente" id={proyectoId} className="mt-3" />
    </section>
  )
}

/** Una {proceso} a la espera, con sus dos salidas. */
function FilaAprobacion ({ tarea, onResuelta }: { tarea: TareaPortal, onResuelta: () => void }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [rechazando, setRechazando] = useState(false)
  const [motivo, setMotivo] = useState('')

  /**
   * Manda la decision del contacto.
   *
   * Nunca lanza: el error del contrato se lee debajo de la fila y los botones vuelven a habilitarse,
   * porque el cliente tiene que poder reintentar sin recargar.
   *
   * @param decision Que respondio.
   * @param comentario Obligatorio al rechazar: sin motivo, el equipo se queda sin nada que hacer.
   */
  async function responder (decision: 'aprobada' | 'rechazada', comentario?: string): Promise<void> {
    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff<AprobacionPortal>(
      `portal/tasks/${tarea.id}/approval`,
      'POST',
      comentario === undefined ? { decision } : { decision, comentario }
    )

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    setRechazando(false)
    onResuelta()
    router.refresh()
  }

  const pedida = tarea.approval?.solicitada_en ?? null

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-texto min-w-0 truncate text-sm font-medium" title={tarea.name}>{tarea.name}</p>
          <p className="text-texto-sutil text-xs">
            {tarea.due_date !== null && `Entrega estimada: ${formatearFecha(tarea.due_date)}`}
            {tarea.due_date !== null && pedida !== null && ' · '}
            {pedida !== null && `Pedida el ${formatearFecha(pedida)}`}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          {/* Aprobar es escritura directa: pedir un modal para decir que si es friccion sobre lo que
              queremos que pase. Rechazar exige motivo, asi que si abre dialogo. */}
          <Boton
            variante="primario"
            tamano="chico"
            cargando={enviando && !rechazando}
            onClick={() => { void responder('aprobada') }}
          >
            Aprobar
          </Boton>
          {/* Sin `variante="peligro"`: rechazar no es destruir, es pedir un cambio. El rojo asusta y
              hace que el cliente apruebe cosas que no queria aprobar. */}
          <Boton variante="secundario" tamano="chico" onClick={() => { setRechazando(true) }}>
            Rechazar
          </Boton>
        </div>
      </div>

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

      <Dialogo open={rechazando} onOpenChange={setRechazando}>
        <ContenidoDialogo
          titulo="¿Qué habría que cambiar?"
          descripcion={`El equipo recibe tu comentario y retoma «${tarea.name}» desde ahí.`}
          ancho="medio"
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault()
              void responder('rechazada', motivo.trim())
            }}
          >
            <AreaTexto
              rows={4}
              required
              maxLength={2000}
              value={motivo}
              aria-label="Motivo del rechazo"
              placeholder="Cuéntanos qué falta o qué hay que corregir."
              onChange={(evento) => { setMotivo(evento.target.value) }}
            />

            {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

            <div className="flex justify-end gap-2">
              <Boton type="button" variante="sutil" onClick={() => { setRechazando(false) }}>
                Cancelar
              </Boton>
              <Boton type="submit" variante="primario" cargando={enviando} disabled={motivo.trim() === ''}>
                Enviar comentario
              </Boton>
            </div>
          </form>
        </ContenidoDialogo>
      </Dialogo>
    </li>
  )
}
