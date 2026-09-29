import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Cargando } from '@/componentes/estado/Estados'
import { CONTRATOS } from '@/definiciones/contratos'

/**
 * Lo que ocupa la pantalla mientras el servidor arma la lista de contratos. Repite el encabezado
 * real para que al llegar los datos nada salte.
 *
 * @returns el encabezado de la seccion y la ventana que reserva el lugar de la lista
 */
export default function CargandoContratos () {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo={CONTRATOS.titulo.plural} />
      <Cargando mensaje="Cargando contratos…" />
    </section>
  )
}
