import { Cargando } from '@/componentes/estado/Estados'
import { PROSPECTOS } from '@/definiciones/prospectos'

/**
 * Lo que ocupa la pantalla mientras el servidor arma la lista de prospectos.
 *
 * Repite el encabezado de la pagina real porque el titulo es lo unico que se sabe sin esperar al
 * servidor: confirma a donde se entro, y evita que al llegar los datos el encabezado aparezca de
 * golpe y corra todo hacia abajo.
 *
 * @returns el encabezado de la seccion y la ventana que reserva el lugar de la lista
 */
export default function CargandoProspectos () {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-texto">{PROSPECTOS.titulo.plural}</h1>
      <Cargando mensaje="Cargando prospectos…" />
    </section>
  )
}
