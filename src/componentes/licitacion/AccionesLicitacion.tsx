'use client'

import Link from 'next/link'
import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { DialogoResultado } from '@/componentes/proyecto/DialogoResultado'
import type { LicitacionDetalle } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Ganar y perder una Licitacion, y los enlaces a donde se edita lo suyo.
 *
 * Las dos acciones existen **solo mientras la licitacion esta abierta**: ganar o perder dos veces no
 * significa nada, y el backend responde 409.
 *
 * **No hay boton de editar.** Desde `0320`, `PATCH /licitaciones/{id}` no acepta ningun campo: la
 * empresa y sus personas de contacto se editan en el prospecto —que es uno solo para todas sus
 * licitaciones— y el nombre, las fechas y la descripcion en la ficha del Espacio, con la cabecera que
 * ya esta arriba. Por eso lo que queda es un enlace al prospecto.
 *
 * Tras cada accion se hace `router.refresh()` y **no** una redireccion: la ficha se resuelve en el
 * servidor, refrescar baja el estado nuevo, y quien acaba de ganar quiere ver el resultado, no
 * aparecer en otra pantalla.
 */
interface PropsAcciones {
  licitacion: LicitacionDetalle
  /** Capacidades sobre `projects`: una Licitacion es un Espacio y el backend usa ese permiso. */
  capacidades: Capacidad[]
}

export function AccionesLicitacion ({ licitacion, capacidades }: PropsAcciones): ReactElement {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState<'ganar' | 'perder' | null>(null)

  const abierta = licitacion.estado === 'abierta'
  const puedeEditar = capacidades.includes('edit')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Enlace href={`/prospectos/${licitacion.prospecto_id}`}>Ver prospecto</Enlace>

      {licitacion.estado === 'ganada' && licitacion.client_id !== null && (
        <>
          <Enlace href={`/clientes/${licitacion.client_id}`}>Ver cliente</Enlace>
          <Enlace href={`/espacios/${licitacion.espacio.id}`}>Ver {licitacion.espacio.name}</Enlace>
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
