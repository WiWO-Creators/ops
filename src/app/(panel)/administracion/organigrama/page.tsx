import { Organigrama } from '@/componentes/administracion/Organigrama'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'

export const metadata = { title: 'Organigrama · WiWO Ops' }

/**
 * Organigrama: el árbol de áreas del equipo y el reparto de la gente.
 *
 * Existe por una consecuencia concreta: la visibilidad de «En vivo» se hereda por el árbol de áreas,
 * y hasta que las áreas no estén cargadas cada persona se ve únicamente a sí misma. Las 184 cuentas
 * de la instalación tienen el área en blanco y no había ninguna pantalla donde armar la estructura.
 *
 * Toda la pantalla es cliente y no un Server Component con `router.refresh()`: las operaciones tocan
 * el mismo dato —crear un área cambia las opciones de "de qué área cuelga", mover a alguien lo saca
 * de una lista y lo pone en otra— y repintar la ruta entera por cada clic sería una navegación. Acá
 * lo único que se vuelve a pedir es `GET /jerarquia`, que trae todo de una vez.
 *
 * **Quién entra lo decide la API, no esta página.** `GET /jerarquia` responde a quien administra con
 * el organigrama entero y a quien dirige un área con su rama; a quien no dirige nada le contesta 403
 * con un mensaje ya redactado, que la pantalla muestra tal cual. Por eso acá no hay compuerta por
 * `is_superadmin` como en el resto de Administración: cerrarla así dejaría afuera a los directores,
 * que son justamente quienes más van a usarla.
 */
export default function OrganigramaPage () {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Organigrama"
        descripcion="Quien dirige un área ve en «En vivo» a su gente y a la de todas las áreas que cuelgan de la suya; quien no dirige nada se ve solo a sí mismo."
      />

      <Organigrama />
    </section>
  )
}
