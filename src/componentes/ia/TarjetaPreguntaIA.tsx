'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { LARGO_MAXIMO_PREGUNTA } from '@/dominio/ia-chat'
import { type PreguntaIA } from '@/dominio/ia'

/**
 * La tarjeta de algo que WiBot necesita saber y prefirio preguntar antes que asumir.
 *
 * === POR QUE NO HAY ENDPOINT DE RESPUESTA ===
 *
 * Elegir una opcion **manda su etiqueta como el mensaje siguiente de la persona**, por el mismo
 * camino exacto que el campo de escribir del chat. Nada mas. No hay `POST` de respuesta, no hay id
 * de pregunta que resolver y no hay fila que quede pendiente en el servidor: la pregunta cierra el
 * turno y lo que viene despues es una conversacion normal, donde el modelo ya sabe lo que pregunto
 * porque lo tiene en el hilo. Eso es tambien lo que separa esta tarjeta de `TarjetaPropuestaIA`:
 * aquella confirma una escritura congelada en el servidor, esta solo escribe en el chat.
 *
 * === POR QUE SE CONTESTA UNA SOLA VEZ ===
 *
 * Contestar dispara un turno nuevo. Un boton que siguiera vivo despues de eso mandaria la misma
 * respuesta por segunda vez, y el modelo propondria dos veces lo mismo —dos tarjetas de Confirmar
 * para una sola intencion, que es el fallo que mas caro sale de todos los de esta pantalla—.
 *
 * El bloqueo **no vive en este componente**: llega en `respuesta`, que `respuestaAPreguntas()` deriva
 * del hilo. Guardarlo en un `useState` de aca lo perderia al cerrar y volver a abrir el chat, que
 * desmonta esta tarjeta pero no toca el hilo, y la pregunta volveria a estar abierta.
 *
 * === EL TEXTO LIBRE ES LA EXCEPCION, NO LA REGLA ===
 *
 * Solo aparece con `admite_texto`, que el servidor enciende cuando las opciones no agotan el dominio
 * —las fechas: "hoy" y "el proximo lunes" no son todos los dias que existen—. En los campos de si/no
 * no aparece, porque ahi los dos botones ya son todo lo que se puede contestar.
 *
 * @param pregunta la pregunta tal como llego del stream o del hilo guardado
 * @param respuesta lo que la persona ya contesto, o `null` si la pregunta sigue abierta
 * @param onResponder manda el texto como mensaje de la persona
 */
export function TarjetaPreguntaIA ({
  pregunta,
  respuesta,
  onResponder
}: {
  pregunta: PreguntaIA
  respuesta: string | null
  onResponder: (texto: string) => void
}): ReactElement {
  const [texto, setTexto] = useState('')

  const enunciado = <p className="text-texto break-words text-sm font-medium">{pregunta.pregunta}</p>

  if (respuesta !== null) {
    // La etiqueta ES lo que se mando, asi que buscar por ella recupera la opcion elegida y su
    // consecuencia. Una respuesta escrita a mano no coincide con ninguna y se muestra tal cual.
    const elegida = pregunta.opciones.find((opcion) => opcion.etiqueta === respuesta)

    return (
      <div className="border-linea bg-superficie rounded-tarjeta flex flex-col gap-2 border p-3">
        {enunciado}

        <p className="text-texto-tenue break-words text-xs">
          <span className="font-medium">Respondiste</span>
          {' · '}
          {respuesta}
        </p>

        {elegida !== undefined && elegida.descripcion !== '' && (
          <p className="text-texto-sutil break-words text-xs">{elegida.descripcion}</p>
        )}
      </div>
    )
  }

  /** Manda lo escrito en el campo libre. Mismo camino que un boton: es un mensaje de la persona. */
  function responderConTexto (): void {
    const escrito = texto.trim()

    if (escrito === '') return

    setTexto('')
    onResponder(escrito)
  }

  return (
    <div className="border-linea bg-superficie rounded-tarjeta flex flex-col gap-2 border p-3">
      {enunciado}

      <ul className="flex flex-col gap-1.5">
        {pregunta.opciones.map((opcion, indice) => (
          <li key={indice}>
            <button
              type="button"
              onClick={() => { onResponder(opcion.etiqueta) }}
              className="border-control-borde bg-control hover:bg-hover rounded-control flex w-full flex-col gap-0.5 border px-3 py-2 text-left transition-[background-color,border-color] duration-150 ease-neo"
            >
              <span className="text-texto text-sm font-semibold">{opcion.etiqueta}</span>
              {opcion.descripcion !== '' && (
                <span className="text-texto-tenue text-xs">{opcion.descripcion}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {pregunta.admite_texto && (
        <form
          className="flex items-center gap-2"
          onSubmit={(evento) => { evento.preventDefault(); responderConTexto() }}
        >
          <Entrada
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            maxLength={LARGO_MAXIMO_PREGUNTA}
            aria-label="Tu respuesta"
            placeholder="O escríbelo tú…"
          />
          <Boton type="submit" tamano="chico" variante="primario" disabled={texto.trim() === ''}>
            Enviar
          </Boton>
        </form>
      )}

      <p className="text-texto-sutil text-xs">Tu respuesta se manda como tu próximo mensaje.</p>
    </div>
  )
}
