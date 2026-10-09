import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Cargando } from '@/componentes/estado/Estados'
import { FUSIONES } from '@/definiciones/fusion'

/**
 * Lo que ocupa la pantalla mientras el servidor arma el historial: el encabezado, que es lo unico que
 * se sabe sin esperar, y la ventana que reserva el lugar de la lista.
 */
export default function CargandoFusiones () {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo={FUSIONES.titulo.plural} />
      <Cargando mensaje="Cargando las fusiones…" />
    </section>
  )
}
