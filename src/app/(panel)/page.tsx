import { pedir } from '@/datos/servidor'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { Vacio } from '@/componentes/estado/Estados'

/**
 * Inicio del panel.
 *
 * Cimientos: confirma que la sesion sirve y que la API responde con datos reales. "Mis Procesos"
 * agrupados por vencimiento llega con el modulo Mi trabajo.
 */
export default async function InicioPage () {
  const { data: yo } = await pedir<Yo>('/me')

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-texto">Hola, {yo.firstname}</h1>
        <p className="mt-1 text-sm text-texto-tenue">
          Sesión activa contra la API del board.
        </p>
      </header>

      <Vacio
        titulo={`Todavía no hay ${GLOSARIO.proceso.plural.toLowerCase()} acá`}
        descripcion="Esta pantalla se llena con el módulo Mi trabajo."
      />
    </section>
  )
}
