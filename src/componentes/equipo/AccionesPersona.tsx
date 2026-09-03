'use client'

import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { BajaYBorrado } from '@/componentes/datos/BajaYBorrado'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { pedirSobre } from '@/datos/cliente'
import type { MiembroEquipo } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { camposDePersona } from './campos'

/**
 * Editar, dar de baja y borrar a una persona, desde su fila o desde su ficha.
 *
 * Los mismos controles sirven en los dos lugares porque son las mismas tres acciones; lo unico que
 * cambia es que despues. En el listado, `recargar` vuelve a pedir la pagina. En la ficha no hay
 * nada que recargar desde el cliente —la resuelve el servidor—, asi que se refresca, y el borrado
 * definitivo vuelve al listado en vez de dejar a la persona mirando el detalle de alguien que ya no
 * existe.
 *
 * El borrado definitivo exige elegir **a quien pasa su trabajo**. No es una cortesia de la interfaz:
 * `DELETE /staff/{id}?purgar=1` responde 422 sin `transferir_a`, porque `Staff_model::delete()` mueve
 * unas cuarenta tablas antes de borrar la fila y sin destino no hace nada.
 *
 * **La lista de herederos se pide al abrir el dialogo, no antes.** Ofrecer a los de la pagina visible
 * era mas barato y estaba mal: para borrar a alguien primero se lo busca por nombre, y entonces la
 * pagina contiene una sola fila —la suya— y no queda nadie a quien transferirle nada. Se pide una vez
 * por dialogo abierto, que es la unica vez que hace falta.
 */

/** Tope de la lista de herederos. Un equipo mas grande que esto se resuelve escribiendo en el buscador. */
const MAXIMO_HEREDEROS = 200

interface PropsAccionesPersona {
  persona: MiembroEquipo
  roles: OpcionCampo[]
  cargos: OpcionCampo[]
  areas: OpcionCampo[]
  capacidades: Capacidad[]
  /** Desde el listado: vuelve a pedir la pagina. Si no viene, se refresca el Server Component. */
  recargar?: () => void
  /** `true` en la ficha: el borrado definitivo vuelve al listado. */
  enFicha?: boolean
}

export function AccionesPersona ({
  persona,
  roles,
  cargos,
  areas,
  capacidades,
  recargar,
  enFicha = false
}: PropsAccionesPersona): ReactElement {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [heredero, setHeredero] = useState('')
  const [companeros, setCompaneros] = useState<MiembroEquipo[] | null>(null)

  const puedeEditar = capacidades.includes('edit')
  const puedeBorrar = capacidades.includes('delete')
  const refrescar = recargar ?? ((): void => { router.refresh() })

  /** Trae el equipo activo la primera vez que se abre la confirmacion. */
  function cargarCompaneros (): void {
    if (companeros !== null) return

    // Sin abortar al desmontar: la peticion es una sola, corta, y el `setState` posterior sobre un
    // componente desmontado en React 19 no avisa ni filtra.
    void pedirSobre<MiembroEquipo[]>(
      `staff?filter[active]=1&per_page=${MAXIMO_HEREDEROS}`,
      new AbortController().signal
    )
      .then((sobre) => { setCompaneros(sobre.data.filter((otra) => otra.id !== persona.id)) })
      .catch(() => { setCompaneros([]) })
  }

  return (
    <>
      {puedeEditar && (
        <Boton variante="sutil" tamano="chico" onClick={() => { setEditando(true) }}>Editar</Boton>
      )}

      <BajaYBorrado
        ruta={`staff/${persona.id}`}
        nombre={persona.full_name}
        activo={persona.active}
        puedeEditar={puedeEditar}
        puedeBorrar={puedeBorrar}
        tamano="chico"
        advertencia={
          `Se borra la ficha de ${persona.full_name} y su trabajo —tareas, horas, proyectos, tickets— ` +
          'pasa a quien elijas. No se puede deshacer.'
        }
        alAbrirBorrado={cargarCompaneros}
        extraDeBorrado={({ deshabilitado }) => ({
          control: (
            <Campo
              etiqueta="Su trabajo pasa a"
              requerido
              ayuda={companeros === null ? 'Cargando el equipo…' : undefined}
            >
              {(props) => (
                <Selector
                  value={heredero}
                  onValueChange={setHeredero}
                  disabled={deshabilitado || companeros === null}
                >
                  <DisparadorSelector marcador="Elegí a alguien del equipo" id={props.id} />
                  <ContenidoSelector>
                    {(companeros ?? []).map((companero) => (
                      <Opcion key={companero.id} value={String(companero.id)}>{companero.full_name}</Opcion>
                    ))}
                  </ContenidoSelector>
                </Selector>
              )}
            </Campo>
          ),
          consulta: heredero === '' ? null : `&transferir_a=${heredero}`
        })}
        recargar={refrescar}
        {...(enFicha ? { alBorrar: () => { router.push('/equipo') } } : {})}
      />

      {puedeEditar && (
        <FormularioRecurso
          abierto={editando}
          onAbiertoCambia={setEditando}
          titulo={`Editar a ${persona.full_name}`}
          campos={camposDePersona(roles, cargos, areas, false)}
          ruta={`staff/${persona.id}`}
          metodo="PATCH"
          registro={persona as unknown as Record<string, unknown>}
          onGuardado={refrescar}
        />
      )}
    </>
  )
}
