import { Cargando } from '@/componentes/estado/Estados'

/**
 * Lo que ocupa la pantalla mientras el servidor arma la auditoría.
 *
 * El encabezado se pinta ya: es lo único que no depende de ninguna de las cinco llamadas, y dejarlo
 * fijo evita que la pantalla salte cuando llegan los datos.
 */
export default function CargandoAuditoria () {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-texto text-xl font-semibold">Auditoría</h1>
      <Cargando mensaje="Cargando la actividad del equipo…" />
    </section>
  )
}
