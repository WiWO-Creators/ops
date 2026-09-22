'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { ContenidoDialogo, Dialogo, DisparadorDialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { GLOSARIO } from '@/dominio/glosario'
import {
  LARGO_ASUNTO, SIN_PRIORIDAD, cuerpoDeSolicitud, solicitudCompleta
} from '@/dominio/tickets-del-portal'
import type { TicketPortalDetalle } from '@/datos/portal'
import type { Referencia } from '@/datos/recursos'

/**
 * Alta de una solicitud de soporte, **dentro de un {espacio}**.
 *
 * El soporte dejo de ser una seccion aparte del portal: el cliente pide lo que necesita en el
 * {espacio} donde le pasa, que es donde despues lo lee y donde el equipo lo atiende. Por eso este
 * formulario ya **no tiene selector de {espacio}**: el de la pantalla es el unico posible, y
 * ofrecer una lista invitaria a abrir el ticket en otro lado por error.
 *
 * Va en un dialogo y no en una pantalla propia porque son tres campos: una ruta `/nuevo` costaria
 * una navegacion de ida y otra de vuelta para lo mismo, y la pestaña detras del velo recuerda que
 * esto se suma a lo que ya hay abierto.
 *
 * **No se pregunta el motivo ni el departamento.** Esto es para que el cliente reporte lo que se le
 * rompio, y elegir a que equipo va es trabajo nuestro: repartir se hace despues, desde el panel.
 * Pedirselo era pedirle que adivinara un organigrama que no conoce.
 *
 * Las prioridades bajan resueltas desde el servidor —los catalogos del portal ya se piden ahi— en
 * vez de pedirse al montar: un selector que aparece vacio y se puebla medio segundo despues se usa
 * mal.
 */

interface PropsNuevaSolicitud {
  /** El {espacio} de la pantalla. Es lo que viaja como `project_id`: no se elige. */
  proyectoId: number
  /** `lookups.ticket_priorities`. Opcional en el contrato, asi que puede quedar sin elegir. */
  prioridades: Referencia[]
  /**
   * Como se ve el boton que abre el dialogo.
   *
   * La pestaña vacia lo ofrece como unica salida —y ahi es la accion principal de la pantalla— y la
   * pestaña con tickets lo ofrece arriba de la lista, donde competir con el contenido seria ruido.
   */
  variante?: 'primario' | 'sutil'
}

export function NuevaSolicitud ({ proyectoId, prioridades, variante = 'primario' }: PropsNuevaSolicitud) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [prioridad, setPrioridad] = useState(SIN_PRIORIDAD)

  const borrador = { asunto, mensaje, proyectoId, prioridad }

  /**
   * Crea la solicitud y lleva al hilo recien abierto.
   *
   * Nunca lanza: el error del contrato —incluido el 422 con sus `details`, que `escribirEnBff` ya
   * arma en una frase— se muestra dentro del dialogo con lo tipeado intacto, para que el cliente
   * corrija y reintente sin volver a escribir el mensaje entero.
   */
  async function crear (): Promise<void> {
    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff<TicketPortalDetalle>(
      'portal/tickets',
      'POST',
      cuerpoDeSolicitud(borrador)
    )

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    setAbierto(false)
    router.push(`/portal/soporte/${resultado.datos.id}`)
  }

  return (
    <Dialogo open={abierto} onOpenChange={setAbierto}>
      <DisparadorDialogo asChild>
        <Boton variante={variante}>Nueva solicitud</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo="Nueva solicitud"
        descripcion={`Cuéntanos qué necesitas en este ${GLOSARIO.espacio.singular.toLowerCase()} y abrimos un ${GLOSARIO.ticket.singular.toLowerCase()} con el equipo.`}
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
              disabled={!solicitudCompleta(borrador)}
            >
              Enviar solicitud
            </Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
