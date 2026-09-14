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
import type { TicketPortalDetalle } from '@/datos/portal'
import type { Referencia } from '@/datos/recursos'

/**
 * Alta de una solicitud de soporte desde el portal del cliente.
 *
 * Hasta ahora el portal solo leia tickets y el cliente tenia que escribir por correo o volver al
 * portal viejo; el hilo quedaba partido en dos lugares. Acá se abre donde despues se lee.
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
 */

/** Centinela de "sin prioridad": Radix no admite un `value` vacio en una opcion. */
const SIN_PRIORIDAD = 'ninguna'

/** Tope de `subject` en el contrato. Se corta acá para que el 422 no llegue por algo evitable. */
const LARGO_ASUNTO = 191

/**
 * Valor inicial de un selector: preseleccionado si hay una sola opcion, vacio si hay varias.
 *
 * Elegir entre una es trabajo que no decide nada; el cliente con un solo espacio no deberia abrir un
 * desplegable para confirmar lo unico que podia pasar.
 */
function unicaOpcion (opciones: Referencia[]): string {
  const [primera, ...resto] = opciones

  return primera !== undefined && resto.length === 0 ? String(primera.id) : ''
}

interface PropsNuevaSolicitud {
  /** `lookups.ticket_priorities`. Opcional en el contrato, asi que puede quedar sin elegir. */
  prioridades: Referencia[]
  /** Los espacios del contacto. Con uno solo no hay nada que elegir: se preselecciona. */
  espacios: Referencia[]
}

export function NuevaSolicitud ({ prioridades, espacios }: PropsNuevaSolicitud) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [espacio, setEspacio] = useState(unicaOpcion(espacios))
  const [prioridad, setPrioridad] = useState(SIN_PRIORIDAD)

  // Sin espacios no hay nada que abrir: el contrato exige `project_id`, asi que el boton no se ofrece
  // en vez de ofrecer un formulario que la API va a rechazar siempre.
  if (espacios.length === 0) return null

  const completo = asunto.trim() !== '' && mensaje.trim() !== '' && espacio !== ''

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

    const resultado = await escribirEnBff<TicketPortalDetalle>('portal/tickets', 'POST', {
      subject: asunto.trim(),
      message: mensaje.trim(),
      project_id: Number(espacio),
      ...(prioridad === SIN_PRIORIDAD ? {} : { priority: Number(prioridad) })
    })

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
        <Boton variante="primario">Nueva solicitud</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo="Nueva solicitud"
        descripcion={`Cuéntanos qué necesitas y abrimos un ${GLOSARIO.ticket.singular.toLowerCase()} con el equipo.`}
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
            <Boton type="submit" variante="primario" cargando={enviando} disabled={!completo}>
              Enviar solicitud
            </Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
