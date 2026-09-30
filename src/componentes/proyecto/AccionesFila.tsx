'use client'

import { useState, type ReactElement } from 'react'
import { MenuAccionesFila } from '@/componentes/datos/MenuAccionesFila'
import { useAviso } from '@/componentes/estado/useAviso'
import { mensajeDeRespuesta } from '@/datos/cliente'
import { FormularioRecurso } from './FormularioRecurso'
import type { CampoFormulario } from './formulario'

/**
 * Editar y eliminar, desde el menu "⋯" de una fila de tabla.
 *
 * Hitos y Notas ofrecen exactamente lo mismo: un formulario de edicion en dialogo y un
 * borrado con confirmacion. Escribirlo por pantalla seria multiplicar la misma manera de olvidarse de
 * mostrar el error del servidor. Por eso vive sobre `MenuAccionesFila`: mismo disparador y misma
 * confirmacion que el resto de las tablas.
 *
 * El borrado siempre confirma: no es reversible, y el aviso es donde se explica que arrastra
 * (las tareas de un hito, por ejemplo).
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
  /** Como se llama el registro, para nombrarlo en el aviso de exito. Ej: el nombre del hito. */
  nombre: string
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
  recargar,
  nombre
}: PropsAccionesFila): ReactElement {
  const [editando, setEditando] = useState(false)
  const aviso = useAviso()

  /** Borra el registro y refresca el listado. Lanza si falla: `ConfirmarBorrado` muestra el mensaje. */
  async function borrar (): Promise<void> {
    const respuesta = await fetch(`/api/bff/${ruta}`, {
      method: 'DELETE',
      headers: { accept: 'application/json' }
    })

    if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

    recargar()
    aviso.exito(`«${nombre}» se eliminó.`)
  }

  return (
    <>
      <MenuAccionesFila
        onEditar={puedeEditar ? () => { setEditando(true) } : undefined}
        borrado={puedeBorrar ? { titulo: tituloBorrado, advertencia, onConfirmar: borrar } : undefined}
      />

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
    </>
  )
}
