import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Cargando } from '@/componentes/estado/Estados'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Lo que ocupa la pantalla mientras el servidor arma la hoja diaria.
 *
 * Sin este archivo la navegación dejaba congelada la pantalla anterior hasta que respondía el
 * servidor. Repite el encabezado de la página real para confirmar a dónde se entró.
 *
 * @returns el encabezado de la sección y la ventana que reserva el lugar de la lista
 */
export default function CargandoMisTareas () {
  const titulo = `Mis ${GLOSARIO.proceso.plural}`

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo={titulo} />
      <Cargando mensaje={`Cargando ${titulo.toLowerCase()}…`} />
    </section>
  )
}
