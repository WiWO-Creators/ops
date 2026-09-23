import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { EsqueletoRecurrentes } from '@/componentes/recurrencia/EsqueletoRecurrentes'

/**
 * Lo que se ve mientras el servidor trae los catalogos de la pantalla.
 *
 * Repite el encabezado de la pagina real y pone el esqueleto de la lista en su lugar: sin este
 * archivo mandaria el `loading.tsx` de `/procesos`, que dice "Cargando tareas…" con el titulo de otra
 * pantalla.
 *
 * @returns el encabezado y las filas de espera
 */
export default function CargandoRecurrentes () {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo="Tareas recurrentes" />
      <EsqueletoRecurrentes />
    </section>
  )
}
