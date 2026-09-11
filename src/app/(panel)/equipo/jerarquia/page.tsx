import { Jerarquia } from '@/componentes/equipo/Jerarquia'
import { ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { Jerarquia as ArbolDeJerarquia } from '@/datos/jerarquia'

export const metadata = { title: 'Jerarquías · WiWO Ops' }

/**
 * Jerarquías del equipo: el árbol de áreas y el reparto de la gente.
 *
 * Existe por una consecuencia concreta: la visibilidad de «En vivo» se hereda por el árbol de áreas,
 * y hasta que no esté cargado cada persona se ve únicamente a sí misma. Hoy las 184 cuentas de la
 * instalación tienen el área en blanco, ninguna área cuelga de otra y ninguna tiene jefatura, así que
 * el recorte no recorta y ninguna jefatura ve a nadie. Cargarlo era un `UPDATE` a mano o el catálogo
 * del panel viejo, que es sólo para administradores.
 *
 * **Sin compuerta por rol acá, a propósito.** La de verdad la pone `GET /jerarquia`, que responde 403
 * a quien no dirige ningún área y no administra; repetir el criterio en el servidor de Next sería una
 * segunda copia que puede quedar desincronizada de la que manda. Y no alcanzaría con `permissions`:
 * dirigir un área no otorga capabilities de Perfex, igual que el cargo Director
 * (`modules/wiwo_core/cargos_areas.php`), así que `staff.view` no delata a una jefatura.
 *
 * El 403 se muestra con **el mensaje que manda la API**, que viene redactado para leerse, y no con el
 * `SinPermiso` genérico: acá "no tenés permiso" sería engañoso — no es un permiso que falte, es que
 * no hay organigrama que mostrarle a quien no dirige nada.
 *
 * El árbol se resuelve en el servidor para que la pantalla no parpadee al montar; de ahí en adelante
 * cada escritura devuelve el árbol entero y el componente reemplaza el que tenía.
 */
export default async function JerarquiaPage () {
  const cargado = await cargar()

  return (
    <section className="flex flex-col gap-4">
      {/* El título va también en los dos caminos sin datos: quien recibe el 403 tiene que saber en
          qué pantalla está, y la bajada le explica justamente por qué no ve nada. */}
      <TituloModulo
        titulo="Jerarquías"
        descripcion="El árbol de dependencias del equipo: de qué área cuelga cada una, quién la dirige y quién está en ella. Quien dirige un área ve en «En vivo» a su gente y a la de todas las que cuelgan de la suya; quien no dirige nada se ve solo a sí mismo."
      />

      {cargado instanceof ErrorApi
        ? cargado.codigo === 'forbidden'
          ? <Vacio titulo="No hay organigrama para vos" descripcion={cargado.message} />
          : <ErrorEstado detalle={cargado.message} />
        : <Jerarquia inicial={cargado} />}
    </section>
  )
}

/**
 * Trae el árbol, o el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`: React no renderiza el JSX en el
 * momento en que se lee, así que un error de render ahí no lo atraparía el `catch` — y el lint del
 * proyecto lo rechaza. Acá el `try` solo espera.
 */
async function cargar (): Promise<ArbolDeJerarquia | ErrorApi> {
  try {
    const { data } = await pedir<ArbolDeJerarquia>('/jerarquia')

    return data
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}
