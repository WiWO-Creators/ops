'use client'

import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { PROCESOS_NAVEGABLES } from './procesos-navegables'
import { TablaRecurso } from './TablaRecurso'
import { TableroFiltrable } from './TableroFiltrable'
import { CLIENTES } from '@/definiciones/clientes'
import { ESPACIOS } from '@/definiciones/espacios'
import { PROCESOS } from '@/definiciones/procesos'
import { TarjetaTarea } from '@/componentes/proyecto/TarjetaTarea'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type { Capacidad } from '@/datos/tipos'
import type { Cliente, Espacio, Proceso, ProcesoAmpliado } from '@/datos/recursos'

/**
 * Vistas ya atadas a su definicion.
 *
 * Existen por una restriccion de React, no por gusto: **una funcion no puede cruzar de un Server
 * Component a uno cliente**, y una `DefinicionRecurso` esta llena de ellas (`presentar` en cada
 * columna, `presentarTarjeta` en el tablero). Pasar la definicion como prop desde una pagina de
 * servidor falla en tiempo de ejecucion con "Functions cannot be passed directly to Client
 * Components".
 *
 * La solucion es que la definicion **se importe de este lado de la frontera**. Estos envoltorios son
 * modulos cliente, asi que la pagina de servidor solo manda datos serializables —filas, paginacion,
 * capacidades, opciones— y la definicion nunca viaja.
 *
 * Al agregar un modulo se agrega su envoltorio aca. Es una linea por recurso, y es el precio de
 * mantener las definiciones declarativas con presentadores de verdad en vez de cadenas magicas.
 */

interface PropsVistaLista<T> {
  inicial: ResultadoLista<T>
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}

/**
 * Tabla global de Tareas, navegable.
 *
 * Usa `PROCESOS_NAVEGABLES` —la misma definicion, con el nombre y el espacio como enlaces— y monta el
 * mismo modal de detalle que la pestaña de Tareas de un proyecto: una tarea abierta se ve igual venga
 * de donde venga, y su URL es la misma.
 */
export function TablaProcesos (props: PropsVistaLista<Proceso>) {
  return (
    <>
      <TablaRecurso
        definicion={PROCESOS_NAVEGABLES}
        claveFila={(proceso) => proceso.id}
        abrirEn={{ clave: PARAMETRO_TAREA, valor: (proceso) => proceso.id }}
        {...props}
      />
      <ModalTarea
        puedeEditar={props.capacidades?.includes('edit') ?? false}
        puedeBorrar={props.capacidades?.includes('delete') ?? false}
      />
    </>
  )
}

export function TablaEspacios (props: PropsVistaLista<Espacio>) {
  return <TablaRecurso definicion={ESPACIOS} claveFila={(espacio) => espacio.id} {...props} />
}

export function TablaClientes (props: PropsVistaLista<Cliente>) {
  return <TablaRecurso definicion={CLIENTES} claveFila={(cliente) => cliente.id} {...props} />
}

/**
 * Tablero global de Tareas.
 *
 * Monta el mismo modal de detalle que la tabla y pinta la misma `TarjetaTarea` que el tablero de un
 * Espacio: hasta ahora este era el unico listado del producto donde una tarjeta no abria nada, y
 * ademas mostraba el nombre pelado.
 *
 * El modal se monta **aca y no dentro de `TableroFiltrable`** porque la pestaña Tareas de un Espacio
 * ya lo monta por su cuenta —fuera del ternario tabla/tablero, para que la tabla tambien lo tenga—:
 * ponerlo tambien en el motor abriria dos dialogos con el mismo `?tarea={id}`, dos peticiones del
 * detalle y dos trampas de foco peleandose.
 */
export function TableroProcesos (
  { opcionesDeFiltro, capacidades = [] }: {
    opcionesDeFiltro?: Record<string, OpcionFiltro[]>
    /** Capacidades sobre `tasks`, para los botones del detalle. */
    capacidades?: Capacidad[]
  }
) {
  return (
    <>
      <TableroFiltrable<Proceso>
        definicion={definicionDeTableroProcesos(opcionesDeFiltro?.task_priorities ?? [])}
        ruta="tasks"
        board="tasks"
        opcionesDeFiltro={opcionesDeFiltro}
      />
      <ModalTarea
        puedeEditar={capacidades.includes('edit')}
        puedeBorrar={capacidades.includes('delete')}
      />
    </>
  )
}

/**
 * `PROCESOS` con la tarjeta rica en vez del nombre pelado.
 *
 * La sustitucion se hace aca y no en `src/definiciones/procesos.ts` porque ese archivo es un `.ts`
 * que corren las pruebas con el despojador de tipos de Node: no admite JSX. Es el mismo motivo por el
 * que existe `procesos-navegables.tsx`.
 *
 * @param prioridades catalogo de prioridades, para el borde de color de la tarjeta
 * @returns la definicion lista para `TableroFiltrable`
 */
function definicionDeTableroProcesos (prioridades: OpcionFiltro[]): DefinicionRecurso<Proceso> {
  return {
    ...PROCESOS,
    tablero: {
      // Las columnas llegan ordenadas por `order`, NO por `id`: el orden real es 1, 4, 3, 2, 5.
      columnasDesde: 'task_statuses',
      rutaMover: 'tasks/:id/mover',
      // `presentarTarjeta` recibe `unknown` porque el motor no conoce el recurso: la conversion
      // ocurre en un solo punto, aca, y no en cada campo de la tarjeta.
      presentarTarjeta: (fila) => (
        <TarjetaTarea proceso={fila as ProcesoAmpliado} prioridades={prioridades} />
      )
    }
  }
}
