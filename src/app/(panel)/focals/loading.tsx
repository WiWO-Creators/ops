import { Hueso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { descripcionDeFocals } from '@/dominio/cartera'
import { GLOSARIO } from '@/dominio/glosario'

/** Cuántas filas de cuenta dibuja el esqueleto: las que caben en una pantalla sin llegar a ser una cartera inventada. */
const FILAS_DE_ESQUELETO = 5

/** Cuántas fichas del resumen dibuja el esqueleto: "Todas" y los cuatro tramos. */
const FICHAS_DE_ESQUELETO = 5

/**
 * Lo que ocupa la pantalla mientras el servidor arma la cartera del Focal.
 *
 * Repite el encabezado de la página real, con su descripción, porque son lo único que se sabe sin
 * esperar al servidor: confirman a dónde se entró y evitan que al llegar los datos el encabezado
 * crezca de golpe y corra todo hacia abajo. Todavía no se sabe si la persona ve su cartera o la
 * entera, así que la descripción es la neutra, que termina igual que las dos reales.
 *
 * Debajo, el esqueleto tiene la forma de la lista —fichas, buscador y filas de cuenta— en vez de un
 * orbe: la pantalla ya tiene su forma y lo que llega es su contenido. El texto es solo para lectores
 * de pantalla; a la vista, el esqueleto lo dice solo.
 *
 * @returns el encabezado de la sección y el esqueleto que reserva el lugar de la lista
 */
export default function CargandoFocals () {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo={GLOSARIO.focal.plural} descripcion={descripcionDeFocals(null)} />

      <div role="status" aria-busy="true" aria-live="polite" className="flex max-w-5xl flex-col gap-4">
        <span className="sr-only">Cargando la cartera…</span>

        <div className="flex flex-wrap gap-2">
          {Array.from({ length: FICHAS_DE_ESQUELETO }, (_, indice) => (
            <Hueso key={indice} className="rounded-tarjeta h-9 w-28" />
          ))}
        </div>

        <Hueso className="rounded-chico h-9 w-full sm:w-72" />

        <ul className="flex flex-col gap-2">
          {Array.from({ length: FILAS_DE_ESQUELETO }, (_, indice) => (
            <li
              key={indice}
              className="border-linea bg-superficie-elevada rounded-tarjeta flex items-center gap-3 border p-3"
            >
              <Hueso className="h-6 w-10 shrink-0" />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <Hueso className="h-4 w-2/5" />
                <Hueso className="h-3 w-3/5" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
