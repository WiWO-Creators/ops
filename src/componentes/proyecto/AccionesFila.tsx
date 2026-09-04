'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import { mensajeDeRespuesta } from '@/datos/cliente'
import { FormularioRecurso } from './FormularioRecurso'
import type { CampoFormulario } from './formulario'

/**
 * Editar y eliminar, desde la fila de una tabla.
 *
 * Hitos, Notas y Discusiones ofrecen exactamente lo mismo: un formulario de edicion en dialogo y un
 * borrado con confirmacion. Escribirlo tres veces seria tres veces la misma manera de olvidarse de
 * mostrar el error del servidor.
 *
 * El borrado siempre confirma: no es reversible, y el aviso es donde se explica que arrastra
 * (las tareas de un hito, los comentarios de una discusion).
 */

interface PropsAccionesFila {
  /** Titulo del dialogo de edicion. Ej: "Editar hito". */
  tituloEdicion: string
  campos: CampoFormulario[]
  /** El registro a editar, leido por las claves de los campos. */
  registro: Record<string, unknown>
  /** Ruta del BFF del registro, sin barra inicial. Ej: `projects/93/notes/5`. */
  ruta: string
  puedeEditar: boolean
  puedeBorrar: boolean
  /** Titulo del dialogo de borrado. Ej: "Eliminar nota". */
  tituloBorrado: string
  /** Que se lleva el borrado por delante, dicho antes y no despues. */
  advertencia: string
  /** Se llama despues de escribir, para que la tabla vuelva a pedir la pagina. */
  recargar: () => void
}

export function AccionesFila ({
  tituloEdicion,
  campos,
  registro,
  ruta,
  puedeEditar,
  puedeBorrar,
  tituloBorrado,
  advertencia,
  recargar
}: PropsAccionesFila): ReactElement {
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  /** Borra el registro y refresca el listado. Nunca lanza: el fallo se muestra dentro del dialogo. */
  async function borrar (): Promise<void> {
    setBorrando(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/${ruta}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' }
      })

      if (!respuesta.ok) {
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      setConfirmando(false)
      recargar()
    } catch {
      setFallo('No se pudo eliminar: revisa la conexión.')
    } finally {
      setBorrando(false)
    }
  }

  return (
    <span className="flex gap-1">
      {puedeEditar && (
        <Boton variante="sutil" tamano="chico" onClick={() => { setEditando(true) }}>Editar</Boton>
      )}
      {puedeBorrar && (
        <Boton variante="sutil" tamano="chico" onClick={() => { setConfirmando(true) }}>Eliminar</Boton>
      )}

      {puedeEditar && (
        <FormularioRecurso
          abierto={editando}
          onAbiertoCambia={setEditando}
          titulo={tituloEdicion}
          campos={campos}
          ruta={ruta}
          metodo="PATCH"
          registro={registro}
          onGuardado={recargar}
        />
      )}

      <Dialogo open={confirmando} onOpenChange={setConfirmando}>
        <ContenidoDialogo titulo={tituloBorrado} descripcion={advertencia} ancho="chico">
          <div className="flex flex-col gap-4">
            {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
            <div className="flex justify-end gap-2">
              <Boton variante="sutil" onClick={() => { setConfirmando(false) }}>Cancelar</Boton>
              <Boton variante="peligro" cargando={borrando} onClick={() => { void borrar() }}>Eliminar</Boton>
            </div>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </span>
  )
}
