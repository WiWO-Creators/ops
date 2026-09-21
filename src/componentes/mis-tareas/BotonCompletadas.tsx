'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { alternarCompletadas, seVenCompletadas } from '@/dominio/mis-tareas'

/**
 * Suma las Tareas ya completadas a las dos listas de la hoja, o las vuelve a esconder.
 *
 * Es el hermano de `BotonCompletados` de `/procesos` —mismo control, mismo `aria-pressed`, mismo
 * estado en la URL para que sobreviva al refresco y se pueda compartir—, con la diferencia que le da
 * sentido aca: alla el boton deja ver SOLO las completadas, y aca las agrega a las abiertas. Una
 * Tarea cerrada por error se corrige en la fila donde estaba, que es lo que el interruptor vino a
 * resolver; separarlas en dos vistas obligaria a saber de antemano en cual quedo.
 *
 * `replace` y no `push`: encender y apagar un filtro no son pasos de una navegacion, y con `push`
 * el boton "Atras" del navegador tendria que deshacer un clic a la vez antes de salir de la hoja.
 *
 * @returns El interruptor, listo para el encabezado de la pantalla.
 */
export function BotonCompletadas () {
  const router = useRouter()
  const params = useSearchParams()
  const activo = seVenCompletadas(params)

  return (
    <Boton
      aria-pressed={activo}
      variante={activo ? 'marca' : 'secundario'}
      onClick={() => {
        const siguientes = alternarCompletadas(new URLSearchParams(params.toString()))

        router.replace(`?${siguientes.toString()}`, { scroll: false })
      }}
    >
      Ver completadas
    </Boton>
  )
}
