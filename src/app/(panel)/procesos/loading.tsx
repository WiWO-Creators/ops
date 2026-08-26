import { Cargando } from '@/componentes/estado/Estados'
import { PROCESOS } from '@/definiciones/procesos'

/**
 * Lo que ocupa la pantalla mientras el servidor arma la lista de los procesos.
 *
 * Es el caso de "todavia no hay nada pintado", y por eso le toca la ventana con orbe y no el chip:
 * el chip existe para no tapar contenido que ya esta en pantalla, y aca no hay ninguno.
 *
 * Repite el encabezado de la pagina real porque el titulo es lo unico que se sabe sin esperar al
 * servidor: confirma a donde se entro, y evita que al llegar los datos el encabezado aparezca de
 * golpe y corra todo hacia abajo.
 *
 * @returns el encabezado de la seccion y la ventana que reserva el lugar de la lista
 */
export default function CargandoProcesos () {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-texto">{PROCESOS.titulo.plural}</h1>
      <Cargando mensaje={`Cargando ${PROCESOS.titulo.plural.toLowerCase()}…`} />
    </section>
  )
}
