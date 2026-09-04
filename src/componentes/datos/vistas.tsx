'use client'

import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { PROCESOS_NAVEGABLES } from './procesos-navegables'
import { TablaRecurso } from './TablaRecurso'
import { TableroFiltrable } from './TableroFiltrable'
import { CLIENTES } from '@/definiciones/clientes'
import { ESPACIOS } from '@/definiciones/espacios'
import { PROCESOS } from '@/definiciones/procesos'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type { Capacidad } from '@/datos/tipos'
import type { Cliente, Espacio, Proceso } from '@/datos/recursos'

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
      <ModalTarea />
    </>
  )
}

export function TablaEspacios (props: PropsVistaLista<Espacio>) {
  return <TablaRecurso definicion={ESPACIOS} claveFila={(espacio) => espacio.id} {...props} />
}

export function TablaClientes (props: PropsVistaLista<Cliente>) {
  return <TablaRecurso definicion={CLIENTES} claveFila={(cliente) => cliente.id} {...props} />
}

export function TableroProcesos (props: { opcionesDeFiltro?: Record<string, OpcionFiltro[]> }) {
  return <TableroFiltrable<Proceso> definicion={PROCESOS} ruta="tasks" board="tasks" {...props} />
}
