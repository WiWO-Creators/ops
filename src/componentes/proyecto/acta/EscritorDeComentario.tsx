'use client'

import { useId, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react'
import { AtSign } from 'lucide-react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Boton } from '@/componentes/formularios/Boton'
import { SelectorBuscableMultiple } from '@/componentes/formularios/SelectorBuscableMultiple'
import type { StaffReferencia } from '@/datos/tipos'
import { LARGO_MAXIMO_COMENTARIO, MAXIMO_DE_MENCIONES, revisarComentario } from '@/dominio/comentarios-acta'

/** Desde cuántos caracteres se muestra el contador: antes no aporta y ensucia el campo. */
const CONTADOR_DESDE = Math.floor(LARGO_MAXIMO_COMENTARIO * 0.8)

interface PropsEscritor {
  /** Nombre accesible del campo: «Comentario», «Respuesta»… */
  etiqueta: string
  placeholder: string
  /** Texto del botón que envía. */
  etiquetaEnviar: string
  /** Para editar: lo que ya decía el comentario. */
  textoInicial?: string
  mencionesIniciales?: readonly number[]
  /** Las personas a las que se puede mencionar (las asignables). Vacía = sin selector de menciones. */
  personas: readonly StaffReferencia[]
  autoEnfocar?: boolean
  /** Guarda el comentario. Devuelve `null` si salió bien, o el mensaje del fallo para mostrarlo aquí. */
  onEnviar: (texto: string, menciones: number[]) => Promise<string | null>
  /** Se llamó a `onEnviar` y salió bien. */
  onListo?: () => void
  /** Si viene, se ofrece «Cancelar». */
  onCancelar?: () => void
}

/**
 * El cuadro para escribir un comentario del Meeting Paper: texto plano, menciones explícitas y el
 * envío con Ctrl+Enter.
 *
 * Es el mismo para el primer comentario de un hilo, las respuestas y la edición. Las menciones se
 * eligen aparte, no se escriben con `@`: el comentario es texto plano y el board recibe la lista de
 * ids tal cual; el texto no se interpreta. Un fallo del board se muestra aquí mismo, junto al campo,
 * y conserva lo escrito.
 *
 * @param props el texto de la interfaz, las personas mencionables y qué hacer al enviar
 * @returns el formulario
 */
export function EscritorDeComentario ({
  etiqueta,
  placeholder,
  etiquetaEnviar,
  textoInicial = '',
  mencionesIniciales = [],
  personas,
  autoEnfocar = false,
  onEnviar,
  onListo,
  onCancelar
}: PropsEscritor): ReactElement {
  const [texto, setTexto] = useState(textoInicial)
  const [menciones, setMenciones] = useState<number[]>([...mencionesIniciales])
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idCampo = useId()
  const idError = useId()

  const opciones = useMemo(
    () => personas.map((persona) => ({ id: persona.id, nombre: persona.full_name, imagen: persona.profile_image_url })),
    [personas]
  )

  /** Revisa el texto, lo manda y, si el board lo guardó, deja el campo limpio. */
  async function enviar (): Promise<void> {
    const revisado = revisarComentario(texto)

    if (!revisado.ok) {
      setError(revisado.motivo)

      return
    }

    setEnviando(true)
    setError(null)

    const fallo = await onEnviar(revisado.texto, menciones)

    setEnviando(false)

    if (fallo !== null) {
      setError(fallo)

      return
    }

    setTexto('')
    setMenciones([])
    onListo?.()
  }

  function alTeclear (evento: KeyboardEvent<HTMLTextAreaElement>): void {
    if (evento.key === 'Enter' && (evento.ctrlKey || evento.metaKey) && !enviando) {
      evento.preventDefault()
      void enviar()
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(evento) => { evento.preventDefault(); void enviar() }}
    >
      <AreaTexto
        id={idCampo}
        value={texto}
        onChange={(evento) => { setTexto(evento.target.value); setError(null) }}
        onKeyDown={alTeclear}
        maxLength={LARGO_MAXIMO_COMENTARIO}
        placeholder={placeholder}
        aria-label={etiqueta}
        aria-invalid={error !== null}
        aria-describedby={error === null ? undefined : idError}
        autoFocus={autoEnfocar}
        disabled={enviando}
        rows={3}
        className="min-h-16"
      />

      {texto.length >= CONTADOR_DESDE && (
        <p className="text-texto-tenue self-end text-xs tabular-nums" aria-live="polite">
          {texto.length}/{LARGO_MAXIMO_COMENTARIO}
        </p>
      )}

      {opciones.length > 0 && (
        <SelectorBuscableMultiple
          opciones={opciones}
          elegidos={menciones}
          onCambiar={(ids) => { setMenciones(ids.slice(0, MAXIMO_DE_MENCIONES)) }}
          icono={AtSign}
          resumen={(lista) => lista.length === 0
            ? 'Mencionar a alguien'
            : `${lista.length} ${lista.length === 1 ? 'persona mencionada' : 'personas mencionadas'}`}
          placeholder="Buscar una persona…"
          sinResultados="Nadie con ese nombre."
          etiquetaSacar={(nombre) => `Quitar la mención a ${nombre}`}
          disabled={enviando}
        />
      )}

      {error !== null && <AvisoEnLinea id={idError} variante="error" mensaje={error} className="text-sm" />}

      <div className="flex items-center justify-end gap-2">
        {onCancelar !== undefined && (
          <Boton variante="sutil" tamano="chico" type="button" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Boton>
        )}
        <Boton variante="primario" tamano="chico" type="submit" cargando={enviando}>
          {etiquetaEnviar}
        </Boton>
      </div>
    </form>
  )
}
