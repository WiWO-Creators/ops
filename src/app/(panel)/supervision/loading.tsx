import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Cargando } from '@/componentes/estado/Estados'

/**
 * Lo que ocupa la pantalla mientras el servidor arma la hoja del día.
 *
 * Repite el título de la página real: confirma a dónde se entró y evita que el encabezado aparezca
 * de golpe al llegar los datos.
 *
 * @returns el encabezado y la ventana que reserva el lugar de la hoja
 */
export default function CargandoSupervision () {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo="Supervisión" />
      <Cargando mensaje="Cargando la hoja del día…" />
    </section>
  )
}
