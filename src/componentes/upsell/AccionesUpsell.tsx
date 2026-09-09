'use client'

import Link from 'next/link'
import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { DialogoResultado } from '@/componentes/proyecto/DialogoResultado'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { UpsellDetalle } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { camposDeEdicionDeUpsell } from './campos'

/**
 * Editar, ganar y perder un Upsell, desde su ficha.
 *
 * Las tres acciones existen **solo mientras la oportunidad esta abierta**: el backend responde 409 a
 * un `PATCH` sobre una ya resuelta, y ganar o perder dos veces no significa nada. Una vez ganada, lo
 * que hay son dos enlaces —al cliente y al Espacio, que desde ese momento ya vive en su seccion—.
 *
 * Ganar **no crea a nadie**, a diferencia de una licitacion: el cliente ya existe y el Espacio ya
 * cuelga de el. Lo unico que cambia es que deja de estar escondido, tambien del portal del cliente,
 * y el diálogo lo dice con esas palabras.
 *
 * Tras cada accion se hace `router.refresh()` y **no** una redireccion: la ficha se resuelve en el
 * servidor, refrescar baja el estado nuevo, y quien acaba de ganar quiere ver el resultado.
 */
interface PropsAcciones {
  upsell: UpsellDetalle
  /** Catalogo `currencies` de `GET /lookups`, para el formulario de edicion. */
  monedas: OpcionCampo[]
  /** Capacidades sobre `projects`: un Upsell es un Espacio y el backend usa ese permiso. */
  capacidades: Capacidad[]
}

export function AccionesUpsell ({ upsell, monedas, capacidades }: PropsAcciones): ReactElement {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [confirmando, setConfirmando] = useState<'ganar' | 'perder' | null>(null)

  const abierta = upsell.estado === 'abierta'
  const puedeEditar = capacidades.includes('edit')
  const cliente = upsell.client?.company ?? 'el cliente'

  return (
    <div className="flex flex-wrap items-center gap-2">
      {upsell.client_id !== null && <Enlace href={`/clientes/${upsell.client_id}`}>Ver cliente</Enlace>}

      {upsell.estado === 'ganada' && (
        <Enlace href={`/espacios/${upsell.espacio.id}`}>Ver {upsell.espacio.name}</Enlace>
      )}

      {abierta && puedeEditar && (
        <>
          <Boton variante="secundario" tamano="chico" onClick={() => { setEditando(true) }}>
            Editar
          </Boton>
          <Boton variante="primario" tamano="chico" onClick={() => { setConfirmando('ganar') }}>
            Ganar
          </Boton>
          <Boton variante="peligro" tamano="chico" onClick={() => { setConfirmando('perder') }}>
            Perder
          </Boton>
        </>
      )}

      {abierta && puedeEditar && (
        <FormularioRecurso
          abierto={editando}
          onAbiertoCambia={setEditando}
          titulo={`Editar la oportunidad de ${cliente}`}
          descripcion="Los datos del proyecto se editan desde su propia ficha."
          campos={camposDeEdicionDeUpsell(monedas)}
          ruta={`upsells/${upsell.id}`}
          metodo="PATCH"
          registro={upsell as unknown as Record<string, unknown>}
          onGuardado={() => { router.refresh() }}
          columnas={2}
        />
      )}

      <DialogoResultado
        base={`upsells/${upsell.id}`}
        accion={confirmando}
        motivo="Por qué (opcional)"
        descripcion={{
          ganar: `${upsell.espacio.name} pasa a ser un proyecto normal de ${cliente}: aparece entre sus proyectos, en los totales y en su portal. No se crea ningún cliente ni contacto.`,
          perder: `Se archiva ${upsell.espacio.name} con sus tareas, sus hitos y sus archivos. La oportunidad queda consultable en el histórico, y el cliente nunca la ve.`
        }}
        onCerrar={() => { setConfirmando(null) }}
        onHecho={() => { router.refresh() }}
      />
    </div>
  )
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
