import { Cargando } from '@/componentes/estado/Estados'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * La ficha pública mientras la API contesta: el mismo `<main>` que la página, con la ventana de
 * carga en el lugar del contenido. Sin esto, quien abre el enlace ve la pantalla en blanco hasta
 * que llega todo de golpe.
 */
export default function CargandoFichaPublicaDeTarea () {
  return (
    <main className="bg-superficie mx-auto flex min-h-dvh max-w-2xl flex-col p-6">
      <Cargando alto="min-h-[60dvh]" mensaje={`Cargando la ${GLOSARIO.proceso.singular.toLowerCase()}…`} />
    </main>
  )
}
