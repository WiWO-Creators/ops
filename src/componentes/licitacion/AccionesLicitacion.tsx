'use client'

import Link from 'next/link'
import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { DialogoEliminarProyecto } from '@/componentes/proyecto/DialogoEliminarProyecto'
import { DialogoResultado } from '@/componentes/proyecto/DialogoResultado'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import { camposDeEdicion } from '@/componentes/proyecto/MenuProyecto'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { LicitacionDetalle } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { camposDeEdicionDeLicitacion } from './campos'

/**
 * Editar, ganar y perder una Licitacion, y el enlace a su prospecto.
 *
 * Ganar y perder existen **solo mientras la licitacion esta abierta**: ganar o perder dos veces no
 * significa nada, y el backend responde 409.
 *
 * **Editar son dos formularios porque son dos recursos.** "Editar" escribe los cinco campos propios
 * con `PATCH /licitaciones/{id}` —holding, area, modelo de servicio, owner y focal— y "Editar
 * proyecto" el nombre, las fechas y la descripcion con `PATCH /projects/{id}`. Un solo formulario
 * tendria que mandar dos peticiones, y si la segunda falla deja guardada la mitad. La empresa y sus
 * personas de contacto no se editan acá: viven en el prospecto, que es uno para todas sus
 * licitaciones, y a eso lleva el enlace. Editar sigue disponible tras cerrarla: el backend no lo
 * impide, y corregir el owner de una licitacion ganada es un caso real.
 *
 * **Eliminar** existe en cualquier estado —abierta, ganada o perdida— porque sirve para lo que no
 * debio crearse, no para cerrar la licitacion. Es `DELETE /projects/{id}`: el backend no tiene otro
 * borrado, y arrastra la fila de `tblapi_licitaciones` por la FK. Pide la capacidad `delete`.
 *
 * Tras ganar o perder se hace `router.refresh()` y **no** una redireccion: la ficha se resuelve en el
 * servidor, refrescar baja el estado nuevo, y quien acaba de ganar quiere ver el resultado, no
 * aparecer en otra pantalla.
 */
interface PropsAcciones {
  licitacion: LicitacionDetalle
  /** Capacidades sobre `projects`: una Licitacion es un Espacio y el backend usa ese permiso. */
  capacidades: Capacidad[]
  /** Catalogo `areas` de `GET /lookups`, para el formulario de edicion. */
  areas: OpcionCampo[]
  /** Catalogo `staff` de `GET /lookups`, para el owner y el focal. */
  staff: OpcionCampo[]
}

export function AccionesLicitacion ({ licitacion, capacidades, areas, staff }: PropsAcciones): ReactElement {
  const router = useRouter()
  const [editando, setEditando] = useState<'licitacion' | 'espacio' | null>(null)
  const [confirmando, setConfirmando] = useState<'ganar' | 'perder' | null>(null)
  const [eliminando, setEliminando] = useState(false)

  const abierta = licitacion.estado === 'abierta'
  const puedeEditar = capacidades.includes('edit')
  const puedeEliminar = capacidades.includes('delete')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Enlace href={`/prospectos/${licitacion.prospecto_id}`}>Ver prospecto</Enlace>

      {licitacion.estado === 'ganada' && licitacion.client_id !== null && (
        <>
          <Enlace href={`/clientes/${licitacion.client_id}`}>Ver cliente</Enlace>
          <Enlace href={`/proyectos/${licitacion.espacio.id}`}>Ver {licitacion.espacio.name}</Enlace>
        </>
      )}

      {puedeEditar && (
        <>
          <Boton variante="secundario" tamano="chico" onClick={() => { setEditando('licitacion') }}>
            Editar
          </Boton>
          <Boton variante="secundario" tamano="chico" onClick={() => { setEditando('espacio') }}>
            Editar {GLOSARIO.espacio.singular.toLowerCase()}
          </Boton>
        </>
      )}

      {abierta && puedeEditar && (
        <>
          <Boton variante="primario" tamano="chico" onClick={() => { setConfirmando('ganar') }}>
            Ganar
          </Boton>
          <Boton variante="peligro" tamano="chico" onClick={() => { setConfirmando('perder') }}>
            Perder
          </Boton>
        </>
      )}

      {puedeEliminar && (
        <Boton variante="peligro" tamano="chico" onClick={() => { setEliminando(true) }}>
          Eliminar
        </Boton>
      )}

      {puedeEditar && (
        <>
          <FormularioRecurso
            abierto={editando === 'licitacion'}
            onAbiertoCambia={(abierto) => { setEditando(abierto ? 'licitacion' : null) }}
            titulo={`Editar la ${GLOSARIO.licitacion.singular.toLowerCase()} de ${licitacion.company}`}
            descripcion="La empresa y sus contactos se editan en el prospecto."
            campos={camposDeEdicionDeLicitacion(areas, staff)}
            ruta={`licitaciones/${licitacion.id}`}
            metodo="PATCH"
            registro={licitacion as unknown as Record<string, unknown>}
            onGuardado={() => { router.refresh() }}
            columnas={2}
          />
          <FormularioRecurso
            abierto={editando === 'espacio'}
            onAbiertoCambia={(abierto) => { setEditando(abierto ? 'espacio' : null) }}
            titulo={`Editar ${GLOSARIO.espacio.singular.toLowerCase()}`}
            descripcion={licitacion.espacio.name}
            campos={camposDeEdicion()}
            ruta={`projects/${licitacion.espacio.id}`}
            metodo="PATCH"
            registro={licitacion.espacio as unknown as Record<string, unknown>}
            onGuardado={() => { router.refresh() }}
          />
        </>
      )}

      <DialogoResultado
        base={`licitaciones/${licitacion.id}`}
        accion={confirmando}
        descripcion={{
          ganar: descripcionDeGanar(licitacion),
          perder: `Se archiva ${licitacion.espacio.name} con sus tareas, sus hitos y sus archivos. La ${GLOSARIO.licitacion.singular.toLowerCase()} queda consultable en el histórico.`
        }}
        onCerrar={() => { setConfirmando(null) }}
        onHecho={() => { router.refresh() }}
      />

      <DialogoEliminarProyecto
        espacio={eliminando ? licitacion.espacio : null}
        tipo={GLOSARIO.licitacion.singular}
        onCerrar={() => { setEliminando(false) }}
        onEliminado={() => { router.replace(`/prospectos/${licitacion.prospecto_id}?tab=licitaciones`) }}
      />
    </div>
  )
}

/**
 * Que pasa exactamente al ganar, segun si el prospecto YA tiene cliente.
 *
 * La primera victoria de un prospecto crea el cliente con todas sus personas de contacto; la segunda
 * **no crea a nadie**, solo cuelga el Espacio del cliente que ya existe. Escribir siempre "se crea el
 * cliente" en un diálogo que dice "no se puede deshacer" seria mentir la mitad de las veces.
 *
 * @param licitacion La licitacion que se esta por ganar.
 * @returns El texto del diálogo de confirmación.
 */
function descripcionDeGanar (licitacion: LicitacionDetalle): string {
  const espacio = `${licitacion.espacio.name} pasa a colgar de ese cliente. No se puede deshacer.`

  return licitacion.client_id === null
    ? `Se crea el cliente ${licitacion.prospecto.empresa} con las personas de contacto del prospecto, y ${espacio}`
    : `${licitacion.prospecto.empresa} ya es cliente: no se crea ninguno nuevo, y ${espacio}`
}

/** Un enlace con el aspecto de boton secundario, para no pintar un `<button>` que navega. */
function Enlace ({ href, children }: { href: string, children: React.ReactNode }): ReactElement {
  return (
    <Link
      href={href}
      className="border-control-borde bg-control text-texto hover:bg-hover rounded-control inline-flex h-8 items-center px-3 text-xs font-semibold"
    >
      {children}
    </Link>
  )
}
