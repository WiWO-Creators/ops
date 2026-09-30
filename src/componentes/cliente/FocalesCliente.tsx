'use client'

import { useEffect, useState } from 'react'
import { MatrizAsignacion } from '@/componentes/formularios/MatrizAsignacion'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { EnlacePersona } from '@/componentes/presentadores/EnlacePersona'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cargarAsignables } from '@/datos/asignables'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import type { Capacidad, StaffReferencia } from '@/datos/tipos'

/** `GET`/`PUT /clients/{id}/focales`, con el id ya escapado. La ruta conserva el nombre de la API. */
function rutaDeFocales (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/focales`
}

/** `GET /clients/{id}/areas`, con el id ya escapado. */
function rutaDeAreas (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/areas`
}

/**
 * Pestaña Focals del Cliente: quién responde por la cuenta, y en qué áreas se la atiende.

 * El nombre visible sale del glosario (`GLOSARIO.focal`) y nunca escrito a mano: la sección propia
 * de esta gente se llama igual, y dos lugares que escriben la misma palabra son dos lugares que
 * pueden terminar diciendo cosas distintas.
 *
 * **Nombrar a alguien {@link GLOSARIO.focal} reparte acceso.** Quien esté acá ve todos los {@link GLOSARIO.espacio} y
 * todas las {@link GLOSARIO.proceso} del cliente, aunque no sea miembro de ninguno. La pantalla lo
 * dice con esas palabras a propósito: una lista de personas al lado de un cliente se lee como un
 * dato de contacto, y esto no lo es.
 *
 * Las áreas **no se editan acá ni en ningún lado**: salen de las Tareas del cliente, del campo "Área
 * de la compañía" de cada una. Se muestran porque son la respuesta a "qué le hacemos a este cliente"
 * y nadie la tenía a mano; se muestran en gris y sin control porque un campo editable prometería una
 * escritura que no existe.
 *
 * Sin `customers.edit` la pestaña sigue visible en solo lectura, igual que la de Equipo: saber quién
 * responde por una cuenta no es información reservada.
 *
 * @param clienteId el cliente que se esta mirando
 * @param nombreCliente su nombre, para el aviso al guardar
 * @param capacidades capacidades sobre `customers`, de `permissions` de `/me`
 */
export function PanelFocalesCliente ({ clienteId, nombreCliente, capacidades }: {
  clienteId: number
  nombreCliente: string
  capacidades: Capacidad[]
}) {
  const plural = GLOSARIO.focal.plural.toLowerCase()
  const singular = GLOSARIO.focal.singular.toLowerCase()
  const espacios = GLOSARIO.espacio.plural.toLowerCase()
  const procesos = GLOSARIO.proceso.plural.toLowerCase()

  return (
    <div className="flex flex-col gap-6">
      <MatrizAsignacion<StaffReferencia, StaffReferencia>
        clave={String(clienteId)}
        puedeEditar={capacidades.includes('edit')}
        cargar={async (senal) => {
          const [opciones, focales] = await Promise.all([
            cargarAsignables(),
            pedirSobre<StaffReferencia[]>(rutaDeFocales(clienteId), senal)
          ])

          return { opciones, asignados: focales.data }
        }}
        guardar={(ids) => escribirEnBff<StaffReferencia[]>(rutaDeFocales(clienteId), 'PUT', { focales: ids })}
        idDe={(persona) => persona.id}
        comoOpcion={(persona) => persona}
        textos={{
          cargando: `Cargando los ${plural}…`,
          falloDeCarga: `No se pudieron cargar los ${plural}.`,
          leyenda: `${GLOSARIO.focal.plural} de la cuenta`,
          descripcion: (
            <p className="text-texto-tenue mb-2 text-xs">
              El {GLOSARIO.focal.singular} responde por el cliente y ve todos sus {espacios} y todas sus {procesos}.
            </p>
          ),
          sinNinguno: `El cliente quedará sin ${singular}.`,
          guardar: `Guardar ${plural}`,
          exito: `${GLOSARIO.focal.plural} de «${nombreCliente}» actualizados.`,
          vacio: {
            titulo: `Este cliente no tiene ${singular}`,
            descripcion: `Quien sea ${singular} verá todos los ${espacios} y todas las ${procesos} del cliente.`
          }
        }}
        selector={(personas, elegidas, onCambiar) => (
          <SelectorPersonas personas={personas} elegidas={elegidas} onCambiar={onCambiar} />
        )}
        chipConImagen
        chip={(persona) => (
          <EnlacePersona id={persona.id} nombre={persona.full_name} imagen={persona.profile_image_url} tamano="chico" className="max-w-52" />
        )}
      />

      <AreasDelCliente clienteId={clienteId} />
    </div>
  )
}

/**
 * Las áreas que atienden al cliente, derivadas de sus Tareas. Solo lectura, siempre.
 *
 * Carga aparte de los Focals: si falla o no llega una lista, la sección no aparece y la pestaña no
 * pierde la edición.
 *
 * @param clienteId el cliente que se esta mirando
 */
function AreasDelCliente ({ clienteId }: { clienteId: number }) {
  const [areas, setAreas] = useState<string[] | null>(null)

  useEffect(() => {
    const aborto = new AbortController()

    void pedirSobre<string[]>(rutaDeAreas(clienteId), aborto.signal)
      .then((sobre) => { if (!aborto.signal.aborted && Array.isArray(sobre.data)) setAreas(sobre.data) })
      .catch(() => {})

    return () => aborto.abort()
  }, [clienteId])

  if (areas === null) return null

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Áreas que lo atienden</h3>
      <p className="text-texto-tenue text-xs">
        Salen del área declarada en cada {GLOSARIO.proceso.singular.toLowerCase()} del cliente. No se editan acá:
        cambian solas cuando cambia el trabajo.
      </p>

      {areas.length === 0
        ? (
          <p className="text-texto-tenue text-sm">
            Todavía no hay ninguna {GLOSARIO.proceso.singular.toLowerCase()} con área declarada.
          </p>
          )
        : (
          <ul className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <li
                key={area}
                className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control px-3 py-1 text-sm"
              >
                {area}
              </li>
            ))}
          </ul>
          )}
    </section>
  )
}
