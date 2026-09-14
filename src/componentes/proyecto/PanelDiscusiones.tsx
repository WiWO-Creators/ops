'use client'

import { Suspense, useCallback, useMemo, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { definicionDeDiscusiones } from '@/definiciones/discusiones'
import { AccionesFila } from './AccionesFila'
import { FormularioRecurso } from './FormularioRecurso'
import { PanelRecurso } from './PanelRecurso'
import { ComentarioDeDiscusion } from './ComentarioDeDiscusion'
import { useRecurso } from './carga'
import type { CampoFormulario } from './formulario'
import type { ComentarioDiscusion, Discusion } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { DefinicionRecurso } from '@/definiciones/tipos'
import { conId, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'

/**
 * Pestaña Discusiones del Proyecto: listado y detalle con sus comentarios.
 *
 * **La misma la abren el equipo y el cliente.** Lo unico que cambia es de donde bajan los datos
 * —`fuente`— y que columnas y filtros declara cada contrato, que resuelve `definicionDeDiscusiones`
 * en la capa de definiciones: acá no hay ninguna rama por sujeto. Con `capacidades={[]}` no hay
 * "Nueva discusión" ni acciones por fila, y el hilo se lee igual.
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
  /** De donde bajan las discusiones y sus comentarios. Ver `dominio/fuente-proyecto.ts`. */
  fuente: FuenteDeProyecto
  /** Capacidades sobre `projects`: crear y editar discusiones cuelgan del permiso del proyecto. */
  capacidades: Capacidad[]
}

export function PanelDiscusiones (props: PropsPanelDiscusiones): ReactElement {
  // Lee `useSearchParams`: sin este limite de Suspense el build de la pagina falla.
  return (
    <Suspense fallback={<Cargando mensaje="Cargando las discusiones…" />}>
      <DiscusionesDelProyecto {...props} />
    </Suspense>
  )
}

function DiscusionesDelProyecto ({ proyectoId, fuente, capacidades }: PropsPanelDiscusiones): ReactElement {
  const params = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [creando, setCreando] = useState(false)

  const recargar = useCallback(() => { setRevision((n) => n + 1) }, [])
  const abierta = idPositivo(params.get('discusion'))

  const puedeEditar = capacidades.includes('edit')
  const puedeBorrar = capacidades.includes('delete')

  const definicion = useMemo<DefinicionRecurso<Discusion>>(() => {
    const base = definicionDeDiscusiones(fuente, proyectoId)

    return {
      ...base,
      columnas: [
        ...base.columnas.map((columna) => (
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
    }
  }, [fuente, proyectoId, puedeEditar, puedeBorrar, recargar])

  if (abierta !== null) return <DetalleDiscusion fuente={fuente} discusionId={abierta} />

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
        rutaLookups={fuente.lookups}
      />

      <FormularioRecurso
        abierto={creando}
        onAbiertoCambia={setCreando}
        titulo="Nueva discusión"
        campos={CAMPOS}
        ruta={fuente.discusiones}
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
function DetalleDiscusion ({
  fuente,
  discusionId
}: {
  fuente: FuenteDeProyecto
  discusionId: number
}): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const { estado, recargar } = useRecurso<ComentarioDiscusion[]>(
    conId(fuente.comentarios, discusionId),
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

      {estado.fase === 'cargando' && <Cargando alto="min-h-48" mensaje="Cargando los comentarios…" />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}

      {estado.fase === 'listo' && estado.datos.length === 0 && (
        <Vacio titulo="Sin comentarios" descripcion="Todavía nadie escribió en esta discusión." />
      )}

      {estado.fase === 'listo' && estado.datos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {estado.datos.map((comentario) => (
            <ComentarioDeDiscusion key={comentario.id} comentario={comentario} />
          ))}
        </ul>
      )}
    </div>
  )
}
