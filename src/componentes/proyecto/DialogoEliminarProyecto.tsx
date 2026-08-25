'use client'

import { useState } from 'react'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { Espacio } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'

interface PropsDialogoEliminar {
  /** Proyecto a eliminar, o `null` cuando el dialogo esta cerrado. */
  espacio: Espacio | null
  onCerrar: () => void
  onEliminado: () => void
}

/**
 * Confirmacion de borrado de un Proyecto.
 *
 * Se nombra el proyecto en la pregunta: una confirmacion generica ("¿Seguro?") no deja verificar que
 * la fila sobre la que se hizo clic es la que se va a borrar, que es justo el error que la
 * confirmacion existe para evitar. El borrado arrastra tareas, hitos y horas, asi que se dice.
 */
export function DialogoEliminarProyecto ({ espacio, onCerrar, onEliminado }: PropsDialogoEliminar) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (espacio === null) return null

  async function eliminar (id: number) {
    setEnviando(true)
    setError(null)

    const resultado = await escribirEnBff(`projects/${id}`, 'DELETE')

    setEnviando(false)

    if (resultado.ok) {
      onEliminado()
      return
    }

    setError(resultado.mensaje)
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        ancho="chico"
        titulo={`Eliminar ${GLOSARIO.espacio.singular.toLowerCase()}`}
        descripcion={`Se va a eliminar «${espacio.name}» junto con sus ${GLOSARIO.proceso.plural.toLowerCase()}, ${GLOSARIO.hito.plural.toLowerCase()} y horas registradas. No se puede deshacer.`}
      >
        {error !== null && <p role="alert" className="text-texto-peligro mb-3 text-sm">{error}</p>}

        <div className="flex justify-end gap-2">
          <CerrarDialogo asChild>
            <Boton variante="sutil">Cancelar</Boton>
          </CerrarDialogo>
          <Boton
            variante="peligro"
            cargando={enviando}
            onClick={() => { void eliminar(espacio.id) }}
          >
            Eliminar
          </Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
