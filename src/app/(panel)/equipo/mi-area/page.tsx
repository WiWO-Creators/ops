import Link from 'next/link'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { MiArea } from '@/datos/recursos'

export const metadata = { title: 'Mi Área · WiWO Ops' }

/**
 * "Mi Área": a quién dirige un Director, agrupado bajo su propia área.
 *
 * Espejo de `modules/wiwo_core/controllers/Mi_area.php` en ops-v2. `GET /me/mi-area` no exige
 * `staff.view` —el cargo Director no otorga capabilities (`wiwo_core/cargos_areas.php`)—, asi que
 * esta pantalla no depende de `permissions.staff` para mostrarse: la barra lateral ya la esconde de
 * quien no tiene el cargo (`(panel)/layout.tsx`), y el `403` de la API es la misma red por si alguien
 * entra por la URL directa despues de perder el cargo.
 *
 * Solo lectura: reasignar el área de alguien se hace desde su ficha en `/equipo/{id}`, con el mismo
 * formulario que usa cualquiera con `staff.edit`. El panel viejo deja que un Director sume gente a su
 * área sin ese permiso (`Mi_area.php::add_staff()`); esta pantalla no lo replica todavía porque la
 * API no tiene ese endpoint.
 */
export default async function MiAreaPage () {
  let miArea: MiArea

  try {
    const { data } = await pedir<MiArea>('/me/mi-area')
    miArea = data
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error
    if (error.codigo === 'forbidden') return <SinPermiso />

    return <ErrorEstado detalle={error.message} />
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-texto">Mi Área</h1>
        {miArea.area !== null && <Insignia tono="acento">{miArea.area.name}</Insignia>}
      </div>

      {miArea.area === null && (
        <Vacio
          titulo="No tienes un área asignada"
          descripcion="Pídele a quien administre el sistema que te asigne una desde Cargos y Áreas."
        />
      )}

      {miArea.area !== null && miArea.area_staff.length === 0 && (
        <Vacio
          titulo="Todavía no hay nadie en tu área"
          descripcion={`Nadie tiene "${miArea.area.name}" como área asignada.`}
        />
      )}

      {miArea.area !== null && miArea.area_staff.length > 0 && (
        <ul className="border-linea-suave divide-linea-suave rounded-tarjeta flex flex-col divide-y border">
          {miArea.area_staff.map((persona) => (
            <li key={persona.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar nombre={persona.full_name} imagen={persona.profile_image_url} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/equipo/${persona.id}`}
                  className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                >
                  {persona.full_name}
                </Link>
                <p className="text-texto-tenue truncate text-xs">{persona.email}</p>
              </div>
              {persona.is_director && <Insignia tono="acento">Director</Insignia>}
              {!persona.active && <Insignia tono="neutro">Dada de baja</Insignia>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
