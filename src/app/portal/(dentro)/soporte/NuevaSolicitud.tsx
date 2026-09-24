'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { ContenidoDialogo, Dialogo, DisparadorDialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { urlConParametro } from '@/componentes/datos/tabla'
import { GLOSARIO } from '@/dominio/glosario'
import { PARAMETRO_TICKET, avisarCambioDeTicket, falloDeTicket } from '@/dominio/ticket-vista'
import {
  LARGO_ASUNTO, SIN_PRIORIDAD, cuerpoDeSolicitud, espacioPorDefecto, solicitudCompleta
} from '@/dominio/tickets-del-portal'
import type { TicketPortalDetalle } from '@/datos/portal'
import type { Referencia } from '@/datos/recursos'

/**
 * Alta de una solicitud de soporte desde el portal del cliente.
 *
 * El soporte es una seccion del portal y no una pestaña del {espacio}: el cliente pide desde un solo
 * lugar y elige ahi sobre que {espacio} es. Por eso el formulario **tiene selector de {espacio}**, y
 * por eso llega preseleccionado cuando hay uno obvio —el unico que tiene, o aquel al que entra— para
 * que la eleccion sea un cambio y no un tramite.
 *
 * Va en un dialogo y no en una pantalla propia porque son cuatro campos: una ruta
 * `/portal/soporte/nuevo` costaria una navegacion de ida y otra de vuelta para lo mismo, y el listado
 * detras del velo recuerda que esto se suma a lo que ya hay abierto.
 *
 * **No se pregunta el motivo ni el departamento.** Esto es para que el cliente reporte lo que se le
 * rompio, y elegir a que equipo va es trabajo nuestro: repartir se hace despues, desde el panel.
 * Pedirselo era pedirle que adivinara un organigrama que no conoce.
 *
 * Las listas bajan resueltas desde el servidor —los catalogos ya se piden ahi para los filtros de la
 * tabla— en vez de pedirse al montar: un selector que aparece vacio y se puebla medio segundo despues
 * se usa mal.
 *
 * Al crear, el formulario vuelve a cero (la proxima solicitud no nace con la anterior escrita) y la
 * bandeja abre la nueva en su modal **conservando filtros, orden y pagina**. Si la API contesta 200
 * en vez de 201 es el alta idempotente: la misma solicitud enviada dos veces en un minuto. No se creo
 * otra; se abre la que ya existia y se dice, para que nadie piense que hay dos.
 */

/** Cuanto dura a la vista el aviso de solicitud repetida. */
const DURACION_AVISO_MS = 15_000

interface PropsNuevaSolicitud {
  /** `lookups.ticket_priorities`. Opcional en el contrato, asi que puede quedar sin elegir. */
  prioridades: Referencia[]
  /** Los {espacios} del contacto. Con uno solo no hay nada que elegir: se preselecciona. */
  espacios: Referencia[]
  /**
   * El `proyecto_de_entrada` del contacto, o `null`.
   *
   * Es a donde cae al entrar al portal, asi que casi siempre pide sobre ese. Solo decide el valor
   * inicial del selector: quien tenga otro en mente lo cambia sin resistencia.
   */
  entradaId?: number | null
}

export function NuevaSolicitud ({ prioridades, espacios, entradaId = null }: PropsNuevaSolicitud) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  // Segundos que pidio esperar un 429; mientras no es `null` el envio queda bloqueado.
  const [espera, setEspera] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const enviandoAhora = useRef(false)

  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [espacio, setEspacio] = useState(() => espacioPorDefecto(espacios, entradaId))
  const [prioridad, setPrioridad] = useState(SIN_PRIORIDAD)

  useEffect(() => {
    if (espera === null) return

    const id = window.setTimeout(() => { setEspera(null) }, espera * 1000)

    return () => { window.clearTimeout(id) }
  }, [espera])

  useEffect(() => {
    if (aviso === null) return

    const id = window.setTimeout(() => { setAviso(null) }, DURACION_AVISO_MS)

    return () => { window.clearTimeout(id) }
  }, [aviso])

  // Sin espacios no hay nada que abrir: el contrato exige `project_id`, asi que el boton no se ofrece
  // en vez de ofrecer un formulario que la API va a rechazar siempre.
  if (espacios.length === 0) return null

  const borrador = { asunto, mensaje, espacio, prioridad }

  /**
   * Crea la solicitud y lleva al hilo recien abierto.
   *
   * Nunca lanza: el error del contrato —incluido el 422 con sus `details`, que `escribirEnBff` ya
   * arma en una frase— se muestra dentro del dialogo con lo tipeado intacto, para que el cliente
   * corrija y reintente sin volver a escribir el mensaje entero.
   */
  async function crear (): Promise<void> {
    if (enviandoAhora.current || espera !== null || !solicitudCompleta(borrador)) return

    enviandoAhora.current = true
    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff<TicketPortalDetalle>(
      'portal/tickets',
      'POST',
      cuerpoDeSolicitud(borrador)
    )

    enviandoAhora.current = false
    setEnviando(false)

    if (!resultado.ok) {
      const explicado = falloDeTicket(resultado, 'crear')

      setFallo(explicado.texto)
      if (explicado.esperarSegundos !== null) setEspera(explicado.esperarSegundos)

      return
    }

    const id = resultado.datos.id

    reiniciar()
    setAbierto(false)
    setAviso(resultado.estado === 200
      ? 'Ese ticket ya lo habías enviado hace un momento: te mostramos el que ya existe.'
      : null)
    avisarCambioDeTicket(id)
    // `window.location` y no `useSearchParams`: se lee en el momento del clic y el componente no
    // necesita un limite de Suspense solo para esto.
    router.push(urlConParametro(new URLSearchParams(window.location.search), PARAMETRO_TICKET, String(id)), { scroll: false })
  }

  /** Deja el formulario como recien abierto. */
  function reiniciar (): void {
    setAsunto('')
    setMensaje('')
    setEspacio(espacioPorDefecto(espacios, entradaId))
    setPrioridad(SIN_PRIORIDAD)
    setFallo(null)
  }

  return (
    <>
      {/* La region vive siempre montada: un `role="status"` que aparece junto con su texto no se
          anuncia en varios lectores de pantalla. */}
      <p role="status" className={aviso === null ? 'sr-only' : 'text-texto-tenue text-sm'}>{aviso ?? ''}</p>
      <Dialogo open={abierto} onOpenChange={setAbierto}>
        <DisparadorDialogo asChild>
          <Boton variante="primario">Nuevo ticket</Boton>
        </DisparadorDialogo>

        <ContenidoDialogo
          titulo="Nuevo ticket"
          descripcion="Cuéntanos qué necesitas y se lo hacemos llegar al equipo."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault()
              void crear()
            }}
          >
            <Campo etiqueta="Asunto" requerido>
              {(props) => (
                <Entrada
                  {...props}
                  value={asunto}
                  autoFocus
                  maxLength={LARGO_ASUNTO}
                  placeholder="En una línea, qué necesitas"
                  onChange={(evento) => { setAsunto(evento.target.value) }}
                />
              )}
            </Campo>

            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta={GLOSARIO.espacio.singular} requerido>
                {(props) => (
                  <Selector value={espacio} onValueChange={setEspacio} disabled={espacios.length === 1}>
                    <DisparadorSelector id={props.id} marcador={`Elige un ${GLOSARIO.espacio.singular.toLowerCase()}`} />
                    <ContenidoSelector>
                      {espacios.map((opcion) => (
                        <Opcion key={opcion.id} value={String(opcion.id)}>{opcion.name}</Opcion>
                      ))}
                    </ContenidoSelector>
                  </Selector>
                )}
              </Campo>

              <Campo etiqueta="Prioridad" ayuda="Si no la eliges, la define el equipo.">
                {(props) => (
                  <Selector value={prioridad} onValueChange={setPrioridad}>
                    <DisparadorSelector id={props.id} />
                    <ContenidoSelector>
                      <Opcion value={SIN_PRIORIDAD}>Sin elegir</Opcion>
                      {prioridades.map((opcion) => (
                        <Opcion key={opcion.id} value={String(opcion.id)}>{opcion.name}</Opcion>
                      ))}
                    </ContenidoSelector>
                  </Selector>
                )}
              </Campo>
            </div>

            <Campo etiqueta="Mensaje" requerido>
              {(props) => (
                <AreaTexto
                  {...props}
                  rows={5}
                  value={mensaje}
                  placeholder="Cuéntanos qué pasa, desde cuándo y qué esperabas que ocurriera."
                  onChange={(evento) => { setMensaje(evento.target.value) }}
                />
              )}
            </Campo>

            {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

            <div className="flex justify-end gap-2">
              <Boton type="button" variante="sutil" onClick={() => { setAbierto(false) }}>
                Cancelar
              </Boton>
              <Boton
                type="submit"
                variante="primario"
                cargando={enviando}
                disabled={!solicitudCompleta(borrador) || espera !== null}
              >
                Enviar ticket
              </Boton>
            </div>
          </form>
        </ContenidoDialogo>
      </Dialogo>
    </>
  )
}
