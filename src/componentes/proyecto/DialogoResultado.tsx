'use client'

import { useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'

/**
 * Confirmacion de "ganar" o "perder" sobre una oportunidad comercial, con las consecuencias escritas
 * **antes** de apretar.
 *
 * Vive aca y no dentro de la ficha de Licitacion porque las dos secciones que cierran una oportunidad
 * —Licitaciones y Upselling— apretan el mismo boton contra el mismo par de rutas
 * (`POST {base}/actions/ganar|perder`) y muestran el mismo dialogo. Lo unico que cambia entre ellas
 * es el texto de las consecuencias, que por eso es un parametro y no una cadena escrita adentro:
 * ganar una licitacion crea un cliente, ganar un upsell no crea a nadie, y prometer lo que no pasa en
 * un dialogo que dice "no se puede deshacer" es peor que no tener dialogo.
 *
 * El dialogo **no se cierra si la llamada falla**: cerrarlo dejaria el mensaje de error sin donde
 * mostrarse, y quien lo apreto creyendo que funciono se enteraria recien al recargar.
 */
export type AccionDeResultado = 'ganar' | 'perder'

interface PropsDialogoResultado {
  /**
   * Recurso sobre el que se actua, sin la accion: `licitaciones/93`, `upsells/93`. La llamada es
   * `POST {base}/actions/{accion}`.
   */
  base: string
  /** Cual de las dos se esta confirmando, o `null` cuando el dialogo esta cerrado. */
  accion: AccionDeResultado | null
  /** Que pasa al confirmar, escrito para cada rama. Es lo unico propio de cada seccion. */
  descripcion: Record<AccionDeResultado, string>
  /**
   * Rotulo del campo libre que viaja como `motivo` en el cuerpo de la accion. Sin esto no se pinta
   * ningun campo y la accion va con el cuerpo vacio.
   *
   * Existe porque un upsell guarda POR QUE se gano o se perdio, y ese texto **solo se puede escribir
   * al cerrar**: el `PATCH` de la oportunidad responde 409 en cuanto esta cerrada. Sin el campo acá,
   * habria que acordarse de escribir el motivo antes de apretar el boton. Una licitacion no tiene esa
   * columna y no pasa la prop.
   */
  motivo?: string
  onCerrar: () => void
  onHecho: () => void
}

export function DialogoResultado ({
  base,
  accion,
  descripcion,
  motivo,
  onCerrar,
  onHecho
}: PropsDialogoResultado): ReactElement {
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  const ganando = accion === 'ganar'

  /** Llama a la accion; el error es un valor que se muestra, nunca una excepcion que rompa la ficha. */
  async function confirmar (): Promise<void> {
    if (accion === null) return

    setEnviando(true)
    setFallo(null)

    // El cuerpo vacio es lo normal: explicar el resultado es opcional, y una cadena en blanco no es
    // una explicacion. La API la trataria igual que `null`, pero mandarla seria decir algo distinto.
    const cuerpo = motivo === undefined || texto.trim() === '' ? undefined : { motivo: texto.trim() }

    const resultado = await escribirEnBff<unknown>(`${base}/actions/${accion}`, 'POST', cuerpo)

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    cerrar(false)
    onHecho()
  }

  /** Cierra limpiando el error: el mensaje de un intento viejo no debe recibir al siguiente. */
  function cerrar (abierto: boolean): void {
    if (abierto) return

    setFallo(null)
    setTexto('')
    onCerrar()
  }

  return (
    <Dialogo open={accion !== null} onOpenChange={cerrar}>
      <ContenidoDialogo
        titulo={ganando ? 'Marcar como ganada' : 'Marcar como perdida'}
        descripcion={accion === null ? '' : descripcion[accion]}
      >
        {motivo !== undefined && (
          <Campo etiqueta={motivo}>
            {(props) => (
              <Entrada
                {...props}
                value={texto}
                maxLength={255}
                onChange={(evento) => { setTexto(evento.target.value) }}
              />
            )}
          </Campo>
        )}

        {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Boton type="button" variante="sutil" onClick={() => { cerrar(false) }}>Cancelar</Boton>
          <Boton
            type="button"
            variante={ganando ? 'primario' : 'peligro'}
            cargando={enviando}
            onClick={() => { void confirmar() }}
          >
            {ganando ? 'Ganar' : 'Perder'}
          </Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
