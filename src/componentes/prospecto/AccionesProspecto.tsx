'use client'

import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { MenuAccionesFila, type AccionDeBorrado } from '@/componentes/datos/MenuAccionesFila'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
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
  const borrado = useBorradoDeProspecto(prospecto)

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
          <Pencil aria-hidden className="size-4" />
          Editar
        </Boton>
      )}

      {capacidades.includes('delete') && (
        <MenuAccionesFila ariaLabel={`Más acciones de ${prospecto.empresa}`} borrado={borrado} />
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
          registro={prospecto}
          onGuardado={() => { router.refresh() }}
          columnas={2}
          ancho="grande"
        />
      )}
    </div>
  )
}

/**
 * El borrado del prospecto para el menu ⋯, que lo confirma con la primitiva comun `ConfirmarBorrado`.
 *
 * La API responde **409 si el prospecto tiene licitaciones**, porque borrarlo dejaria sus Espacios
 * huerfanos. La advertencia lo dice antes de apretar; si la llamada falla, `ConfirmarBorrado` muestra
 * el mensaje y no se cierra.
 *
 * Al borrar se navega a la lista, a diferencia de las acciones de una licitacion: la ficha que se
 * estaba mirando ya no existe, y refrescarla daria un 404.
 *
 * @param prospecto el prospecto de la ficha
 * @returns el contrato de borrado de `MenuAccionesFila`
 */
function useBorradoDeProspecto (prospecto: ProspectoDetalle): AccionDeBorrado {
  const router = useRouter()
  const aviso = useAviso()

  const conLicitaciones = prospecto.licitaciones_total > 0

  /** Borra el prospecto y vuelve a la lista. Lanza si falla: `ConfirmarBorrado` muestra el mensaje. */
  async function confirmar (): Promise<void> {
    const resultado = await escribirEnBff<unknown>(`prospectos/${prospecto.id}`, 'DELETE')

    if (!resultado.ok) throw new Error(resultado.mensaje)

    aviso.exito(`«${prospecto.empresa}» se eliminó.`)
    router.push('/prospectos')
    router.refresh()
  }

  return {
    titulo: 'Eliminar prospecto',
    advertencia: conLicitaciones
      ? `Este prospecto tiene ${prospecto.licitaciones_total} licitación(es): hay que eliminarlas primero, una por una, desde cada una. Eliminarlo va a fallar.`
      : 'Se elimina el prospecto con sus personas de contacto. No se puede deshacer.',
    onConfirmar: confirmar
  }
}
