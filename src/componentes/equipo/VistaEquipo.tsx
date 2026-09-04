'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Boton } from '@/componentes/formularios/Boton'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { MiembroEquipo } from '@/datos/recursos'
import type { Capacidad, ModeloDePermisos } from '@/datos/tipos'
import { EQUIPO } from '@/definiciones/equipo'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { AccionesPersona } from './AccionesPersona'
import { camposDePersona } from './campos'

/**
 * Listado del Equipo con su alta, su edicion y sus dos formas de eliminar.
 *
 * Envuelve a `TablaRecurso` en vez de reimplementarla: el filtrado, el orden, la paginacion y la URL
 * ya los resuelve el motor. Lo unico propio es la barra de arriba y los controles por fila, que el
 * motor pinta a traves de `filaExtra` porque necesitan dialogos y el menu declarativo solo sabe de
 * llamadas sin cuerpo.
 *
 * Quien hereda el trabajo de una persona borrada lo pide `AccionesPersona` al abrir su dialogo, no
 * esta pantalla: es una lista que casi nunca se mira y no vale un viaje por cada visita al listado.
 */

interface PropsVistaEquipo {
  inicial: ResultadoLista<MiembroEquipo>
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /**
   * Modelo de permisos de quien mira. En `nuevo`, la columna y el filtro de Rol no se dibujan y el
   * alta no ofrece el selector: el rol dejo de existir como concepto. Ver `datos/tipos.ts`.
   */
  modeloDePermisos?: ModeloDePermisos
}

export function VistaEquipo ({
  inicial,
  capacidades = [],
  opcionesDeFiltro,
  modeloDePermisos = 'viejo'
}: PropsVistaEquipo): ReactElement {
  const conRol = modeloDePermisos === 'viejo'
  const router = useRouter()
  const [creando, setCreando] = useState(false)

  // Memoizados los dos: `TablaRecurso` usa la definicion como dependencia de sus efectos, y una
  // definicion nueva en cada render volveria a pedir la pagina en bucle.
  const roles: OpcionCampo[] = useMemo(() => (opcionesDeFiltro?.roles ?? []).map((opcion) => ({
    valor: String(opcion.valor),
    etiqueta: opcion.etiqueta
  })), [opcionesDeFiltro])

  const cargos: OpcionCampo[] = useMemo(() => (opcionesDeFiltro?.cargos ?? []).map((opcion) => ({
    valor: String(opcion.valor),
    etiqueta: opcion.etiqueta
  })), [opcionesDeFiltro])

  const areas: OpcionCampo[] = useMemo(() => (opcionesDeFiltro?.areas ?? []).map((opcion) => ({
    valor: String(opcion.valor),
    etiqueta: opcion.etiqueta
  })), [opcionesDeFiltro])

  const definicion = useMemo(() => {
    const nombreDeRol = new Map(roles.map((rol) => [rol.valor, rol.etiqueta]))
    const nombreDeCargo = new Map(cargos.map((cargo) => [cargo.valor, cargo.etiqueta]))
    const nombreDeArea = new Map(areas.map((area) => [area.valor, area.etiqueta]))

    return {
      ...EQUIPO,
      // El rol no decide nada en tiempo de ejecucion —es la plantilla que pre-marca checkboxes en el
      // panel viejo— asi que en el modelo consolidado no se dibuja ni como columna ni como filtro.
      filtros: EQUIPO.filtros?.filter((filtro) => conRol || filtro.clave !== 'role_id'),
      columnas: EQUIPO.columnas.filter((columna) => conRol || columna.clave !== 'role_id').map((columna) => {
        if (columna.clave === 'full_name') {
          return {
            ...columna,
            presentar: (persona: MiembroEquipo) => (
              <span className="flex items-center gap-2">
                <Avatar nombre={persona.full_name} imagen={persona.profile_image_url} tamano="chico" />
                <Link
                  href={`/equipo/${persona.id}`}
                  className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
                >
                  {persona.full_name}
                </Link>
              </span>
            )
          }
        }

        if (columna.clave === 'role_id') {
          return {
            ...columna,
            // Devuelve texto, no JSX: asi el nombre del rol tambien llega al CSV.
            presentar: (persona: MiembroEquipo) => (
              persona.role_id === null || persona.role_id === 0
                ? 'Sin rol'
                : nombreDeRol.get(String(persona.role_id)) ?? `#${persona.role_id}`
            )
          }
        }

        if (columna.clave === 'cargo_id') {
          return {
            ...columna,
            presentar: (persona: MiembroEquipo) => (
              persona.cargo_id === null ? 'Sin cargo' : nombreDeCargo.get(String(persona.cargo_id)) ?? `#${persona.cargo_id}`
            )
          }
        }

        if (columna.clave === 'area_id') {
          return {
            ...columna,
            presentar: (persona: MiembroEquipo) => (
              persona.area_id === null ? 'Sin área' : nombreDeArea.get(String(persona.area_id)) ?? `#${persona.area_id}`
            )
          }
        }

        return columna
      })
    }
  }, [roles, cargos, areas, conRol])

  return (
    <div className="flex flex-col gap-3">
      {capacidades.includes('create') && (
        <div className="flex justify-end">
          <Boton tamano="chico" variante="primario" onClick={() => { setCreando(true) }}>
            Nueva persona
          </Boton>
        </div>
      )}

      <TablaRecurso
        definicion={definicion}
        inicial={inicial}
        capacidades={capacidades}
        {...(opcionesDeFiltro === undefined ? {} : { opcionesDeFiltro })}
        claveFila={(persona) => persona.id}
        filaExtra={(persona, recargar) => (
          <AccionesPersona
            persona={persona}
            roles={roles}
            modeloDePermisos={modeloDePermisos}
            cargos={cargos}
            areas={areas}
            capacidades={capacidades}
            recargar={recargar}
          />
        )}
      />

      {capacidades.includes('create') && (
        <FormularioRecurso
          abierto={creando}
          onAbiertoCambia={setCreando}
          titulo="Nueva persona"
          descripcion="No se envía ningún correo: la contraseña hay que entregarla por otro medio."
          campos={camposDePersona(roles, cargos, areas, true, conRol)}
          ruta="staff"
          metodo="POST"
          onGuardado={() => { router.refresh() }}
        />
      )}
    </div>
  )
}
