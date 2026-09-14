'use client'

import Link from 'next/link'
import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import type { ProspectoDetalle } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { camposDeProspecto } from './campos'

/**
 * Editar y borrar un Prospecto, desde su ficha.
 *
 * **No hay "ganar" ni "perder".** Ganar y perder son por licitacion —se pueden ganar 2 de 4— y el
 * estado del prospecto se deriva de las suyas: no hay nada que apretar acá que la API acepte.
 *
 * Editar sigue disponible despues de convertir. Lo que se edita es el legajo del prospecto, que es
 * historia: la API **no** lo propaga al cliente real, que se administra en `/clientes/{id}`. Por eso
 * cuando ya hay cliente aparece ademas el enlace hacia el.
 */
interface PropsAcciones {
  prospecto: ProspectoDetalle
  /** Catalogo `countries` de `GET /lookups`, para el formulario de edicion. */
  paises: OpcionCampo[]
  /** Capacidades sobre `projects`: el prospecto es la antesala de un Espacio y usa ese permiso. */
  capacidades: Capacidad[]
}

export function AccionesProspecto ({ prospecto, paises, capacidades }: PropsAcciones): ReactElement {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [borrando, setBorrando] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      {prospecto.client_id !== null && (
        <Link
          href={`/clientes/${prospecto.client_id}`}
          className="border-control-borde bg-control text-texto hover:bg-hover rounded-control inline-flex h-8 items-center px-3 text-xs font-semibold"
        >
          Ver cliente
        </Link>
      )}

      {capacidades.includes('edit') && (
        <Boton variante="secundario" tamano="chico" onClick={() => { setEditando(true) }}>
          Editar
        </Boton>
      )}

      {capacidades.includes('delete') && (
        <Boton variante="peligro" tamano="chico" onClick={() => { setBorrando(true) }}>
          Borrar
        </Boton>
      )}

      {capacidades.includes('edit') && (
        <FormularioRecurso
          abierto={editando}
          onAbiertoCambia={setEditando}
          titulo={`Editar ${prospecto.empresa}`}
          descripcion={
            prospecto.client_id === null
              ? 'Estos datos son los que se copian al cliente el día que se gane la primera licitación.'
              : 'El cliente ya existe: esto edita el legajo del prospecto, no la ficha del cliente.'
          }
          campos={camposDeProspecto(paises)}
          ruta={`prospectos/${prospecto.id}`}
          metodo="PATCH"
          registro={prospecto as unknown as Record<string, unknown>}
          onGuardado={() => { router.refresh() }}
          columnas={2}
          ancho="grande"
        />
      )}

      <DialogoBorrar
        prospecto={prospecto}
        abierto={borrando}
        onCerrar={() => { setBorrando(false) }}
      />
    </div>
  )
}

/**
 * Confirmacion de borrado.
 *
 * La API responde **409 si el prospecto tiene licitaciones**, porque borrarlo dejaria sus Espacios
 * huerfanos. El dialogo lo dice antes de apretar y **no se cierra** si la llamada falla: cerrarlo
 * dejaria el mensaje sin donde mostrarse.
 *
 * Al borrar se navega a la lista, a diferencia de las acciones de una licitacion: la ficha que se
 * estaba mirando ya no existe, y refrescarla daria un 404.
 */
function DialogoBorrar ({
  prospecto,
  abierto,
  onCerrar
}: {
  prospecto: ProspectoDetalle
  abierto: boolean
  onCerrar: () => void
}): ReactElement {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const conLicitaciones = prospecto.licitaciones_total > 0

  /** Llama al borrado; el error es un valor que se muestra, nunca una excepcion que rompa la ficha. */
  async function confirmar (): Promise<void> {
    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff<unknown>(`prospectos/${prospecto.id}`, 'DELETE')

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    cerrar(false)
    router.push('/prospectos')
    router.refresh()
  }

  /** Cierra limpiando el error: el mensaje de un intento viejo no debe recibir al siguiente. */
  function cerrar (sigueAbierto: boolean): void {
    if (sigueAbierto) return

    setFallo(null)
    onCerrar()
  }

  return (
    <Dialogo open={abierto} onOpenChange={cerrar}>
      <ContenidoDialogo
        titulo={`Borrar ${prospecto.empresa}`}
        descripcion={
          conLicitaciones
            ? `Este prospecto tiene ${prospecto.licitaciones_total} licitación(es): hay que borrarlas primero, una por una, desde cada una. El borrado va a fallar.`
            : 'Se borra el prospecto con sus personas de contacto. No se puede deshacer.'
        }
      >
        {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Boton type="button" variante="sutil" onClick={() => { cerrar(false) }}>Cancelar</Boton>
          <Boton
            type="button"
            variante="peligro"
            cargando={enviando}
            onClick={() => { void confirmar() }}
          >
            Borrar
          </Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
