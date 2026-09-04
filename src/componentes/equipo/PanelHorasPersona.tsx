'use client'

import { useMemo, type ReactElement } from 'react'
import { PanelRecurso } from '@/componentes/proyecto/PanelRecurso'
import { Metrica } from '@/componentes/proyecto/ResumenProyecto'
import { segundosAHoraMinuto } from '@/componentes/proyecto/formatos'
import { HORAS_PERSONA } from '@/definiciones/horas-persona'
import type { TiempoDePersona } from '@/datos/recursos'

/**
 * Pestaña Horas de la ficha de una persona.
 *
 * Arriba los tres totales que ya trae la ficha —no cuestan una petición— y debajo el detalle, que sí
 * la cuesta y solo cuando alguien abre la pestaña. Son el mismo dato en dos escalas: los totales
 * responden «cuánto trabajó» y la tabla, «en qué».
 *
 * La tabla es de solo lectura a propósito. Registrar y corregir horas vive en el Proyecto, que es
 * donde el backend decide fila por fila quién puede editar y quién no (`puede_editar`,
 * `puede_borrar`); repetir esos botones acá sería repetir esa lógica.
 *
 * @param personaId de quién son las horas
 * @param tiempo el bloque `tiempo` de `GET /staff/{id}`, ya cargado por la página
 */
export function PanelHorasPersona ({
  personaId,
  tiempo
}: {
  personaId: number
  tiempo: TiempoDePersona
}): ReactElement {
  const definicion = useMemo(
    () => ({ ...HORAS_PERSONA, ruta: `staff/${encodeURIComponent(String(personaId))}/timesheets` }),
    [personaId]
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
        <Metrica etiqueta="Esta semana" valor={segundosAHoraMinuto(tiempo.esta_semana_segundos)} />
        <Metrica etiqueta="Este mes" valor={segundosAHoraMinuto(tiempo.este_mes_segundos)} />
        <Metrica etiqueta="Total registrado" valor={segundosAHoraMinuto(tiempo.total_segundos)} />
      </div>

      <PanelRecurso definicion={definicion} claveFila={(registro) => registro.id} />
    </div>
  )
}
