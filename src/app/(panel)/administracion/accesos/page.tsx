import { redirect } from 'next/navigation'

/**
 * Accesos se unificó con el organigrama en Organización (`/equipo/jerarquia`).
 *
 * La ruta queda para no romper enlaces guardados y lleva a la pestaña que más se parece a la vieja.
 */
export default function AccesosPage (): never {
  redirect('/equipo/jerarquia?tab=personas')
}
