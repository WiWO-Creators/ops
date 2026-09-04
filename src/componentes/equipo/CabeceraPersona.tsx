import Link from 'next/link'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { FichaPersona } from '@/datos/recursos'

/**
 * Cabecera del detalle de una persona: quien es, que rol tiene y como se la contacta.
 *
 * El foco es el nombre, y el resto —correo, telefono, rol, ultimo acceso— es una linea de apoyo en
 * tono tenue, igual que en el detalle de Cliente. Los numeros de su trabajo no van aca: viven en las
 * metricas de la ficha, donde se comparan entre si.
 *
 * Las tres insignias solo aparecen cuando dicen algo. "Activo" se muestra siempre porque una cuenta
 * dada de baja se tiene que reconocer sin leer; "Administrador" y "No es del equipo" son excepciones,
 * y una insignia que dice lo normal deja de avisar cuando pasa lo raro.
 *
 * @param persona La ficha ya cargada.
 * @returns El bloque superior de la pantalla.
 */
export function CabeceraPersona ({ persona }: { persona: FichaPersona }) {
  return (
    <header className="flex flex-col gap-3">
      <Link
        href="/equipo"
        className="text-texto-sutil hover:text-texto w-fit text-xs font-medium transition-colors"
      >
        ← Equipo
      </Link>

      <div className="flex flex-wrap items-start gap-3">
        <Avatar nombre={persona.full_name} imagen={persona.profile_image_url} tamano="grande" />

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-texto text-seccion leading-tight font-semibold">{persona.full_name}</h1>
            <Insignia tono={persona.active ? 'exito' : 'neutro'}>
              {persona.active ? 'Activa' : 'Dada de baja'}
            </Insignia>
            {persona.is_superadmin
              ? <Insignia tono="acento">Superadministrador</Insignia>
              : persona.is_admin && <Insignia tono="acento">Administrador</Insignia>}
            {persona.is_director && <Insignia tono="acento">Director</Insignia>}
            {persona.is_not_staff && <Insignia tono="contorno">No es del equipo</Insignia>}
          </div>

          <dl className="text-texto-tenue flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <DatoLinea
              etiqueta="Correo"
              valor={
                <a href={`mailto:${persona.email}`} className="hover:text-texto">{persona.email}</a>
              }
            />
            {persona.phonenumber !== null && (
              <DatoLinea
                etiqueta="Teléfono"
                valor={
                  <a href={`tel:${persona.phonenumber}`} className="hover:text-texto">{persona.phonenumber}</a>
                }
              />
            )}
            <DatoLinea etiqueta="Rol" valor={persona.role?.name ?? 'Sin rol'} />
            <DatoLinea etiqueta="Área" valor={persona.area?.name ?? 'Sin área'} />
            <DatoLinea
              etiqueta="Último acceso"
              valor={persona.last_login === null ? 'Nunca' : <Fecha valor={persona.last_login} conHora />}
            />
          </dl>
        </div>
      </div>
    </header>
  )
}

/** Un par rotulo/valor de la linea de apoyo. El rotulo va en versalita para no competir con el dato. */
function DatoLinea ({ etiqueta, valor }: { etiqueta: string, valor: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-texto-sutil text-xs tracking-[0.06em] uppercase">{etiqueta}</dt>
      <dd className="text-texto">{valor}</dd>
    </div>
  )
}
