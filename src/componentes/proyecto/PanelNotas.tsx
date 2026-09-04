'use client'

import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { NOTAS } from '@/definiciones/discusiones'
import { AccionesFila } from './AccionesFila'
import { FormularioRecurso } from './FormularioRecurso'
import { PanelRecurso } from './PanelRecurso'
import type { CampoFormulario } from './formulario'
import type { NotaEspacio } from '@/datos/recursos'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Pestaña Notas del Proyecto.
 *
 * Son **notas privadas**: cada persona ve solo las suyas, y el backend filtra por el staff de la
 * sesion sin que el frontend le pase ningun parametro. Por eso las acciones de editar y borrar se
 * ofrecen siempre: todo lo que se lista es propio.
 */

/** Campos del formulario de nota. `title` lo exige la API y la columna tiene 255 caracteres. */
const CAMPOS: CampoFormulario[] = [
  { clave: 'title', etiqueta: 'Título', tipo: 'texto', requerido: true, maximo: 255 },
  { clave: 'content', etiqueta: 'Contenido', tipo: 'area' }
]

export function PanelNotas ({ proyectoId }: { proyectoId: number }): ReactElement {
  const [revision, setRevision] = useState(0)
  const [creando, setCreando] = useState(false)

  const recargar = useCallback(() => { setRevision((n) => n + 1) }, [])

  const definicion = useMemo<DefinicionRecurso<NotaEspacio>>(
    () => ({
      ...NOTAS,
      ruta: `projects/${encodeURIComponent(String(proyectoId))}/notes`,
      columnas: [
        ...NOTAS.columnas,
        {
          clave: 'acciones',
          encabezado: 'Acciones',
          presentar: (nota: NotaEspacio) => (
            <AccionesFila
              tituloEdicion="Editar nota"
              campos={CAMPOS}
              registro={nota as unknown as Record<string, unknown>}
              ruta={`projects/${proyectoId}/notes/${nota.id}`}
              puedeEditar
              puedeBorrar
              tituloBorrado="Eliminar nota"
              advertencia={`"${nota.title}" se borra para siempre.`}
              recargar={recargar}
            />
          )
        }
      ]
    }),
    [proyectoId, recargar]
  )

  const barra = (
    <div className="flex justify-end">
      <Boton variante="primario" tamano="chico" onClick={() => { setCreando(true) }}>Nueva nota</Boton>
    </div>
  )

  return (
    <>
      <PanelRecurso
        definicion={definicion}
        claveFila={(nota) => nota.id}
        barra={barra}
        revision={revision}
      />

      <FormularioRecurso
        abierto={creando}
        onAbiertoCambia={setCreando}
        titulo="Nueva nota"
        descripcion="Solo tú ves tus notas de este proyecto."
        campos={CAMPOS}
        ruta={`projects/${proyectoId}/notes`}
        metodo="POST"
        onGuardado={recargar}
      />
    </>
  )
}
