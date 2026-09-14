import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Cargando } from '@/componentes/estado/Estados'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Lo que ocupa la pantalla mientras el servidor arma la cartera del Focal.
 *
 * Repite el encabezado de la página real porque el título es lo único que se sabe sin esperar al
 * servidor: confirma a dónde se entró, y evita que al llegar los datos el encabezado aparezca de
 * golpe y corra todo hacia abajo.
 *
 * @returns el encabezado de la sección y la ventana que reserva el lugar de la lista
 */
export default function CargandoFocals () {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo={GLOSARIO.focal.plural} />
      <Cargando mensaje="Cargando tus cuentas…" />
    </section>
  )
}
