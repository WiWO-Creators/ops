import { Organigrama } from '@/componentes/organigrama/Organigrama'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { cargarCatalogosDeTareas } from '@/datos/lookups'
import { cargarOrganigrama } from '@/datos/organigrama-servidor'

export const metadata = { title: 'Mi Área · WiWO Ops' }

/**
 * "Mi Área": el organigrama, recortado a lo que esta persona puede ver.
 *
 * **Es el mismo componente que `/equipo/jerarquia`**, y a propósito: dos copias del mismo dibujo es
 * la clase de duplicación que termina mostrando dos organigramas distintos. Lo único que cambia
 * entre las dos pantallas es lo que `GET /organigrama` manda, porque es la API la que recorta.
 *
 * El recorte de acá es la unión de cinco cosas —ella misma, su cadena hacia arriba, su rama hacia
 * abajo, las áreas que dirige alguien de su rama y su propia área con todas sus ramas—, y está
 * descrito en `contrato-organigrama.md`. Es deliberadamente más permisivo que el alcance de datos:
 * **ver el organigrama no otorga acceso a los datos de nadie**, y un organigrama que esconde media
 * casa no sirve para orientarse.
 *
 * Sin compuerta por rol acá: la pantalla es para todo el mundo, porque todo el mundo tiene al menos
 * su propia caja y la de sus jefes. Reasignar, en cambio, exige `yo.puede_editar`, que lo resuelve
 * la API y el componente respeta.
 */
export default async function MiAreaPage () {
  const [cargado, catalogos] = await Promise.all([cargarOrganigrama(), cargarCatalogosDeTareas()])

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Mi Área"
        descripcion="Tu organigrama: las áreas que alcanzas, quién las dirige y de quién cuelga cada persona. Entra en un área para ver su árbol."
      />

      {cargado instanceof ErrorApi
        ? cargado.codigo === 'forbidden'
          ? <SinPermiso />
          : <ErrorEstado detalle={cargado.message} />
        : <Organigrama inicial={cargado} catalogos={catalogos} />}
    </section>
  )
}
