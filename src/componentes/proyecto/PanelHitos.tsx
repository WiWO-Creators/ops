'use client'

import { Suspense, useCallback, useMemo, useState, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { Cargando } from '@/componentes/estado/Estados'
import { definicionDeHitos } from '@/definiciones/hitos'
import { GLOSARIO } from '@/dominio/glosario'
import { AccionesFila } from './AccionesFila'
import { AltaDeHito } from './AltaDeHito'
import { AvanceDeHito, VencimientoDeHito } from '@/componentes/presentadores/Hito'
import { ModalTarea } from './ModalTarea'
import { PanelRecurso } from './PanelRecurso'
import { TableroHitos } from './TableroHitos'
import type { CampoFormulario } from './formulario'
import type { HitoDetallado } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { Columna, DefinicionRecurso } from '@/definiciones/tipos'
import type { FuenteDeProyecto } from '@/dominio/fuente-proyecto'

/**
 * Pestaña Hitos: tabla y kanban, con el alternador en la URL.
 *
 * **La misma la abren el equipo y el cliente.** Lo unico que cambia es de donde bajan los datos
 * —`fuente`— y que ofrece cada contrato, y eso lo resuelve `definicionDeHitos` en la capa de
 * definiciones: acá no hay ninguna rama por sujeto. Con `capacidades={[]}` desaparecen el alta y las
 * acciones por fila, y sin kanban desaparece el alternador de vistas.
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

/**
 * Las dos lecturas de los hitos. `tablero` es la de por defecto, pero se dibuja segunda: el orden
 * del control es el mismo en todo el producto —tabla, despues tablero— y no el de la preferencia de
 * cada pantalla, que es lo que hacia que el mismo control cambiara de forma al cambiar de pestaña.
 */
const VISTAS: readonly OpcionSegmentada[] = [
  { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla' },
  { valor: 'tablero', etiqueta: 'Tablero', icono: 'tablero' }
]

/** Lo minimo del Proyecto que la pestaña usa: las cotas de fecha del alta y el nombre del kanban. */
interface ProyectoDeHitos {
  id: number
  name: string
  start_date: string | null
  deadline: string | null
}

interface PropsPanelHitos {
  proyecto: ProyectoDeHitos
  /** De donde bajan los Hitos de este Proyecto. Ver `dominio/fuente-proyecto.ts`. */
  fuente: FuenteDeProyecto
  /** Capacidades sobre `projects`, de `permissions` de `/me`. */
  capacidades: Capacidad[]
  /**
   * Capacidades sobre `tasks`, de `permissions` de `/me`.
   *
   * Son otras que las del Espacio y no se pueden deducir de ellas: mandan sobre el "+" del kanban,
   * sobre el menu de estado de cada tarjeta y sobre los botones del detalle de una tarea. Vacias, la
   * pestaña sigue funcionando en solo lectura.
   */
  capacidadesTareas?: Capacidad[]
}

export function PanelHitos (props: PropsPanelHitos): ReactElement {
  // Lee `useSearchParams`: sin este limite de Suspense el build de la pagina falla.
  return (
    <Suspense fallback={<Cargando mensaje="Cargando los hitos…" />}>
      <HitosDelProyecto {...props} />
    </Suspense>
  )
}

function HitosDelProyecto ({
  proyecto,
  fuente,
  capacidades,
  capacidadesTareas = []
}: PropsPanelHitos): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [creando, setCreando] = useState(false)

  // Memoizado: `PanelRecurso` vuelve a pedir la pagina cada vez que cambia la identidad de la
  // definicion, y sin esto cada render dispararia una peticion nueva.
  const { definicion: base, conTablero } = useMemo(
    () => definicionDeHitos(fuente, proyecto.id),
    [fuente, proyecto.id]
  )
  // Sin kanban la unica lectura es la tabla, y el parametro de la URL no puede pedir una vista que
  // el contrato no tiene.
  const vista = !conTablero || params.get('vistaHitos') === 'tabla' ? 'tabla' : 'tablero'
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
    () => definicionDeTablaHitos(base, proyecto.id, campos, puedeEditar, capacidades.includes('delete'), recargar),
    [base, proyecto.id, campos, puedeEditar, capacidades, recargar]
  )

  const barra = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {conTablero && (
        <Segmentado
          etiqueta="Vista de hitos"
          opciones={VISTAS}
          activo={vista}
          onElegir={(valor) => { cambiar('vistaHitos', valor) }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* Solo lo lee el kanban: en la tabla el filtro por estado es una columna de la definicion,
            y un control que no cambia nada de lo que se ve es peor que no tenerlo. */}
        {conTablero && (
          <label className="text-texto-tenue flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={excluirCompletadas}
              onChange={(evento) => { cambiar('excluirCompletadas', evento.target.checked ? 'si' : 'no') }}
              className="accent-acento size-4"
            />
            Excluir {GLOSARIO.proceso.plural.toLowerCase()} completadas
          </label>
        )}

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
            rutaLookups={fuente.lookups}
            board={conTablero ? 'milestones-tabla' : undefined}
          />
          )
        : (
          <>
            {barra}
            <TableroHitos
              key={`${revision}-${String(excluirCompletadas)}`}
              proyectoId={proyecto.id}
              proyectoNombre={proyecto.name}
              excluirCompletadas={excluirCompletadas}
              puedeCrear={capacidadesTareas.includes('create')}
              puedeEditar={capacidades.includes('edit_milestones')}
              puedeEditarTareas={capacidadesTareas.includes('edit')}
            />
          </>
          )}

      {/* Una sola vez y fuera del ternario: las tarjetas del kanban enlazan a `?tarea={id}` y el
          detalle tiene que abrirse tambien desde la tabla, donde el nombre del hito no lleva a
          ninguna tarea pero la URL puede venir compartida con el parametro puesto. */}
      <ModalTarea
        fuente={fuente}
        puedeEditar={capacidadesTareas.includes('edit')}
        puedeBorrar={capacidadesTareas.includes('delete')}
        puedeCrear={capacidadesTareas.includes('create')}
      />

      {/* El alta del hito y la del hito desde plantilla son la misma: `AltaDeHito` es este mismo
          `FormularioRecurso` con el desplegable de plantilla y la lista de lo que va a crear. */}
      <AltaDeHito
        abierto={creando}
        onAbiertoCambia={setCreando}
        campos={campos}
        proyectoId={proyecto.id}
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
function camposDeHito (proyecto: ProyectoDeHitos): CampoFormulario[] {
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
    // `omitirSiVacio` y no un `0`: dejarlo en blanco quiere decir "ponlo al final", y el backend ya
    // sabe hacerlo (`ultimo + 1`). Sin esto el campo vacio viaja como `null` y el alta muere con un
    // `422 order integer` por un dato que nadie eligio.
    { clave: 'order', etiqueta: 'Orden', tipo: 'numero', ayuda: 'Vacío lo pone al final.', omitirSiVacio: true }
  ]
}

/**
 * La definicion de Hitos del sujeto, con avance, marca de vencido y acciones por fila.
 *
 * @param base la definicion que eligio `definicionDeHitos`, con la ruta y las columnas del contrato
 * @param proyectoId el proyecto que se esta mirando
 * @param campos descripcion del formulario de edicion, con las cotas de fecha del proyecto
 * @param puedeEditar habilita el boton de editar
 * @param puedeBorrar habilita el boton de eliminar
 * @param recargar se llama despues de escribir, para que la tabla vuelva a pedir la pagina
 * @returns la definicion lista para `PanelRecurso`
 */
function definicionDeTablaHitos (
  base: DefinicionRecurso<HitoDetallado>,
  proyectoId: number,
  campos: CampoFormulario[],
  puedeEditar: boolean,
  puedeBorrar: boolean,
  recargar: () => void
): DefinicionRecurso<HitoDetallado> {
  const columnas: Array<Columna<HitoDetallado>> = base.columnas.map((columna) => {
    if (columna.clave === 'due_date') {
      return { ...columna, presentar: (h: HitoDetallado) => <VencimientoDeHito hito={h} /> }
    }
    if (columna.clave === 'avance') {
      return { ...columna, presentar: (h: HitoDetallado) => <AvanceDeHito hito={h} /> }
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

  return { ...base, columnas }
}

