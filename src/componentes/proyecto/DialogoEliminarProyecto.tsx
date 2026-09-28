'use client'

import { ConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import { useAviso } from '@/componentes/estado/useAviso'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { Espacio } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'

interface PropsDialogoEliminar {
  /** Proyecto a eliminar, o `null` cuando el dialogo esta cerrado. */
  espacio: Espacio | null
  onCerrar: () => void
  onEliminado: () => void
  /** Como se nombra lo que se borra en el titulo; por defecto, Proyecto. Una Licitacion es un Proyecto. */
  tipo?: string
}

/**
 * Confirmacion de borrado de un Proyecto, sobre la primitiva comun `ConfirmarBorrado`.
 *
 * Se nombra el proyecto en la advertencia: una confirmacion generica ("¿Seguro?") no deja verificar
 * que la fila sobre la que se hizo clic es la que se va a borrar, que es justo el error que la
 * confirmacion existe para evitar. El borrado arrastra tareas, hitos y horas, asi que se dice. Sin
 * confirmacion escrita: va a la papelera y se puede restaurar durante 30 dias.
 */
export function DialogoEliminarProyecto ({ espacio, onCerrar, onEliminado, tipo = GLOSARIO.espacio.singular }: PropsDialogoEliminar) {
  const aviso = useAviso()

  if (espacio === null) return null

  async function eliminar (): Promise<void> {
    if (espacio === null) return

    const resultado = await escribirEnBff(`projects/${espacio.id}`, 'DELETE')

    if (!resultado.ok) throw new Error(resultado.mensaje)

    aviso.exito(`«${espacio.name}» se envió a la papelera.`)
    onEliminado()
  }

  return (
    <ConfirmarBorrado
      abierto
      onCerrar={onCerrar}
      tamano="chico"
      titulo={`Eliminar ${tipo.toLowerCase()}`}
      advertencia={`«${espacio.name}» va a la papelera junto con sus ${GLOSARIO.proceso.plural.toLowerCase()}, ${GLOSARIO.hito.plural.toLowerCase()} y horas registradas. Se puede restaurar entero desde la Papelera durante 30 días.`}
      onConfirmar={eliminar}
    />
  )
}
