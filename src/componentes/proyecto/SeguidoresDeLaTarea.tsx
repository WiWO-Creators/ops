'use client'

import { useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Interruptor } from '@/componentes/formularios/Interruptor'
import { GrupoEnlacesPersona } from '@/componentes/presentadores/GrupoEnlacesPersona'
import { useRecurso } from './carga'
import {
  contactosQueSiguen,
  rutaDeSeguidoresDeContacto,
  rutaDeUnSeguidorDeContacto,
  type ContactoSeguidor,
  type SeguidoresDeContacto,
  type SujetoDeSeguidores
} from './entrega-final'

interface PropsSeguidoresDeLaTarea {
  tareaId: number
  /** Los seguidores del equipo (staff), si el contrato los manda. Ausente: esa mitad no se dibuja. */
  equipo?: { id: number, full_name: string, profile_image_url?: string | null }[]
  /** Quien mira: decide la ruta de la API. En el portal el contacto gestiona su propio seguimiento. */
  sujeto: SujetoDeSeguidores
}

/**
 * Quién sigue la Tarea: el equipo y los contactos del cliente, juntos.
 *
 * Los seguidores de Perfex son solo staff. Los del lado del cliente son **contactos**, una relación
 * propia que la API siembra al crear la Tarea (todos los contactos activos del cliente con acceso al
 * portal) y que se puede ajustar tarea por tarea: quitar a alguien, o volver a sumarlo.
 *
 * Quién puede tocar qué lo decide la API, no este dibujo: el equipo con permiso de edición cambia a
 * cualquiera; en el portal, el contacto primario cambia a cualquiera de su cliente y uno simple solo
 * a sí mismo. Aquí solo se pintan los interruptores que la respuesta dice que se pueden usar.
 *
 * Hoy seguir una Tarea hace una sola cosa: el contacto recibe, por correo y adjunto, el archivo final
 * cuando la Tarea se completa con uno. La frase de ayuda solo lo promete cuando ese correo está
 * encendido.
 *
 * Es secundario: si no se puede leer, el portal no dibuja nada, y el panel lo dice en una línea sin
 * estorbar el resto de la ficha.
 */
export function SeguidoresDeLaTarea (
  { tareaId, equipo, sujeto }: PropsSeguidoresDeLaTarea
): ReactElement | null {
  const aviso = useAviso()
  const { estado, reemplazar } = useRecurso<SeguidoresDeContacto>(
    rutaDeSeguidoresDeContacto(tareaId, sujeto),
    'No se pudo leer quién sigue la tarea.'
  )
  const [enCurso, setEnCurso] = useState<ReadonlySet<number>>(new Set())

  /**
   * Suma o quita a un contacto y repinta con la respuesta de la API.
   *
   * @param contacto a quien se cambia
   */
  async function alternar (contacto: ContactoSeguidor): Promise<void> {
    setEnCurso((previo) => new Set(previo).add(contacto.id))

    const resultado = await escribirEnBff<SeguidoresDeContacto>(
      rutaDeUnSeguidorDeContacto(tareaId, contacto.id, sujeto),
      'PUT',
      { following: !contacto.following }
    )

    setEnCurso((previo) => {
      const siguiente = new Set(previo)
      siguiente.delete(contacto.id)

      return siguiente
    })

    if (!resultado.ok) {
      aviso.error(resultado.mensaje)

      return
    }

    reemplazar(resultado.datos)
  }

  if (estado.fase === 'cargando') return null

  if (estado.fase === 'error') {
    return sujeto === 'portal'
      ? null
      : (
        <section className="flex flex-col gap-2">
          <h4 className="text-texto-tenue text-sm font-semibold">Seguidores</h4>
          <AvisoEnLinea variante="aviso" mensaje={estado.mensaje} />
        </section>
        )
  }

  const datos = estado.datos
  const contactos = datos.contacts
  const puedeCambiar = sujeto === 'portal' || datos.can_edit === true
  const siguen = contactosQueSiguen(contactos)
  const promete = datos.delivery?.mail_enabled === true

  // Sin equipo que mostrar y sin contactos, no hay nada que decir: una seccion vacia es ruido.
  if (contactos.length === 0 && (equipo === undefined || equipo.length === 0)) return null

  return (
    <section className="flex flex-col gap-3" aria-label="Seguidores">
      <h4 className="text-texto-tenue text-sm font-semibold">Seguidores</h4>

      {equipo !== undefined && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-texto-sutil w-20 shrink-0 text-xs">Equipo</span>
          {equipo.length === 0
            ? <span className="text-texto-sutil text-sm">Nadie</span>
            : <GrupoEnlacesPersona personas={equipo} maximo={6} />}
        </div>
      )}

      {contactos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-texto-sutil w-20 shrink-0 text-xs">Cliente</span>
            {!puedeCambiar && (
              <span className="min-w-0 text-sm">
                {siguen.length === 0 ? 'Nadie' : siguen.map((contacto) => contacto.full_name).join(', ')}
              </span>
            )}
          </div>

          {puedeCambiar && (
            <ul className="flex flex-col gap-1.5">
              {contactos.map((contacto) => (
                <li key={contacto.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {contacto.full_name}
                    {contacto.portal_access === false && (
                      <span className="text-texto-sutil ml-1.5 text-xs">sin acceso al portal</span>
                    )}
                  </span>
                  <Interruptor
                    encendido={contacto.following}
                    etiqueta={`${contacto.following ? 'Dejar de seguir' : 'Seguir'} la tarea: ${contacto.full_name}`}
                    deshabilitado={enCurso.has(contacto.id)}
                    onPulsar={() => { void alternar(contacto) }}
                  />
                </li>
              ))}
            </ul>
          )}

          {promete && (
            <p className="text-texto-sutil text-xs">
              Quien sigue la tarea recibe por correo, adjunto, el archivo final cuando se completa con uno.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
