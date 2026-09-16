'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Fecha } from '@/componentes/presentadores/Fecha'
import type { JustificacionDesviacion } from '@/datos/recursos'

/**
 * Lo que alega el EQUIPO sobre una desviacion de plazo.
 *
 * === Por que no es el comentario del cliente ===
 *
 * Arriba, en el bloque de aprobacion, se lee lo que dijo el CLIENTE desde su portal. Acá se lee lo
 * que decimos nosotros cuando el atraso se perdona **sin** que el cliente haya aprobado nada.
 *
 * Están separados —dos cajas, dos rótulos, dos endpoints— y tienen que seguir estándolo. En una
 * reunión de control de gestión, "el cliente aceptó el atraso" y "nosotros dijimos que estaba bien"
 * no pesan igual, y el día que compartan lugar en la pantalla nadie va a poder distinguirlos.
 *
 * === Que NO hace ===
 *
 * No toca el estado de SLA ni la desviación: el Proceso sigue figurando desviado y el número no se
 * mueve. Lo único que agrega es la razón, escrita y firmada. Si borrara la desviación, el campo
 * sería un botón para limpiar el tablero, que es lo contrario de lo que se pidió.
 */

interface Props {
  /** Id del Proceso que se justifica. */
  tareaId: number
  /** La justificación vigente, o `undefined` si la base no tiene la migración 0691. */
  justificacion: JustificacionDesviacion | undefined
  /** `true` si quien mira tiene `edit` sobre tareas: sin eso sólo se lee. */
  puedeEditar: boolean
  /** Se llama tras guardar, para que el detalle vuelva a pedir la tarea. */
  onCambiado: () => void
}

/** Tope del texto. Es el mismo `varchar(2000)` de la migración 0691; el backend rechaza con 422. */
const TEXTO_MAXIMO = 2000

export function JustificacionDelEquipo (
  { tareaId, justificacion, puedeEditar, onCambiado }: Props
): ReactElement | null {
  const [escribiendo, setEscribiendo] = useState(false)

  // La clave ausente es "esta base no tiene la migración 0691", que no es lo mismo que "nadie
  // justificó nada". En el primer caso no hay nada que ofrecer.
  if (justificacion === undefined) return null

  const hayTexto = justificacion.texto !== null && justificacion.texto !== ''

  return (
    <div className="border-linea col-span-full flex flex-col gap-2 border-t pt-3">
      <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
        Justificación del equipo
      </span>

      {hayTexto
        ? (
          <>
            <p className="text-texto-tenue text-sm">{justificacion.texto}</p>
            {justificacion.creada_en !== null && (
              <span className="text-texto-sutil text-xs">
                Escrita el <Fecha valor={justificacion.creada_en} conHora />
              </span>
            )}
          </>
          )
        : (
          <p className="text-texto-sutil text-sm">
            Sin justificación del equipo. Es distinta del comentario del cliente: acá va por qué
            nosotros damos por buena la desviación.
          </p>
          )}

      {puedeEditar && !escribiendo && (
        <Boton variante="sutil" tamano="chico" className="self-start" onClick={() => setEscribiendo(true)}>
          {hayTexto ? 'Escribir otra' : 'Justificar la desviación'}
        </Boton>
      )}

      {puedeEditar && escribiendo && (
        <Formulario
          tareaId={tareaId}
          hayAnterior={hayTexto}
          onCerrar={() => setEscribiendo(false)}
          onGuardada={() => { setEscribiendo(false); onCambiado() }}
        />
      )}
    </div>
  )
}

/**
 * Caja para escribir una justificación nueva.
 *
 * Es append-only del lado del backend: la anterior no se pisa, queda en el historial. Por eso el
 * botón dice "Escribir otra" y no "Editar" — editar sugeriría que la anterior desaparece, y lo que
 * dijimos el mes pasado es justamente lo que se quiere poder mirar.
 */
function Formulario (
  { tareaId, hayAnterior, onCerrar, onGuardada }:
  { tareaId: number, hayAnterior: boolean, onCerrar: () => void, onGuardada: () => void }
): ReactElement {
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  /** Manda la justificación. Nunca lanza: el rechazo del contrato se lee debajo del campo. */
  async function guardar (): Promise<void> {
    const limpio = texto.trim()

    // Se valida acá además de en el backend porque un 422 por un campo vacío es un viaje de ida y
    // vuelta para decir algo que ya se sabía al apretar el botón.
    if (limpio === '') {
      setFallo('Escribí por qué se da por buena la desviación.')
      return
    }

    if (limpio.length > TEXTO_MAXIMO) {
      setFallo(`La justificación no puede pasar de ${TEXTO_MAXIMO} caracteres.`)
      return
    }

    setGuardando(true)
    setFallo(null)

    const resultado = await escribirEnBff<JustificacionDesviacion>(
      `tasks/${tareaId}/justificacion`,
      'POST',
      { texto: limpio }
    )

    setGuardando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    onGuardada()
  }

  return (
    <div className="flex flex-col gap-2">
      <Campo
        etiqueta="Por qué se da por buena la desviación"
        ayuda={
          hayAnterior
            ? 'La justificación anterior no se borra: queda en el historial.'
            : 'Esto lo escribe el equipo. El comentario del cliente se guarda aparte.'
        }
        error={fallo ?? undefined}
      >
        {(props) => (
          <AreaTexto
            {...props}
            rows={3}
            maxLength={TEXTO_MAXIMO}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
          />
        )}
      </Campo>

      <div className="flex gap-2">
        <Boton variante="sutil" tamano="chico" onClick={onCerrar}>Cancelar</Boton>
        <Boton
          variante="secundario"
          tamano="chico"
          cargando={guardando}
          onClick={() => { void guardar() }}
        >
          Guardar la justificación
        </Boton>
      </div>
    </div>
  )
}
