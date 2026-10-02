'use client'

import { ConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import type { AccionDeBorrado } from '@/componentes/datos/MenuAccionesFila'
import { useAviso } from '@/componentes/estado/useAviso'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { Espacio } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'

type ProyectoABorrar = Pick<Espacio, 'id' | 'name'>

interface PropsDialogoEliminar {
  /** Proyecto a eliminar, o `null` cuando el dialogo esta cerrado. */
  espacio: ProyectoABorrar | null
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

  return (
    <ConfirmarBorrado
      abierto
      onCerrar={onCerrar}
      tamano="chico"
      titulo={tituloDeBorrado(tipo)}
      advertencia={advertenciaDeBorrado(espacio)}
      onConfirmar={async () => { await enviarAPapelera(espacio, aviso.exito); onEliminado() }}
    />
  )
}

/**
 * El mismo borrado de `DialogoEliminarProyecto`, como contrato del menu ⋯ de una ficha.
 *
 * @param espacio el Proyecto (o la Licitacion, o el Upsell) que se borra
 * @param onEliminado que hacer despues de mandarlo a la papelera
 * @param tipo como se nombra en el titulo; por defecto, Proyecto
 * @returns el borrado para `MenuAccionesFila`
 */
export function useBorradoDeProyecto (
  espacio: ProyectoABorrar,
  onEliminado: () => void,
  tipo: string = GLOSARIO.espacio.singular
): AccionDeBorrado {
  const aviso = useAviso()

  return {
    titulo: tituloDeBorrado(tipo),
    tamano: 'chico',
    advertencia: advertenciaDeBorrado(espacio),
    onConfirmar: async () => { await enviarAPapelera(espacio, aviso.exito); onEliminado() }
  }
}

function tituloDeBorrado (tipo: string): string {
  return `Eliminar ${tipo.toLowerCase()}`
}

function advertenciaDeBorrado (espacio: ProyectoABorrar): string {
  return `«${espacio.name}» va a la papelera junto con sus ${GLOSARIO.proceso.plural.toLowerCase()}, ${GLOSARIO.hito.plural.toLowerCase()} y horas registradas. Se puede restaurar entero desde la Papelera durante 30 días.`
}

/**
 * Manda el Proyecto a la papelera y lo avisa.
 *
 * @param espacio el Proyecto
 * @param avisar muestra el aviso de exito
 * @throws {Error} con el mensaje de la API si falla: `ConfirmarBorrado` lo muestra y no se cierra
 */
async function enviarAPapelera (espacio: ProyectoABorrar, avisar: (mensaje: string) => void): Promise<void> {
  const resultado = await escribirEnBff(`projects/${espacio.id}`, 'DELETE')

  if (!resultado.ok) throw new Error(resultado.mensaje)

  avisar(`«${espacio.name}» se envió a la papelera.`)
}
