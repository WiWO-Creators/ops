'use client'

import { useMemo } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { CatalogoAuditoria, RegistroAuditoria } from '@/datos/auditoria'
import { TIPOS_AUDITORIA } from '@/datos/auditoria'
import { AUDITORIA } from '@/definiciones/auditoria'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'

/**
 * Historial de acciones, sobre el motor de tabla del proyecto.
 *
 * Lo propio de esta pantalla son dos cosas y nada más:
 *
 *   1. **Las opciones de los filtros salen de `GET /audit/filters`**, no de `/lookups`: los tipos los
 *      deriva el backend del texto de cada fila y los actores son los nombres que hay escritos en la
 *      tabla. Ninguno de los dos es un catálogo configurable de Perfex, así que no tienen dónde vivir
 *      en `lookups`. Llegan con su volumen y se muestra: saber que "Correo enviado" son 2.442 filas
 *      es lo que le explica a quien mira por qué conviene filtrar antes de leer.
 *   2. **El tipo se pinta como insignia con tono**, para que suplantaciones y accesos fallidos salten
 *      sin leer la columna. El presentador de la definición sigue devolviendo texto para que la
 *      exportación a CSV no se lleve JSX.
 *
 * La definición se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una
 * definición nueva en cada render vuelve a pedir la página en bucle.
 */
export function VistaHistorial ({
  inicial,
  catalogo
}: {
  inicial: ResultadoLista<RegistroAuditoria>
  catalogo: CatalogoAuditoria | null
}) {
  const definicion = useMemo(() => {
    const tipos: OpcionFiltro[] = (catalogo?.types ?? []).map((tipo) => ({
      valor: tipo.type,
      etiqueta: `${TIPOS_AUDITORIA[tipo.type]?.etiqueta ?? tipo.type} (${tipo.count})`
    }))

    // El actor `null` no se ofrece como opción: la API filtra por igualdad sobre un `varchar`, y no
    // hay valor de texto que signifique "las filas sin autor". Ofrecerlo daría una lista vacía que
    // parece un error y es un filtro que no existe.
    const actores: OpcionFiltro[] = (catalogo?.actors ?? [])
      .filter((entrada): entrada is { actor: string, count: number } => entrada.actor !== null)
      .map((entrada) => ({ valor: entrada.actor, etiqueta: `${entrada.actor} (${entrada.count})` }))

    return {
      ...AUDITORIA,
      filtros: AUDITORIA.filtros.map((filtro) => {
        if (filtro.clave === 'type') return { ...filtro, opciones: tipos }
        if (filtro.clave === 'actor') return { ...filtro, opciones: actores }

        return filtro
      }),
      columnas: AUDITORIA.columnas.map((columna) => {
        if (columna.clave !== 'type') return columna

        return {
          ...columna,
          presentar: (fila: RegistroAuditoria) => {
            const tipo = TIPOS_AUDITORIA[fila.type]

            return (
              <Insignia tono={tipo?.tono ?? 'contorno'} tamano="chico">
                {tipo?.etiqueta ?? fila.type}
              </Insignia>
            )
          }
        }
      })
    }
  }, [catalogo])

  return (
    <TablaRecurso
      definicion={definicion}
      inicial={inicial}
      claveFila={(fila) => fila.id}
    />
  )
}
