'use client'

import { Suspense, useCallback, useMemo, useState, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando } from '@/componentes/estado/Estados'
import { HITOS } from '@/definiciones/hitos'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearFecha } from '@/lib/fechas'
import { AccionesFila } from './AccionesFila'
import { BarraProgreso } from './CabeceraProyecto'
import { FormularioRecurso } from './FormularioRecurso'
import { PanelRecurso } from './PanelRecurso'
import { TableroHitos } from './TableroHitos'
import { avanceDeHito } from './hitos'
import type { CampoFormulario } from './formulario'
import type { Espacio, HitoDetallado } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Pestaña Hitos: tabla y kanban, con el alternador en la URL.
 *
 * La vista elegida viaja en `?vistaHitos=tabla|tablero` y no en `useState` por la misma razon que el
 * resto del estado de las vistas: asi se comparte por enlace y "atras" hace lo que la persona espera.
 * El panel viejo no persistia la preferencia y volvia al kanban en cada recarga; aca no hace falta
 * elegir entre las dos cosas.
 *
 * **Desviacion deliberada del panel viejo**: el checkbox "Excluir tareas completadas" arranca
 * **apagado**. En el panel arranca encendido (`Projects.php:296`: sin parametro, excluye), y eso
 * confunde: al entrar a la pestaña se ven menos tareas de las que el proyecto tiene, sin nada que
 * explique por que, y el tablero de un proyecto terminado aparece vacio. Se invierte el valor por
 * defecto para que la primera pantalla muestre todo y esconder sea una decision explicita.
 *
 * Por eso `excluirCompletadas` se manda **siempre** a la API en vez de omitir el parametro: el
 * endpoint tiene su propio valor por defecto (`excluir_completadas` es `true` cuando no viaja), asi
 * que confiar en el nos devolveria justo el comportamiento que se esta corrigiendo.
 */

interface PropsPanelHitos {
  proyecto: Espacio
  /** Capacidades sobre `projects`, de `permissions` de `/me`. */
  capacidades: Capacidad[]
}

export function PanelHitos (props: PropsPanelHitos): ReactElement {
  // Lee `useSearchParams`: sin este limite de Suspense el build de la pagina falla.
  return (
    <Suspense fallback={<Cargando mensaje="Cargando los hitos…" />}>
      <HitosDelProyecto {...props} />
    </Suspense>
  )
}

function HitosDelProyecto ({ proyecto, capacidades }: PropsPanelHitos): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [creando, setCreando] = useState(false)

  const vista = params.get('vistaHitos') === 'tabla' ? 'tabla' : 'tablero'
  // Sin parametro se muestra todo: hay que pedir `si` para esconder las completadas.
  const excluirCompletadas = params.get('excluirCompletadas') === 'si'
  const puedeEditar = capacidades.includes('edit')
  const puedeCrear = capacidades.includes('create')

  const recargar = useCallback(() => { setRevision((n) => n + 1) }, [])

  /** Escribe un parametro de la pestaña conservando el resto de la vista. */
  function cambiar (clave: string, valor: string): void {
    const siguientes = new URLSearchParams(params.toString())
    siguientes.set(clave, valor)

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  const campos = useMemo(() => camposDeHito(proyecto), [proyecto])

  const definicion = useMemo(
    () => definicionDeTablaHitos(proyecto.id, campos, puedeEditar, capacidades.includes('delete'), recargar),
    [proyecto.id, campos, puedeEditar, capacidades, recargar]
  )

  const barra = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Vista de hitos" className="flex gap-1">
        {(['tablero', 'tabla'] as const).map((opcion) => (
          <button
            key={opcion}
            type="button"
            aria-pressed={opcion === vista}
            onClick={() => { cambiar('vistaHitos', opcion) }}
            className={cn(
              'rounded-control px-3 py-1 text-xs font-medium transition-colors',
              opcion === vista ? 'bg-seleccionado text-texto' : 'text-texto-tenue hover:bg-hover hover:text-texto'
            )}
          >
            {opcion === 'tablero' ? 'Tablero' : 'Tabla'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-texto-tenue flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={excluirCompletadas}
            onChange={(evento) => { cambiar('excluirCompletadas', evento.target.checked ? 'si' : 'no') }}
            className="accent-acento size-4"
          />
          Excluir {GLOSARIO.proceso.plural.toLowerCase()} completadas
        </label>

        {puedeCrear && (
          <Boton variante="primario" tamano="chico" onClick={() => { setCreando(true) }}>
            Nuevo {GLOSARIO.hito.singular.toLowerCase()}
          </Boton>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {vista === 'tabla'
        ? (
          <PanelRecurso
            definicion={definicion}
            claveFila={(hito) => hito.id}
            capacidades={capacidades}
            barra={barra}
            revision={revision}
          />
          )
        : (
          <>
            {barra}
            <TableroHitos
              key={`${revision}-${String(excluirCompletadas)}`}
              proyectoId={proyecto.id}
              excluirCompletadas={excluirCompletadas}
            />
          </>
          )}

      <FormularioRecurso
        abierto={creando}
        onAbiertoCambia={setCreando}
        titulo={`Nuevo ${GLOSARIO.hito.singular.toLowerCase()}`}
        campos={campos}
        ruta={`projects/${proyecto.id}/milestones`}
        metodo="POST"
        onGuardado={recargar}
      />
    </div>
  )
}

/**
 * Campos del formulario de hito, con las cotas de fecha del proyecto.
 *
 * Las validaciones son las del panel: el hito no puede empezar antes que el proyecto ni vencer
 * despues de su fecha limite. Se comprueban tambien aca para no gastar un viaje a la API en un error
 * que se ve desde el navegador.
 *
 * @param proyecto el espacio, del que salen las cotas
 * @returns la descripcion de campos para `FormularioRecurso`
 */
function camposDeHito (proyecto: Espacio): CampoFormulario[] {
  const inicio = proyecto.start_date ?? undefined
  const limite = proyecto.deadline ?? undefined

  return [
    { clave: 'name', etiqueta: 'Nombre', tipo: 'texto', requerido: true, maximo: 100 },
    {
      clave: 'start_date',
      etiqueta: 'Fecha de inicio',
      tipo: 'fecha',
      requerido: true,
      ...(inicio === undefined ? {} : { min: inicio })
    },
    {
      clave: 'due_date',
      etiqueta: 'Fecha de vencimiento',
      tipo: 'fecha',
      requerido: true,
      ...(inicio === undefined ? {} : { min: inicio }),
      ...(limite === undefined ? {} : { max: limite })
    },
    { clave: 'description', etiqueta: 'Descripción', tipo: 'area' },
    { clave: 'description_visible_to_customer', etiqueta: 'Descripción visible para el cliente', tipo: 'booleano' },
    { clave: 'hide_from_customer', etiqueta: 'Ocultar al cliente', tipo: 'booleano' },
    { clave: 'color', etiqueta: 'Color', tipo: 'color' },
    { clave: 'order', etiqueta: 'Orden', tipo: 'numero' }
  ]
}

/**
 * La definicion de Hitos acotada al proyecto, con avance, marca de vencido y acciones por fila.
 *
 * @param proyectoId el proyecto que se esta mirando
 * @param campos descripcion del formulario de edicion, con las cotas de fecha del proyecto
 * @param puedeEditar habilita el boton de editar
 * @param puedeBorrar habilita el boton de eliminar
 * @param recargar se llama despues de escribir, para que la tabla vuelva a pedir la pagina
 * @returns la definicion lista para `PanelRecurso`
 */
function definicionDeTablaHitos (
  proyectoId: number,
  campos: CampoFormulario[],
  puedeEditar: boolean,
  puedeBorrar: boolean,
  recargar: () => void
): DefinicionRecurso<HitoDetallado> {
  const columnas = HITOS.columnas.map((columna) => {
    if (columna.clave === 'due_date') {
      return { ...columna, presentar: (h: HitoDetallado) => <Vencimiento hito={h} /> }
    }
    if (columna.clave === 'avance') {
      return { ...columna, presentar: (h: HitoDetallado) => <Avance hito={h} /> }
    }
    return columna
  })

  if (puedeEditar || puedeBorrar) {
    columnas.push({
      clave: 'acciones',
      encabezado: 'Acciones',
      presentar: (h: HitoDetallado) => (
        <AccionesFila
          tituloEdicion={`Editar ${GLOSARIO.hito.singular.toLowerCase()}`}
          campos={campos}
          registro={h as unknown as Record<string, unknown>}
          ruta={`projects/${proyectoId}/milestones/${h.id}`}
          puedeEditar={puedeEditar}
          puedeBorrar={puedeBorrar}
          tituloBorrado={`Eliminar ${GLOSARIO.hito.singular.toLowerCase()}`}
          advertencia={`Las ${GLOSARIO.proceso.plural.toLowerCase()} de "${h.name}" no se borran: pasan a "Sin categorizar".`}
          recargar={recargar}
        />
      )
    })
  }

  return {
    ...HITOS,
    ruta: `projects/${encodeURIComponent(String(proyectoId))}/milestones`,
    columnas
  }
}

/** Fecha de vencimiento con la marca de vencido, igual que en el panel. */
function Vencimiento ({ hito }: { hito: HitoDetallado }): ReactElement {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={hito.vencido ? 'text-texto-peligro' : undefined}>
        {formatearFecha(hito.due_date)}
      </span>
      {hito.vencido && (
        <span className="bg-relleno-peligro text-relleno-peligro-contenido rounded-control px-2 py-0.5 text-[0.6875rem] font-semibold">
          Vencido
        </span>
      )}
    </span>
  )
}

/** Avance del hito: barra y contador. Sin tareas no hay barra, porque no hay nada que medir. */
function Avance ({ hito }: { hito: HitoDetallado }): ReactElement {
  const avance = avanceDeHito(hito.counts)

  if (avance === null) return <span className="text-texto-sutil text-xs">Sin {GLOSARIO.proceso.plural.toLowerCase()}</span>

  return (
    <span className="flex min-w-24 items-center gap-2">
      <BarraProgreso porcentaje={avance} className="min-w-0 flex-1" />
      <span data-numerico className="text-texto-tenue text-xs">
        {hito.counts.tasks_done}/{hito.counts.tasks}
      </span>
    </span>
  )
}
