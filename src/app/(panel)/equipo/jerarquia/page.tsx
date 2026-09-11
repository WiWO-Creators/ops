import { Jerarquia } from '@/componentes/equipo/Jerarquia'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { ArbolDeJerarquia } from '@/datos/jerarquia'

export const metadata = { title: 'Jerarquías · WiWO Ops' }

/**
 * Jerarquías del equipo: quién depende de quién.
 *
 * Sin compuerta por rol acá a propósito. La de verdad la pone `GET /jerarquia`, que responde 403 a
 * quien no dirige ningún área y no administra; repetir el criterio en el servidor de Next sería una
 * segunda copia que puede quedar desincronizada de la que manda. Y no alcanzaría con `permissions`:
 * dirigir un área no otorga capabilities de Perfex, igual que el cargo Director
 * (`modules/wiwo_core/cargos_areas.php`), así que `staff.view` no delata a una jefatura.
 *
 * El árbol se resuelve en el servidor para que la pantalla no parpadee al montar; de ahí en adelante
 * cada escritura devuelve el árbol entero y el componente reemplaza el que tenía.
 */
export default async function JerarquiaPage () {
  let arbol: ArbolDeJerarquia

  try {
    const { data } = await pedir<ArbolDeJerarquia>('/jerarquia')
    arbol = data
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error
    if (error.codigo === 'forbidden') return <SinPermiso />

    return <ErrorEstado detalle={error.message} />
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <TituloModulo
        titulo="Jerarquías"
        descripcion="El árbol de dependencias del equipo: de qué área cuelga cada una, quién la dirige y quién está en ella. Es lo que decide a quién ve cada jefatura en En Vivo."
      />

      <Jerarquia inicial={arbol} />
    </section>
  )
}
