import { Organigrama } from '@/componentes/organigrama/Organigrama'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { cargarCatalogosDeTareas } from '@/datos/lookups'
import { cargarOrganigrama } from '@/datos/organigrama-servidor'

export const metadata = { title: 'Jerarquías · WiWO Ops' }

/**
 * Jerarquías: el organigrama de la casa entera, para administración.
 *
 * **Monta el mismo componente que `/equipo/mi-area`**, sin una sola variante por ruta. La diferencia
 * entre las dos pantallas no la pone el frontend: `GET /organigrama` le manda la casa completa a
 * `admin` y a `superadmin`, y a cualquier otra persona sólo su parte. Replicar acá esa regla sería
 * una segunda copia que puede quedar desincronizada de la que manda.
 *
 * **Sin compuerta por rol acá tampoco, a propósito.** La de verdad la pone la API. Y la barra
 * lateral ya esconde la entrada a quien no administra, que es cosmética: esconder no autoriza.
 *
 * El organigrama se resuelve en el servidor para que la pantalla no parpadee al montar; de ahí en
 * adelante cada reasignación lo vuelve a pedir, porque mover a alguien cambia las cuentas de dos
 * tarjetas del mapa y recalcularlas en el navegador sería una segunda copia de lo que cuenta la API.
 */
export default async function JerarquiaPage () {
  const [cargado, catalogos] = await Promise.all([cargarOrganigrama(), cargarCatalogosDeTareas()])

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Jerarquías"
        descripcion="El organigrama del equipo: un mapa con todas las áreas y, al entrar en una, el árbol de quién depende de quién. El color del borde de cada caja es su área, así que quien cuelga de un jefe de otra área se ve de inmediato."
      />

      {cargado instanceof ErrorApi
        ? cargado.codigo === 'forbidden'
          ? <SinPermiso />
          : <ErrorEstado detalle={cargado.message} />
        : <Organigrama inicial={cargado} catalogos={catalogos} />}
    </section>
  )
}
