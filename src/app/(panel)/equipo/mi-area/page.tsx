import Link from 'next/link'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
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
 * Solo lectura: reasignar el área de alguien se hace desde `/equipo/jerarquia`, que ya replica lo que
 * el panel viejo dejaba hacer a un Director sin `staff.edit` (`Mi_area.php::add_staff()`) y además
 * deja acomodar el árbol de dependencias entero. El enlace está arriba.
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
      <TituloModulo
        titulo="Mi Área"
        acciones={
          <div className="flex items-center gap-3">
            {/* Desde acá se arregla lo que esta pantalla sólo muestra: quién está en el área y de
                quién depende. Antes eso era un `UPDATE` a mano o el catálogo del panel viejo. */}
            <Link href="/equipo/jerarquia" className="text-acento text-sm font-semibold hover:underline">
              Configurar jerarquías
            </Link>
            {miArea.area !== null && <Insignia tono="acento">{miArea.area.name}</Insignia>}
          </div>
        }
      />

      {/* La única puerta al organigrama para quien dirige un área sin administrar la instalación: la
          pantalla vive bajo `/administracion`, que la barra lateral solo le muestra a un
          superadministrador. La API ya deja entrar a los directores —`GET /jerarquia` les sirve su
          rama—, así que lo único que faltaba era el enlace. */}
      <Link
        href="/administracion/organigrama"
        className="text-acento text-sm font-semibold underline underline-offset-4"
      >
        Organigrama: armá tu rama y repartí a tu gente entre las áreas
      </Link>

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
