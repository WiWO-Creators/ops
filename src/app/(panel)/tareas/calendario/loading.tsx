import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Cargando } from '@/componentes/estado/Estados'
import { PROCESOS } from '@/definiciones/procesos'

/**
 * Espera del calendario, con su propio título: sin este archivo mandaba el `loading.tsx` de `/tareas`,
 * que dice "Cargando tareas…" con el encabezado de la lista.
 *
 * @returns el encabezado del calendario y la ventana que reserva su lugar
 */
export default function CargandoCalendario () {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo={`Calendario de ${PROCESOS.titulo.plural}`} />
      <Cargando mensaje="Cargando el calendario…" />
    </section>
  )
}
