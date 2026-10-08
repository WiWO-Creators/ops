import type { Column, Content, ContentCanvas, Margins } from 'pdfmake/interfaces'
import {
  barrasPorEstado,
  cifrasDelTablero,
  clavesDePrioridad,
  leerAvance,
  novedades,
  pendientesPorHito,
  tramosDePrioridad,
  type BarraDeEstado,
  type Cifra,
  type ClaveDePrioridad,
  type LecturaDeAvance,
  type Novedad,
  type PendientesPorHito,
  type TramoDePrioridad
} from '../componentes/portal/tablero-proyecto.ts'
import type { TableroDelProyecto } from '../datos/portal.ts'
import { formatearFecha } from '../lib/fechas.ts'
import type { CatalogoDeEstados } from './estados-tarea.ts'
import type { ColoresDeMarca } from './exportar-pdf.ts'
import { rotularMes } from './gestion.ts'

/**
 * El informe del tablero de un proyecto, como documento y no como captura de pantalla.
 *
 * Dos pasos, los dos puros para poder probarlos sin navegador:
 *
 *   1. `modeloDelInforme()` decide QUÉ se afirma: qué secciones existen, qué dice el resumen, qué
 *      notas hay que aclarar. Parte del mismo `tablero` que la pantalla dibuja, así que informe y
 *      pantalla no pueden contar historias distintas.
 *   2. `contenidoDelInforme()` decide CÓMO se ve en pdfmake: tablas y barras vectoriales con los
 *      colores de la marca.
 *
 * La regla del tablero se mantiene: un bloque que no llegó (la pestaña no es de este contacto) se
 * omite, nunca se escribe en cero, y un porcentaje `null` se dice «sin dato», nunca «0 %».
 */

/** Lo que el informe necesita saber además del tablero. */
export interface OpcionesDelInforme {
  proyecto: string
  /** El mes cerrado que se mira (`YYYY-MM`), o `null` si es el tablero vivo. */
  mes: string | null
  /** Día de emisión, `YYYY-MM-DD`. Se inyecta para que el armado sea determinista. */
  emitido: string
}

/** Lo que dice el informe, ya decidido y sin forma de documento. */
export interface ModeloDelInforme {
  proyecto: string
  /** «Mes en curso» o el mes rotulado. */
  periodo: string
  emitido: string
  /** Frases del resumen ejecutivo, de lo general a lo accionable. */
  resumen: string[]
  avance: LecturaDeAvance
  proximaEntrega?: { nombre: string, fecha: string }
  cifras?: Cifra[]
  hitos?: PendientesPorHito
  estados?: BarraDeEstado[]
  prioridades?: { tramos: TramoDePrioridad[], claves: ClaveDePrioridad[] }
  novedades?: Novedad[]
  /** Aclaraciones sobre cómo leer las cifras de este período. */
  notas: string[]
}

/** Cuántas novedades entran al informe. */
const TOPE_DE_NOVEDADES_EN_INFORME = 12

/**
 * Arma lo que dice el informe a partir del tablero que la pantalla ya tiene.
 *
 * @param tablero el tablero tal como llegó de la API (vivo o foto al cierre de un mes)
 * @param estados `task_statuses` del portal, para nombrar y colorear cada estado
 * @param opciones proyecto, mes que se mira y día de emisión
 * @returns El modelo, con solo las secciones que el contacto puede ver.
 */
export function modeloDelInforme (
  tablero: TableroDelProyecto,
  estados: CatalogoDeEstados,
  opciones: OpcionesDelInforme
): ModeloDelInforme {
  const avance = leerAvance(tablero.avance)
  const entrega = tablero.proxima_entrega ?? null
  const modelo: ModeloDelInforme = {
    proyecto: opciones.proyecto,
    periodo: opciones.mes === null ? 'Mes en curso' : rotularMes(opciones.mes),
    emitido: opciones.emitido,
    resumen: [],
    avance,
    notas: notasDelPeriodo(tablero.foto)
  }

  if (entrega !== null) {
    modelo.proximaEntrega = { nombre: entrega.name, fecha: formatearFecha(entrega.duedate) }
  }

  if (tablero.tareas !== undefined) {
    modelo.cifras = cifrasDelTablero(tablero.tareas, tablero.foto)
    modelo.estados = barrasPorEstado(tablero.tareas.por_estado, estados)
    modelo.prioridades = {
      tramos: tramosDePrioridad(tablero.tareas),
      claves: clavesDePrioridad(tablero.tareas)
    }
  }

  if (tablero.hitos !== undefined) modelo.hitos = pendientesPorHito(tablero.hitos.lista, estados)

  if (tablero.actividad !== undefined) {
    modelo.novedades = novedades(tablero.actividad, TOPE_DE_NOVEDADES_EN_INFORME)
  }

  modelo.resumen = resumenEjecutivo(modelo, tablero)

  return modelo
}

/** Las aclaraciones que corresponden al período: solo una foto al cierre las necesita. */
function notasDelPeriodo (foto: TableroDelProyecto['foto']): string[] {
  if (foto?.cerrado !== true) return []

  const notas = [
    `Foto del proyecto al cierre de ${rotularMes(foto.mes)}.`,
    'Las tareas vencidas y las abiertas sin fecha se miden con las fechas de entrega vigentes hoy.'
  ]

  if (foto.aproximado) {
    notas.push('El reparto entre estados abiertos es aproximado: no guardamos el historial de estados.')
  }

  return notas
}

/** Las frases del resumen: avance, lo que alarma, lo cerrado y lo que viene. */
function resumenEjecutivo (modelo: ModeloDelInforme, tablero: TableroDelProyecto): string[] {
  const { avance } = modelo
  const alCierre = tablero.foto?.cerrado === true
  const frases: string[] = []

  frases.push(
    avance.porcentaje === null
      ? avance.motivo
      : `${avance.cerradas} de ${avance.total} tareas cerradas (${avance.porcentaje} %); `
        + `${avance.abiertas} siguen abiertas.`
  )

  if (tablero.tareas !== undefined) {
    const { vencidas, cerradas_mes: delMes } = tablero.tareas

    frases.push(
      vencidas === 0
        ? (alCierre ? 'Al cierre no había tareas vencidas.' : 'No hay tareas vencidas.')
        : `${alCierre ? 'Al cierre había' : 'Hay'} ${vencidas} ${vencidas === 1 ? 'tarea vencida' : 'tareas vencidas'}.`
    )

    if (delMes !== undefined) {
      frases.push(`En el período se ${delMes === 1 ? 'cerró 1 tarea' : `cerraron ${delMes} tareas`}.`)
    }
  }

  if (modelo.proximaEntrega !== undefined) {
    frases.push(`La próxima entrega es «${modelo.proximaEntrega.nombre}», para el ${modelo.proximaEntrega.fecha}.`)
  }

  return frases
}

// =================================================================================================
// EL DOCUMENTO
// =================================================================================================

/** Ancho útil de la hoja A4 con los márgenes del acta (595,28 − 2 × 44). */
const ANCHO_UTIL = 507.28

/** Color de un estado que el catálogo no conoce o que no trae color. */
const COLOR_NEUTRO = '#9CA3AF'

/** Una rampa de cuatro pasos para las prioridades, de la más baja a la más alta. */
const RAMPA_DE_PRIORIDAD = ['#C4B5FD', '#8B5CF6', '#6D28D9', '#312E81']

/**
 * Traduce el modelo a contenido de pdfmake.
 *
 * Las secciones sin dato no se escriben. Los gráficos son vectores (`canvas`), así que el texto
 * del documento sigue siendo texto y se puede buscar y copiar.
 *
 * @param modelo el modelo ya decidido
 * @param colores la paleta de la marca que firma el informe
 * @returns Los elementos del cuerpo, sin cabecera ni pie (los pone el documento).
 */
export function contenidoDelInforme (modelo: ModeloDelInforme, colores: ColoresDeMarca): Content[] {
  const contenido: Content[] = [
    { text: modelo.proyecto, fontSize: 21, bold: true, color: colores.tinta, margin: [0, 16, 0, 4] },
    {
      text: `Informe de avance  ·  ${modelo.periodo}  ·  emitido el ${modelo.emitido}`,
      fontSize: 9.5,
      margin: [0, 0, 0, 14]
    },
    ...seccion('Resumen', colores, [{ ul: modelo.resumen, markerColor: colores.acento, margin: [0, 0, 0, 6] }]),
    ...seccion('Avance de las tareas', colores, avanceDelInforme(modelo.avance, colores))
  ]

  if (modelo.cifras !== undefined) {
    contenido.push(...seccion('Cifras del período', colores, [tarjetasDeCifras(modelo, colores)]))
  }

  if (modelo.hitos !== undefined) contenido.push(...seccion('Pendientes por hito', colores, pendientesDelInforme(modelo.hitos)))
  if (modelo.estados !== undefined) contenido.push(...seccion('Tareas por estado', colores, estadosDelInforme(modelo.estados)))
  if (modelo.prioridades !== undefined) {
    contenido.push(...seccion('Tareas por prioridad', colores, prioridadesDelInforme(modelo.prioridades)))
  }
  if (modelo.novedades !== undefined) contenido.push(...seccion('Novedades del período', colores, novedadesDelInforme(modelo.novedades)))

  if (modelo.notas.length > 0) {
    contenido.push({
      text: modelo.notas.join(' '),
      fontSize: 8.5,
      italics: true,
      margin: [0, 12, 0, 0]
    })
  }

  return contenido
}

/** Un título de sección con su filete, seguido de su cuerpo. */
function seccion (titulo: string, colores: ColoresDeMarca, cuerpo: Content[]): Content[] {
  return [
    {
      stack: [
        { text: titulo, fontSize: 13, bold: true, color: colores.tinta, margin: [0, 12, 0, 3] },
        canvas([{ type: 'line', x1: 0, y1: 0, x2: ANCHO_UTIL, y2: 0, lineWidth: 1, lineColor: colores.filete }], [0, 0, 0, 8])
      ],
      // Un título nunca queda huérfano al pie de una página.
      unbreakable: true
    },
    ...cuerpo
  ]
}

/** Un `canvas` de pdfmake. */
function canvas (figuras: ContentCanvas['canvas'], margen: Margins = [0, 0, 0, 0]): ContentCanvas {
  return { canvas: figuras, margin: margen }
}

/** El porcentaje grande, la barra de avance y la frase que la explica. */
function avanceDelInforme (avance: LecturaDeAvance, colores: ColoresDeMarca): Content[] {
  if (avance.porcentaje === null) return [{ text: `Sin dato. ${avance.motivo}`, margin: [0, 0, 0, 6] }]

  const lleno = (ANCHO_UTIL * Math.min(100, Math.max(0, avance.porcentaje))) / 100

  return [
    { text: `${avance.porcentaje} %`, fontSize: 26, bold: true, color: colores.tinta, margin: [0, 0, 0, 4] },
    canvas([
      { type: 'rect', x: 0, y: 0, w: ANCHO_UTIL, h: 9, color: colores.citaFondo },
      { type: 'rect', x: 0, y: 0, w: lleno, h: 9, color: colores.acento }
    ], [0, 0, 0, 5]),
    { text: `${avance.cerradas} de ${avance.total} cerradas, ${avance.abiertas} abiertas`, fontSize: 9.5 }
  ]
}

/** Las cifras de contexto y la próxima entrega, como tarjetas en una fila. */
function tarjetasDeCifras (modelo: ModeloDelInforme, colores: ColoresDeMarca): Content {
  const tarjetas: Array<{ etiqueta: string, valor: string, nota?: string, alarma: boolean }> = [
    ...(modelo.cifras ?? []).map((cifra) => ({
      etiqueta: cifra.etiqueta,
      valor: String(cifra.valor),
      alarma: cifra.alarma
    }))
  ]

  if (modelo.proximaEntrega !== undefined) {
    tarjetas.push({
      etiqueta: 'Próxima entrega',
      valor: modelo.proximaEntrega.fecha,
      nota: modelo.proximaEntrega.nombre,
      alarma: false
    })
  }

  return {
    table: {
      widths: tarjetas.map(() => '*'),
      body: [tarjetas.map((tarjeta) => ({
        stack: [
          { text: tarjeta.etiqueta, fontSize: 8.5 },
          {
            text: tarjeta.valor,
            fontSize: tarjeta.nota === undefined ? 20 : 13,
            bold: true,
            color: tarjeta.alarma ? '#B91C1C' : colores.tinta,
            margin: [0, 2, 0, 0]
          },
          ...(tarjeta.nota === undefined ? [] : [{ text: tarjeta.nota, fontSize: 8.5, margin: [0, 2, 0, 0] as Margins }])
        ]
      }))]
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => colores.citaFondo,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 8,
      paddingBottom: () => 8
    }
  }
}

/** Las barras horizontales por estado, con su valor a la derecha. */
function estadosDelInforme (barras: BarraDeEstado[]): Content[] {
  if (barras.length === 0) return [{ text: 'Sin tareas para repartir por estado.' }]

  const ancho = 290

  return [{
    table: {
      widths: [120, ancho + 4, 'auto'],
      body: barras.map((barra) => [
        { text: barra.etiqueta, fontSize: 9.5 },
        canvas([{ type: 'rect', x: 0, y: 1, w: Math.max(2, ancho * barra.fraccion), h: 9, color: barra.color ?? COLOR_NEUTRO }]),
        { text: `${barra.total}  (${barra.porcentaje} %)`, fontSize: 9.5, alignment: 'right' }
      ])
    },
    layout: 'noBorders'
  }]
}

/** Una barra apilada por hito, sobre una escala común, y la leyenda de estados debajo. */
function pendientesDelInforme (hitos: PendientesPorHito): Content[] {
  if (hitos.filas.length === 0) {
    return [{ text: hitos.hitos === 0 ? 'El proyecto no tiene hitos.' : 'Todos los hitos están al día.' }]
  }

  const ancho = 290

  return [
    {
      table: {
        widths: [120, ancho + 4, 'auto'],
        body: hitos.filas.map((fila) => {
          let x = 0
          const figuras = fila.tramos.map((tramo) => {
            const w = (ancho * fila.fraccion * tramo.porcentaje) / 100
            const figura = { type: 'rect' as const, x, y: 1, w, h: 9, color: tramo.color ?? COLOR_NEUTRO }

            x += w

            return figura
          })

          return [
            { text: fila.nombre, fontSize: 9.5 },
            canvas(figuras),
            { text: String(fila.pendientes), fontSize: 9.5, alignment: 'right' }
          ]
        })
      },
      layout: 'noBorders'
    },
    leyenda(hitos.leyenda.map((estado) => ({ color: estado.color ?? COLOR_NEUTRO, texto: estado.etiqueta })))
  ]
}

/** La barra apilada de prioridades y su leyenda con los cuatro valores, también en cero. */
function prioridadesDelInforme (
  prioridades: { tramos: TramoDePrioridad[], claves: ClaveDePrioridad[] }
): Content[] {
  if (prioridades.tramos.length === 0) return [{ text: 'Sin tareas para repartir por prioridad.' }]

  let x = 0
  const figuras = prioridades.tramos.map((tramo) => {
    const w = (ANCHO_UTIL * tramo.porcentaje) / 100
    const figura = { type: 'rect' as const, x, y: 0, w, h: 14, color: colorDePrioridad(tramo.paso) }

    x += w

    return figura
  })

  return [
    canvas(figuras, [0, 0, 0, 6]),
    leyenda(prioridades.claves.map((clave) => ({ color: colorDePrioridad(clave.paso), texto: `${clave.etiqueta}: ${clave.total}` })))
  ]
}

/** El color del paso `n` (1-4) de la rampa de prioridades. */
function colorDePrioridad (paso: number): string {
  return RAMPA_DE_PRIORIDAD[Math.min(RAMPA_DE_PRIORIDAD.length, Math.max(1, paso)) - 1] as string
}

/** Una fila de claves: un cuadrito de color y su texto. */
function leyenda (claves: Array<{ color: string, texto: string }>): Content {
  return {
    columns: claves.flatMap((clave): Column[] => [
      { ...canvas([{ type: 'rect', x: 0, y: 2, w: 8, h: 8, color: clave.color }]), width: 12 },
      { text: clave.texto, fontSize: 8.5, width: 'auto', margin: [0, 0, 14, 0] }
    ]),
    columnGap: 0,
    margin: [0, 6, 0, 0]
  }
}

/** Las novedades como lista con su fecha. */
function novedadesDelInforme (lista: Novedad[]): Content[] {
  if (lista.length === 0) return [{ text: 'No hubo novedades registradas en el período.' }]

  return [{
    table: {
      widths: [90, '*'],
      body: lista.map((novedad) => [
        { text: novedad.etiqueta, fontSize: 9 },
        { text: novedad.texto, fontSize: 9.5 }
      ])
    },
    layout: 'noBorders'
  }]
}
