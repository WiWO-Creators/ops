import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import type { MiembroEquipo } from '@/datos/recursos'

/**
 * Equipo asignado al Proyecto.
 *
 * @param miembros staff completo devuelto por `/projects/{id}/members`
 * @returns la lista, o el estado vacio si nadie esta asignado
 */
export function ListaMiembros ({ miembros }: { miembros: MiembroEquipo[] }) {
  if (miembros.length === 0) {
    return (
      <Vacio
        titulo="Sin equipo asignado"
        descripcion="Nadie del equipo figura en este proyecto todavía. Se asigna desde el panel."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {miembros.map((miembro) => (
        <li
          key={miembro.id}
          className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex items-center gap-3 border p-3"
        >
          <Avatar nombre={miembro.full_name} imagen={miembro.profile_image_url} />

          <span className="flex min-w-0 flex-col">
            <span className="text-texto truncate text-sm font-medium">{miembro.full_name}</span>
            <span className="text-texto-tenue truncate text-xs">{miembro.email}</span>
          </span>

          {miembro.is_admin && <Insignia tamano="chico" tono="acento" className="ml-auto">Administra</Insignia>}
        </li>
      ))}
    </ul>
  )
}
