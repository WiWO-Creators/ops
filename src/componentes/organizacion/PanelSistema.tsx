'use client'

import { Cargando } from '@/componentes/estado/Estados'
import { ESCALONES } from '@/dominio/escalon'
import { CabeceraDePanel } from './piezas'
import { PanelInterruptores } from './PanelInterruptores'
import type { CatalogoDeAccesos, PersonaDeAccesos } from '@/datos/accesos'

interface PropsPanelSistema {
  catalogo: CatalogoDeAccesos
  personas: PersonaDeAccesos[] | null
  onElegir: (persona: PersonaDeAccesos) => void
  recargar: () => void
}

/**
 * Lo que es de toda la instalación y no de una persona: los escalones, quién tiene cada rol de
 * sistema y el interruptor de la jerarquía.
 *
 * Los roles se listan acá porque "¿quiénes son superadministradores?" es una pregunta de auditoría que
 * antes obligaba a abrir ficha por ficha. Cada nombre abre el panel de la persona, que es donde se
 * cambia.
 */
export function PanelSistema ({ catalogo, personas, onElegir, recargar }: PropsPanelSistema) {
  const personasPorEscalon = new Map(catalogo.escalones.map((escalon) => [escalon.clave, escalon.personas]))
  const activas = personas?.filter((persona) => persona.activo) ?? null

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <CabeceraDePanel
          titulo="Roles de sistema"
          descripcion="Quién ve y edita todo, y quién solo lee toda la casa. Haz clic en alguien para cambiarle el rol."
        />
        {activas === null
          ? <Cargando alto="min-h-24" mensaje="Cargando las personas…" />
          : (
            <div className="grid gap-4 md:grid-cols-3">
              <ListaDeRol
                titulo="Superadministradores"
                ayuda="Todo, y además la configuración de la instalación."
                personas={activas.filter((persona) => persona.is_superadmin)}
                onElegir={onElegir}
              />
              <ListaDeRol
                titulo="Administradores"
                ayuda="Ven y editan todas las filas."
                personas={activas.filter((persona) => persona.is_admin && !persona.is_superadmin)}
                onElegir={onElegir}
              />
              <ListaDeRol
                titulo="Coordinan varias áreas"
                ayuda="Leen toda la casa; editan solo lo suyo."
                personas={activas.filter((persona) => persona.coordinador_multiarea)}
                onElegir={onElegir}
              />
            </div>
            )}
      </section>

      <section className="flex flex-col gap-4">
        <CabeceraDePanel
          titulo="Escalones"
          descripcion="Los cuatro puestos de la escalera. Son fijos y no otorgan nada por sí solos: lo que alguien ve sale del árbol."
        />
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ESCALONES.map((escalon) => (
            <div key={escalon.clave} className="border-linea rounded-tarjeta flex flex-col gap-1 border p-3">
              <dt className="text-texto flex items-baseline justify-between gap-2 text-sm font-medium">
                {escalon.nombre}
                <span className="font-titular text-texto-tenue tabular-nums">{personasPorEscalon.get(escalon.clave) ?? 0}</span>
              </dt>
              <dd className="text-texto-tenue text-xs">{escalon.ayuda}</dd>
            </div>
          ))}
        </dl>
      </section>

      <PanelInterruptores catalogo={catalogo} recargar={recargar} />
    </div>
  )
}

/** Las personas con un rol, cada una como botón que abre su panel. */
function ListaDeRol ({
  titulo, ayuda, personas, onElegir
}: {
  titulo: string
  ayuda: string
  personas: PersonaDeAccesos[]
  onElegir: (persona: PersonaDeAccesos) => void
}) {
  return (
    <div className="border-linea rounded-tarjeta flex flex-col gap-2 border p-3">
      <div>
        <p className="text-texto flex items-baseline justify-between text-sm font-medium">
          {titulo}
          <span className="font-titular text-texto-tenue tabular-nums">{personas.length}</span>
        </p>
        <p className="text-texto-tenue text-xs">{ayuda}</p>
      </div>
      {personas.length === 0
        ? <p className="text-texto-sutil text-sm">Nadie.</p>
        : (
          <ul className="flex flex-col">
            {personas.map((persona) => (
              <li key={persona.staffid}>
                <button
                  type="button"
                  className="hover:bg-hover rounded-control text-texto w-full px-2 py-1 text-left text-sm"
                  onClick={() => { onElegir(persona) }}
                >
                  {persona.nombre}
                </button>
              </li>
            ))}
          </ul>
          )}
    </div>
  )
}
