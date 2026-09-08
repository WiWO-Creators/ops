'use client'

import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useSearchParams } from 'next/navigation'
import { VistaCalendario } from '@/componentes/datos/VistaCalendario'
import { Cargando } from '@/componentes/estado/Estados'
import { pedirSobre } from '@/datos/cliente'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import { esDiaValido, leerVista, rangoDeVista, TOPE_POR_VISTA } from '@/dominio/calendario'
import { hoyLocal } from '@/lib/fechas'
import type { Proceso, ProcesoAmpliado } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Calendario de la pestaña Tareas de un Espacio: la tercera lectura, junto a la tabla y el tablero.
 *
 * **No dibuja ninguna grilla**: monta la misma `VistaCalendario` que usa `/procesos/calendario` y la
 * misma aritmetica de `dominio/calendario.ts`. Lo unico propio es de donde bajan los datos: aca se
 * piden desde el navegador, porque la pestaña recibe un id y no una respuesta ya resuelta.
 *
 * **Contra la ruta acotada del Espacio** (`projects/{id}/tasks`, la de `definicion.ruta`) y nunca
 * contra `/tasks` con un `filter[project_id]`: el filtro visible se edita en la URL y dejaria ver las
 * tareas de otro Espacio. El backend inyecta la pertenencia, no esta pantalla.
 *
 * **Sin alertas de vencimiento**: `GET /me/vencimientos` es global —las tareas propias de todos los
 * Espacios— y colgarlas de la pestaña de uno mostraria plazos ajenos a lo que se esta mirando. Ese
 * bloque se queda en el calendario global, que es donde la pregunta "que me vence" tiene sentido.
 *
 * **Sin desplegables propios**: hereda los filtros que ya estan puestos en la URL —los de la tabla y
 * las tarjetas de resumen de arriba—, asi que cambiar de presentacion no cambia lo que se ve. El de
 * Espacio no existe aca por definicion, y ninguno nuevo se inventa.
 */

/**
 * Clave de la URL donde viaja dia/semana.
 *
 * No es `vista` porque en esta pestaña esa clave ya la ocupa la presentacion (tabla, tablero,
 * calendario). En el calendario global, que es una ruta propia, `vista` sigue siendo dia/semana.
 */
const CLAVE_MODO = 'modo'

/** Lo que se le muestra a la grilla. Los errores son textos listos, no envelopes. */
interface Carga {
  tareas: Proceso[]
  errorTareas: string | null
  sinVencimiento: Proceso[]
  errorSinVencimiento: string | null
}

interface PropsCalendarioTareas {
  /** La definicion ya acotada al Espacio: aporta la ruta y la whitelist de filtros. */
  definicion: DefinicionRecurso<ProcesoAmpliado>
  /** Capacidades sobre `tasks`. Viajan a la grilla para los enlaces al detalle. */
  capacidades: Capacidad[]
}

export function CalendarioTareas ({ definicion, capacidades }: PropsCalendarioTareas): ReactElement {
  const params = useSearchParams()

  const pedido = params.get('dia') ?? ''
  const dia = esDiaValido(pedido) ? pedido : hoyLocal()
  const vista = leerVista(params.get(CLAVE_MODO))

  // Se guarda junto a la ruta que la produjo: asi "todavia no llego lo de este periodo" se deduce
  // comparando, sin un `setCarga(null)` dentro del efecto que encadenaria un render de mas.
  const [carga, setCarga] = useState<{ para: string, datos: Carga } | null>(null)

  // Se memoizan las dos rutas y no el objeto: son las dependencias del efecto, y dos textos iguales
  // no vuelven a pedir nada aunque `params` sea otro objeto.
  const [rutaVencen, rutaArrancan] = useMemo(
    () => rutasDelPeriodo(definicion, params.toString(), dia, vista),
    [definicion, params, dia, vista]
  )

  useEffect(() => {
    const control = new AbortController()

    void Promise.all([
      pedirOpcional<Proceso[]>(rutaVencen, control.signal),
      pedirOpcional<Proceso[]>(rutaArrancan, control.signal)
    ]).then(([vencen, arrancan]) => {
      if (control.signal.aborted) return

      setCarga({
        para: rutaVencen,
        datos: {
          tareas: vencen.datos ?? [],
          errorTareas: vencen.error,
          // La API no ofrece "vencimiento vacio" como filtro: se separa aca sobre lo que arranca en
          // el periodo, que ya viene acotado por el rango y por los filtros vigentes.
          sinVencimiento: (arrancan.datos ?? []).filter((tarea) => tarea.due_date === null),
          errorSinVencimiento: arrancan.error
        }
      })
    })

    return () => { control.abort() }
  }, [rutaVencen, rutaArrancan])

  // Mientras lo que hay en mano sea de otro periodo o de otros filtros, se muestra la carga: pintar
  // la semana anterior bajo el titulo nuevo diria algo que no es.
  if (carga === null || carga.para !== rutaVencen) return <Cargando mensaje="Cargando el calendario…" />

  const { tareas, sinVencimiento, errorTareas, errorSinVencimiento } = carga.datos

  return (
    <VistaCalendario
      dia={dia}
      vista={vista}
      tareas={tareas}
      sinVencimiento={sinVencimiento}
      errorSinVencimiento={errorSinVencimiento}
      errorTareas={errorTareas}
      truncado={tareas.length >= TOPE_POR_VISTA}
      claveVista={CLAVE_MODO}
      // El detalle lo dibuja `PanelTareas` una sola vez para las tres presentaciones.
      conModal={false}
      capacidades={capacidades}
    />
  )
}

/**
 * Las dos rutas que hay que pedir para pintar el periodo.
 *
 * Son dos y no una porque los rangos de fecha comparan contra una columna: una tarea con `due_date`
 * en NULL no entra en la consulta del vencimiento y desapareceria sin decir nada. La segunda
 * pregunta por lo que EMPIEZA en el periodo. Pedir los cuatro filtros juntos no sirve: se combinan
 * con AND y acotarian a lo que empieza **y** vence dentro del rango.
 *
 * El filtro "Vence" de la tabla se descarta: aca ese rango ES el periodo, y dejarlo pondria un
 * `filter[date_from]` peleando con el que arma esta funcion. En la URL se queda, para que volver a
 * la tabla lo devuelva tal como estaba.
 *
 * @param definicion La definicion acotada al Espacio: ruta y whitelist de filtros.
 * @param consulta Los parametros de la URL, en crudo.
 * @param dia Dia ancla del periodo, ya validado.
 * @param vista Dia o semana.
 * @returns La ruta de lo que vence y la de lo que arranca, en ese orden.
 */
function rutasDelPeriodo (
  definicion: DefinicionRecurso<ProcesoAmpliado>,
  consulta: string,
  dia: string,
  vista: 'dia' | 'semana'
): [string, string] {
  // `dia` ya paso por `esDiaValido`, asi que el rango nunca es null; el `??` es para el tipo.
  const rango = rangoDeVista(dia, vista) ?? { desde: dia, hasta: dia }

  const estado = leerConsulta(new URLSearchParams(consulta), definicion)
  const { vence: _vence, ...filtrosSinRango } = estado.filtros

  // Sin orden ni pagina: el calendario reparte por dia, no pagina. El `per_page` de la tabla tampoco
  // sirve —25 filas dejarian medio periodo afuera— y se pisa con el tope del backend.
  const comunes = new URLSearchParams(
    construirConsulta({ ...estado, filtros: filtrosSinRango, orden: [], pagina: 1 }, definicion)
  )
  comunes.set('per_page', String(TOPE_POR_VISTA))

  const porVencer = new URLSearchParams(comunes)
  porVencer.set('filter[date_from]', rango.desde)
  porVencer.set('filter[date_to]', rango.hasta)
  porVencer.set('sort', 'due_date')

  const porEmpezar = new URLSearchParams(comunes)
  porEmpezar.set('filter[start_from]', rango.desde)
  porEmpezar.set('filter[start_to]', rango.hasta)
  porEmpezar.set('sort', 'start_date')

  return [`${definicion.ruta}?${porVencer.toString()}`, `${definicion.ruta}?${porEmpezar.toString()}`]
}

/**
 * Pide un listado sin dejar que su fallo tumbe la pantalla.
 *
 * Es la version de navegador de `pedirOpcional` del servidor: el calendario dibuja el error donde
 * corresponde —el listado con su estado de error, las tareas sin vencimiento con una linea— en vez
 * de quedar en blanco.
 *
 * @param ruta Ruta del BFF, con su query.
 * @param senal Aborta la peticion si el componente se desmonta.
 * @returns Los datos, o el mensaje legible del fallo.
 */
async function pedirOpcional<T> (
  ruta: string,
  senal: AbortSignal
): Promise<{ datos: T | null, error: string | null }> {
  try {
    return { datos: (await pedirSobre<T>(ruta, senal)).data, error: null }
  } catch (fallo) {
    // Un aborto no es un error que mostrar: el componente ya no esta mirando esta respuesta.
    if (senal.aborted) return { datos: null, error: null }

    return {
      datos: null,
      error: fallo instanceof Error ? fallo.message : 'No se pudo cargar el calendario.'
    }
  }
}
