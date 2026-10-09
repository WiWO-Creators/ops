'use client'

import { useState, type ReactElement, type ReactNode } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { confirmacionCoincideCon } from '@/dominio/confirmar-borrado'

/**
 * Estado de apertura de un `ConfirmarBorrado`, para controlarlo desde quien lo dispara.
 *
 * Existe como hook aparte —y no como estado interno del dialogo— porque quien lo abre casi siempre es
 * otra cosa: un `ItemMenu` de `MenuAccionesFila`, un boton en una ficha. El disparador necesita poder
 * pedir la apertura sin renderizar el dialogo el mismo.
 */
export interface EstadoConfirmarBorrado {
  abierto: boolean
  abrir: () => void
  cerrar: () => void
}

/**
 * Estado de apertura para un `ConfirmarBorrado`.
 *
 * @returns `abierto` y las dos funciones para cambiarlo
 */
export function useConfirmarBorrado (): EstadoConfirmarBorrado {
  const [abierto, setAbierto] = useState(false)

  return { abierto, abrir: () => { setAbierto(true) }, cerrar: () => { setAbierto(false) } }
}

export interface PropsConfirmarBorrado {
  abierto: boolean
  onCerrar: () => void
  /** Titulo del dialogo. Por defecto, "Eliminar". */
  titulo?: string
  /** Que se lleva el borrado por delante, dicho antes y no despues. */
  advertencia: string
  /**
   * Si viene, exige escribir exactamente este texto para habilitar el boton de confirmar.
   *
   * Sin esto, el borrado se confirma con un solo clic: correcto para lo que va a una papelera y se
   * puede restaurar. Con esto —el nombre del recurso, o la palabra "ELIMINAR"— para lo que es
   * definitivo y no tiene vuelta atras.
   */
  confirmacionEscrita?: string
  /**
   * Ejecuta el borrado. Si lanza, el dialogo muestra el mensaje del error y sigue abierto; si
   * termina sin lanzar, el dialogo se cierra solo.
   */
  onConfirmar: () => Promise<void> | void
  tamano?: 'chico' | 'medio'
  /**
   * Contenido propio de quien llama, entre la advertencia y la confirmacion escrita.
   *
   * Existe para `BajaYBorrado`: el borrado definitivo de una persona pide a quien hereda su
   * trabajo, y ese selector no es generico como para vivir en esta primitiva.
   */
  contenidoExtra?: ReactNode
  /** Deshabilita ademas el boton de confirmar, por una condicion externa (ej. falta elegir el heredero). */
  deshabilitadoExtra?: boolean
  /** Texto del boton de confirmar. Por defecto, "Eliminar". */
  etiquetaConfirmar?: string
}

/**
 * Confirmacion de borrado generica: un dialogo con advertencia, boton de peligro y, opcionalmente,
 * una confirmacion escrita para lo irreversible.
 *
 * Es el reemplazo comun de las confirmaciones de borrado que se repetian por pantalla —proyecto,
 * prospecto, cliente—, cada una con su propio estado de "enviando" y su propio manejo de error. Esta
 * no sabe nada de la ruta ni del metodo HTTP: recibe `onConfirmar` y hace lo mismo siempre.
 */
export function ConfirmarBorrado ({
  abierto,
  onCerrar,
  titulo = 'Eliminar',
  advertencia,
  confirmacionEscrita,
  onConfirmar,
  tamano = 'medio',
  contenidoExtra,
  deshabilitadoExtra = false,
  etiquetaConfirmar = 'Eliminar'
}: PropsConfirmarBorrado): ReactElement {
  const [escrito, setEscrito] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const confirmacionCoincide = confirmacionCoincideCon(confirmacionEscrita, escrito)

  function cerrarYLimpiar (): void {
    setEscrito('')
    setFallo(null)
    onCerrar()
  }

  async function confirmar (): Promise<void> {
    if (enCurso || !confirmacionCoincide || deshabilitadoExtra) return

    setEnCurso(true)
    setFallo(null)

    try {
      await onConfirmar()
      cerrarYLimpiar()
    } catch (error) {
      setFallo(error instanceof Error ? error.message : 'No se pudo completar: revisa la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <Dialogo open={abierto} onOpenChange={(siguiente) => { if (!siguiente && !enCurso) cerrarYLimpiar() }}>
      <ContenidoDialogo ancho={tamano === 'chico' ? 'chico' : 'medio'} titulo={titulo} descripcion={advertencia}>
        <div className="flex flex-col gap-4">
          {contenidoExtra}

          {confirmacionEscrita !== undefined && (
            <Campo etiqueta={`Escribe «${confirmacionEscrita}» para confirmar`} requerido>
              {(props) => (
                <Entrada
                  {...props}
                  value={escrito}
                  autoComplete="off"
                  disabled={enCurso}
                  onChange={(evento) => { setEscrito(evento.target.value) }}
                />
              )}
            </Campo>
          )}

          {fallo !== null && <AvisoEnLinea variante="error" mensaje={fallo} className="text-sm" />}

          <div className="flex justify-end gap-2">
            <Boton variante="sutil" disabled={enCurso} onClick={cerrarYLimpiar}>Cancelar</Boton>
            <Boton
              variante="peligro"
              cargando={enCurso}
              disabled={enCurso || !confirmacionCoincide || deshabilitadoExtra}
              onClick={() => { void confirmar() }}
            >
              {etiquetaConfirmar}
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
