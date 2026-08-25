'use client'

import { Suspense, useCallback, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { DISCUSIONES } from '@/definiciones/discusiones'
import { AccionesFila } from './AccionesFila'
import { FormularioRecurso } from './FormularioRecurso'
import { PanelRecurso } from './PanelRecurso'
import { useRecurso } from './carga'
import type { CampoFormulario } from './formulario'
import type { ComentarioDiscusion, Discusion } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Pestaña Discusiones del Proyecto: listado y detalle con sus comentarios.
 *
 * La discusion abierta viaja en `?discusion={id}`, no en el estado del componente: asi se comparte
 * por enlace, "atras" vuelve al listado, y el asunto puede ser un enlace de verdad —clic del medio,
 * "abrir en pestaña nueva"— en vez de un `onClick`.
 */

/** Campos del formulario de discusion. `show_to_customer` viene marcado, como en el panel. */
const CAMPOS: CampoFormulario[] = [
  { clave: 'subject', etiqueta: 'Asunto', tipo: 'texto', requerido: true, maximo: 255 },
  { clave: 'description', etiqueta: 'Descripción', tipo: 'area' },
  { clave: 'show_to_customer', etiqueta: 'Mostrar al cliente', tipo: 'booleano' }
]

interface PropsPanelDiscusiones {
  proyectoId: number
  /** Capacidades sobre `projects`: crear y editar discusiones cuelgan del permiso del proyecto. */
  capacidades: Capacidad[]
}

export function PanelDiscusiones (props: PropsPanelDiscusiones): ReactElement {
  // Lee `useSearchParams`: sin este limite de Suspense el build de la pagina falla.
  return (
    <Suspense fallback={<Cargando filas={6} />}>
      <DiscusionesDelProyecto {...props} />
    </Suspense>
  )
}

function DiscusionesDelProyecto ({ proyectoId, capacidades }: PropsPanelDiscusiones): ReactElement {
  const params = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [creando, setCreando] = useState(false)

  const recargar = useCallback(() => { setRevision((n) => n + 1) }, [])
  const abierta = idPositivo(params.get('discusion'))

  const puedeEditar = capacidades.includes('edit')
  const puedeBorrar = capacidades.includes('delete')

  const definicion = useMemo<DefinicionRecurso<Discusion>>(
    () => ({
      ...DISCUSIONES,
      ruta: `projects/${encodeURIComponent(String(proyectoId))}/discussions`,
      columnas: [
        ...DISCUSIONES.columnas.map((columna) => (
          columna.clave === 'subject'
            ? { ...columna, presentar: (d: Discusion) => <EnlaceDiscusion discusion={d} /> }
            : columna
        )),
        ...(puedeEditar || puedeBorrar
          ? [{
              clave: 'acciones',
              encabezado: 'Acciones',
              presentar: (d: Discusion) => (
                <AccionesFila
                  tituloEdicion="Editar discusión"
                  campos={CAMPOS}
                  registro={d as unknown as Record<string, unknown>}
                  ruta={`discussions/${d.id}`}
                  puedeEditar={puedeEditar}
                  puedeBorrar={puedeBorrar}
                  tituloBorrado="Eliminar discusión"
                  advertencia={`"${d.subject}" se borra con todos sus comentarios y adjuntos.`}
                  recargar={recargar}
                />
              )
            }]
          : [])
      ]
    }),
    [proyectoId, puedeEditar, puedeBorrar, recargar]
  )

  if (abierta !== null) return <DetalleDiscusion discusionId={abierta} />

  const barra = capacidades.includes('create')
    ? (
      <div className="flex justify-end">
        <Boton variante="primario" tamano="chico" onClick={() => { setCreando(true) }}>
          Nueva discusión
        </Boton>
      </div>
      )
    : null

  return (
    <>
      <PanelRecurso
        definicion={definicion}
        claveFila={(d) => d.id}
        capacidades={capacidades}
        barra={barra}
        revision={revision}
      />

      <FormularioRecurso
        abierto={creando}
        onAbiertoCambia={setCreando}
        titulo="Nueva discusión"
        campos={CAMPOS}
        ruta={`projects/${proyectoId}/discussions`}
        metodo="POST"
        onGuardado={recargar}
      />
    </>
  )
}

/**
 * Lee un id de la URL.
 *
 * La URL la escribe cualquiera: `?discusion=abc` o `?discusion=-3` no pueden terminar en una peticion
 * al BFF.
 *
 * @param crudo el valor del parametro, o `null` si no viene
 * @returns el id, o `null` si no es un entero positivo
 */
function idPositivo (crudo: string | null): number | null {
  if (crudo === null || crudo.trim() === '') return null

  const id = Number(crudo)

  return Number.isInteger(id) && id > 0 ? id : null
}

/** El asunto de la discusion, como enlace a su detalle, conservando el resto de la vista. */
function EnlaceDiscusion ({ discusion }: { discusion: Discusion }): ReactElement {
  const params = useSearchParams()
  const siguientes = new URLSearchParams(params.toString())
  siguientes.set('discusion', String(discusion.id))

  return (
    <Link
      href={`?${siguientes.toString()}`}
      scroll={false}
      className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
    >
      {discusion.subject}
    </Link>
  )
}

/**
 * Detalle de una discusion con su hilo de comentarios.
 *
 * Los comentarios se piden aparte y no como `include`: el hilo puede ser largo y el listado no lo
 * necesita.
 */
function DetalleDiscusion ({ discusionId }: { discusionId: number }): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const { estado, recargar } = useRecurso<ComentarioDiscusion[]>(
    `discussions/${discusionId}/comments?tipo=regular`,
    'No se pudieron cargar los comentarios.'
  )

  /** Cierra el detalle sacando `?discusion` y dejando intacto el resto de la vista. */
  function volver (): void {
    const siguientes = new URLSearchParams(params.toString())
    siguientes.delete('discusion')

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-4">
      <Boton variante="sutil" tamano="chico" className="self-start" onClick={volver}>
        ← Volver a las discusiones
      </Boton>

      {estado.fase === 'cargando' && <Cargando filas={4} />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}

      {estado.fase === 'listo' && estado.datos.length === 0 && (
        <Vacio titulo="Sin comentarios" descripcion="Todavía nadie escribió en esta discusión." />
      )}

      {estado.fase === 'listo' && estado.datos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {estado.datos.map((comentario) => (
            <li
              key={comentario.id}
              className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex gap-3 border p-3"
            >
              <Avatar
                nombre={comentario.author?.full_name ?? 'Sin autor'}
                imagen={comentario.author?.profile_image_url ?? null}
              />

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-texto text-sm font-medium">
                    {comentario.author?.full_name ?? 'Sin autor'}
                  </span>
                  {comentario.author?.es_cliente === true && (
                    <Insignia tamano="chico">Cliente</Insignia>
                  )}
                  <Fecha valor={comentario.created} conHora className="text-texto-tenue text-xs" />
                </span>

                <p className="text-texto text-sm whitespace-pre-line">{comentario.content}</p>

                {comentario.file !== null && (
                  <a
                    href={comentario.file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-acento w-fit text-xs font-semibold underline underline-offset-4"
                  >
                    {comentario.file.name}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
