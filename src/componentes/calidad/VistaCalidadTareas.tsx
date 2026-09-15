'use client'

import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { CALIDAD_TAREAS_RICA } from './celdas-calidad'
import type { TareaCalidad } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'

/**
 * El detector de tareas insuficientes, sobre el motor de tabla del proyecto.
 *
 * Es un envoltorio cliente y no una prop de la pagina por la restriccion de siempre: una
 * `DefinicionRecurso` esta llena de funciones —un `presentar` por columna— y **una funcion no puede
 * cruzar de un Server Component a uno cliente**. La definicion se importa de este lado de la
 * frontera y la pagina manda solo datos serializables.
 *
 * Monta el mismo `ModalTarea` que el listado global: quien encuentra aca una descripcion pobre la
 * arregla en la ficha de siempre, sin cambiar de pantalla y sin que exista una segunda ficha de
 * Tarea que mantener. Las capacidades vienen de `permissions.tasks` de `GET /me` y solo deciden que
 * botones se dibujan; quien autoriza de verdad es la API.
 *
 * @param inicial La primera pagina, resuelta en el servidor para que la tabla no parpadee.
 * @param capacidades Lo que quien mira puede hacer sobre Tareas.
 * @param opcionesDeFiltro Catalogos de `/lookups` para los filtros de Proyecto y Responsable.
 */
export function VistaCalidadTareas ({
  inicial,
  capacidades = [],
  opcionesDeFiltro
}: {
  inicial: ResultadoLista<TareaCalidad>
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}) {
  return (
    <>
      <TablaRecurso
        definicion={CALIDAD_TAREAS_RICA}
        inicial={inicial}
        claveFila={(fila) => fila.id}
        abrirEn={{ clave: PARAMETRO_TAREA, valor: (fila) => fila.id }}
        capacidades={capacidades}
        opcionesDeFiltro={opcionesDeFiltro}
      />
      <ModalTarea
        puedeEditar={capacidades.includes('edit')}
        puedeBorrar={capacidades.includes('delete')}
        puedeCrear={capacidades.includes('create')}
      />
    </>
  )
}
