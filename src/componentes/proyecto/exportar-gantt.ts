/**
 * Exportacion del diagrama de Gantt: planilla, imagen y documento para imprimir.
 *
 * Vive en un `.ts` aparte del componente para poder probarse con el runner de Node: pasar los grupos
 * a filas de planilla y dibujar el SVG es logica pura, y es justo lo que se rompe en silencio —un
 * nombre de Tarea con comas, una dependencia que apunta a una Tarea filtrada, un grupo sin fechas—.
 *
 * Los tres formatos salen de los **mismos datos que la pantalla esta mostrando**, con su filtro de
 * estados y su agrupacion puestos: la API ya devolvio los grupos filtrados y aca no se vuelve a
 * pedir nada. Exportar algo distinto de lo que se ve es la forma mas rapida de que nadie vuelva a
 * confiar en el boton.
 *
 * La imagen y el documento para imprimir se dibujan como un SVG propio a partir de la misma
 * geometria de `gantt.ts` que usa la pantalla, en vez de fotografiar el DOM; el porque esta en
 * `svgDeGantt`.
 *
 * Como en `csv.ts`, los `import` de valor van por ruta relativa con extension: el runner de Node no
 * resuelve el alias `@/` fuera de `import type`.
 */

import { armarCsv, nombreDeExportacion } from '../datos/csv.ts'
import { GLOSARIO } from '../../dominio/glosario.ts'
import { formatearFecha } from '../../lib/fechas.ts'
import {
  ALTO_FILA,
  ANCHO_NOMBRES,
  PASO_FILA,
  altoDeGantt,
  anchoDeGantt,
  diaDeFecha,
  filasDeGantt,
  flechasDeGantt,
  marcasDeGantt,
  posicionDeHoy,
  rangoDeGantt,
  type FilaGantt,
  type FlechaGantt,
  type MarcaGantt,
  type ZoomGantt
} from './gantt.ts'
import type { AgrupacionGantt, EstadoLookup, GrupoGantt } from '@/datos/recursos'
import type { Columna } from '@/definiciones/tipos'

/**
 * Etiqueta visible de cada zoom.
 *
 * Vive aca y no en `gantt.ts` porque ese archivo es geometria y no habla el idioma de la interfaz;
 * la usan el panel y el pie de la imagen exportada, asi que una sola copia.
 */
export const NOMBRE_DE_ZOOM: Record<ZoomGantt, string> = {
  dia: 'Día',
  semana: 'Semana',
  mes: 'Mes',
  anio: 'Año'
}

/** Etiqueta visible de cada agrupacion. La comparten el control del panel y la exportacion. */
export const NOMBRE_DE_AGRUPACION: Record<AgrupacionGantt, string> = {
  milestones: GLOSARIO.hito.plural,
  members: 'Miembros',
  status: 'Estado'
}

/** Separador entre dependencias dentro de una celda. Con coma la celda se entrecomilla y se lee peor. */
const SEPARADOR_DEPENDENCIAS = '; '

/** Un dia en milisegundos: para pasar el dia UTC de `rangoDeGantt` de vuelta a `YYYY-MM-DD`. */
const DIA_EN_MS = 86400000

// -- Planilla -----------------------------------------------------------------------------------

/** Una fila de la planilla: una Tarea del diagrama, dentro del grupo en el que se la ve. */
export interface FilaExportadaGantt {
  /** Nombre del grupo: el Hito, la persona o el estado, segun como este agrupado el diagrama. */
  grupo: string
  tarea: string
  /** Fecha `YYYY-MM-DD`, o vacio si la Tarea no la tiene. */
  inicio: string
  entrega: string
  /** Dias que ocupa la barra, contando los dos extremos; `null` si no hay ninguna fecha. */
  duracion: number | null
  estado: string
  avance: number
  vencida: string
  /** Nombres de las Tareas de las que depende, ya resueltos. */
  dependencias: string
}

/** Lo que hace falta saber para escribir la planilla, mas alla de los grupos. */
export interface OpcionesDePlanilla {
  /** Como esta agrupado el diagrama: decide el encabezado de la primera columna. */
  agrupar: AgrupacionGantt
  /** Catalogo `task_statuses` de `/lookups`, para escribir el nombre del estado y no su id. */
  estados: EstadoLookup[]
  /** Fecha `YYYY-MM-DD` congelada por el panel, contra la que se decide si una Tarea esta vencida. */
  hoy: string
}

/**
 * Duracion de una barra, en dias.
 *
 * Cuenta los dos extremos —del 1 al 3 son tres dias, no dos— y una Tarea con una sola fecha dura un
 * dia, igual que se dibuja: una barra de ancho cero seria invisible y una duracion de cero mentiria.
 *
 * @param inicio fecha de inicio, o `null`
 * @param entrega fecha de entrega, o `null`
 * @returns los dias que ocupa, o `null` si no hay ninguna fecha
 */
export function duracionEnDias (inicio: string | null, entrega: string | null): number | null {
  const a = diaDeFecha(inicio)
  const b = diaDeFecha(entrega)

  if (a === null && b === null) return null

  const primero = Math.min(a ?? b ?? 0, b ?? a ?? 0)
  const ultimo = Math.max(a ?? b ?? 0, b ?? a ?? 0)

  return ultimo - primero + 1
}

/**
 * Ids de las Tareas que el diagrama marca como vencidas.
 *
 * La regla no se reescribe aca: se le pide a `filasDeGantt`, que es la que la aplica en pantalla. Si
 * el diagrama no tiene ninguna fecha no hay rango que armar, y sin fecha de entrega ninguna Tarea
 * puede estar vencida.
 *
 * @param grupos los grupos tal como llegaron de la API
 * @param hoy fecha `YYYY-MM-DD` de referencia
 * @returns los ids marcados como vencidos
 */
function tareasVencidas (grupos: GrupoGantt[], hoy: string): Set<number> {
  const vencidas = new Set<number>()
  const rango = rangoDeGantt(grupos)

  if (rango === null) return vencidas

  for (const fila of filasDeGantt(grupos, rango, hoy)) {
    if (fila.vencida && fila.tareaId !== null) vencidas.add(fila.tareaId)
  }

  return vencidas
}

/**
 * Aplana los grupos en las filas de la planilla, en el mismo orden en que se dibujan.
 *
 * Una Tarea que aparece en dos grupos —pasa con `agrupar=members`, donde se repite por cada persona
 * asignada— sale una vez por grupo, igual que en pantalla: la planilla tiene que poder sumarse por
 * persona sin que falten filas.
 *
 * @param grupos los grupos tal como llegaron de la API, ya filtrados
 * @param opciones catalogo de estados y fecha de referencia
 * @returns una fila por Tarea dibujada
 */
export function filasDeExportacionGantt (
  grupos: GrupoGantt[],
  opciones: OpcionesDePlanilla
): FilaExportadaGantt[] {
  const nombreDeEstado = new Map(opciones.estados.map((estado) => [estado.id, estado.name]))
  const nombreDeTarea = new Map<number, string>()

  for (const grupo of grupos) {
    for (const tarea of grupo.tareas) {
      if (!nombreDeTarea.has(tarea.id)) nombreDeTarea.set(tarea.id, tarea.name)
    }
  }

  const vencidas = tareasVencidas(grupos, opciones.hoy)
  const filas: FilaExportadaGantt[] = []

  for (const grupo of grupos) {
    for (const tarea of grupo.tareas) {
      filas.push({
        grupo: grupo.nombre,
        tarea: tarea.name,
        inicio: tarea.start ?? '',
        entrega: tarea.end ?? '',
        duracion: duracionEnDias(tarea.start, tarea.end),
        estado: nombreDeEstado.get(tarea.status) ?? `#${String(tarea.status)}`,
        avance: tarea.progress,
        vencida: vencidas.has(tarea.id) ? 'Sí' : 'No',
        // Una dependencia puede apuntar a una Tarea que el filtro dejo fuera: ahi no hay nombre que
        // escribir y sale el id, que es mas honesto que perder la fila.
        dependencias: tarea.dependencies
          .map((dependencia) => nombreDeTarea.get(dependencia.depends_on) ?? `#${String(dependencia.depends_on)}`)
          .join(SEPARADOR_DEPENDENCIAS)
      })
    }
  }

  return filas
}

/**
 * Columnas de la planilla.
 *
 * El encabezado de la primera cambia con la agrupacion: agrupado por miembros la columna dice
 * "Miembros" y trae a la persona, que es de donde sale el responsable —la barra del Gantt no viaja
 * con el asignado—. Agrupado por estado se llama distinto de la columna de estado de la Tarea para
 * que la planilla no tenga dos encabezados iguales.
 *
 * @param agrupar como esta agrupado el diagrama
 * @returns las columnas en el orden en que se escriben
 */
export function columnasDeGantt (agrupar: AgrupacionGantt): Array<Columna<FilaExportadaGantt>> {
  const encabezadoDeGrupo = agrupar === 'status'
    ? 'Estado del grupo'
    : NOMBRE_DE_AGRUPACION[agrupar]

  return [
    { clave: 'grupo', encabezado: encabezadoDeGrupo, presentar: (fila) => fila.grupo },
    { clave: 'tarea', encabezado: GLOSARIO.proceso.singular, presentar: (fila) => fila.tarea },
    { clave: 'inicio', encabezado: 'Inicio', presentar: (fila) => fila.inicio },
    { clave: 'entrega', encabezado: 'Entrega', presentar: (fila) => fila.entrega },
    { clave: 'duracion', encabezado: 'Duración (días)', numerica: true, presentar: (fila) => fila.duracion },
    { clave: 'estado', encabezado: 'Estado', presentar: (fila) => fila.estado },
    { clave: 'avance', encabezado: 'Avance (%)', numerica: true, presentar: (fila) => fila.avance },
    { clave: 'vencida', encabezado: 'Vencida', presentar: (fila) => fila.vencida },
    { clave: 'dependencias', encabezado: 'Depende de', presentar: (fila) => fila.dependencias }
  ]
}

/**
 * Arma el CSV del diagrama.
 *
 * El escapado de comas, comillas y saltos de linea lo hace `armarCsv`, que ya es el mismo de las
 * demas planillas del panel.
 *
 * @param grupos los grupos tal como llegaron de la API, ya filtrados
 * @param opciones agrupacion, catalogo de estados y fecha de referencia
 * @returns el CSV completo, sin BOM: eso lo pone quien arma el `Blob`
 */
export function csvDeGantt (grupos: GrupoGantt[], opciones: OpcionesDePlanilla): string {
  return armarCsv(columnasDeGantt(opciones.agrupar), filasDeExportacionGantt(grupos, opciones))
}

/**
 * Nombre del archivo exportado.
 *
 * Reusa el sanitizado y la fecha de `nombreDeExportacion` —que siempre termina en `.csv`— y solo le
 * cambia la extension, en vez de repetir la limpieza de acentos y espacios en dos lugares.
 *
 * @param proyectoId id del Proyecto del diagrama
 * @param extension extension del archivo
 * @param hoy fecha de referencia; parametro para poder probarlo
 * @returns un nombre sin espacios ni acentos
 */
export function nombreDeArchivoGantt (
  proyectoId: number,
  extension: 'csv' | 'png',
  hoy: Date
): string {
  const base = nombreDeExportacion(`gantt ${GLOSARIO.espacio.singular} ${String(proyectoId)}`, hoy)

  return base.replace(/\.csv$/, `.${extension}`)
}

// -- Dibujo -------------------------------------------------------------------------------------

/**
 * Paleta del archivo exportado.
 *
 * Fija y clara, tambien cuando el panel se esta viendo en oscuro: la imagen y el PDF terminan
 * pegados en un documento o impresos en papel blanco, y un Gantt con fondo oscuro ahi se lee mal y
 * gasta tinta. Son los valores claros de los tokens del sistema, resueltos a mano porque dentro de
 * un SVG que se rasteriza no llega ninguna hoja de estilos del documento.
 */
const PALETA = {
  fondo: '#FFFFFC',
  cebra: '#F7F7EC',
  pista: '#FBFBEA',
  linea: '#E1E1E0',
  rejilla: '#EBEBE9',
  texto: '#292929',
  textoTenue: '#4F504A',
  textoSutil: '#66685F',
  barra: '#4242FF',
  riel: '#E3E3FF',
  hoy: '#8D7CFF',
  peligro: '#B3261E'
} as const

/** Aire alrededor del dibujo, en pixeles. */
const MARGEN = 16

/** Alto de la cabecera: titulo y subtitulo del archivo. */
const ALTO_CABECERA = 48

/** Alto de cada una de las dos filas de la escala. Es el mismo que usa el panel en pantalla. */
const ALTO_ESCALA = 20

/** Alto del riel con el que se dibuja un grupo, mas fino que la barra de una Tarea. */
const ALTO_RIEL = 6

/** Ancho aproximado de un caracter a 11px en la pila de fuentes del archivo, para recortar nombres. */
const ANCHO_CARACTER = 6

/** Ancho del triangulo de aviso que precede al nombre de una Tarea vencida. */
const ANCHO_AVISO = 9

/** Id del recorte de la columna de nombres. Unico dentro del archivo, que es un documento aparte. */
const ID_RECORTE = 'recorte-nombres'

/** Pila de fuentes del archivo: sin acceso a las del panel, se dibuja con las del sistema. */
const FUENTE = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

/** El diagrama ya resuelto, listo para dibujarse en un SVG. */
export interface DiagramaExportado {
  titulo: string
  subtitulo: string
  filas: FilaGantt[]
  marcas: MarcaGantt[]
  flechas: FlechaGantt[]
  /** Ancho del area de pistas, en pixeles. */
  anchoPistas: number
  /** Posicion de hoy dentro del area de pistas, en porcentaje, o `null` si queda fuera. */
  hoy: number | null
  /** Ancho total de la imagen, en pixeles. */
  ancho: number
  /** Alto total de la imagen, en pixeles. */
  alto: number
}

/** Lo que hace falta para resolver el dibujo, mas alla de los grupos. */
export interface OpcionesDeDiagrama {
  zoom: ZoomGantt
  agrupar: AgrupacionGantt
  /** Fecha `YYYY-MM-DD` congelada por el panel. */
  hoy: string
  proyectoId: number
}

/**
 * Convierte un dia UTC desde la epoca de vuelta a `YYYY-MM-DD`.
 *
 * @param dia el dia que devuelve `rangoDeGantt`
 * @returns la fecha en el formato del contrato
 */
function fechaDeDia (dia: number): string {
  return new Date(dia * DIA_EN_MS).toISOString().slice(0, 10)
}

/**
 * Resuelve la geometria del diagrama para el archivo.
 *
 * El ancho de las pistas es el **natural** de la escala (columnas por su ancho minimo) y no el
 * medido en pantalla: el archivo no tiene una ventana que lo limite, asi que estirarlo a lo que
 * media el navegador en ese momento haria que dos exportaciones del mismo Proyecto salieran
 * distintas segun quien tuviera la barra lateral abierta.
 *
 * @param grupos los grupos tal como llegaron de la API, ya filtrados
 * @param opciones zoom, agrupacion, fecha de referencia y Proyecto
 * @returns el diagrama listo para dibujar, o `null` si no hay ni una fecha que dibujar
 */
export function prepararDiagramaGantt (
  grupos: GrupoGantt[],
  opciones: OpcionesDeDiagrama
): DiagramaExportado | null {
  const rango = rangoDeGantt(grupos)

  if (rango === null) return null

  const marcas = marcasDeGantt(rango, opciones.zoom)
  const filas = filasDeGantt(grupos, rango, opciones.hoy)
  const anchoPistas = anchoDeGantt(marcas.length, opciones.zoom, 0)
  const altoFilas = altoDeGantt(filas.length)
  // Se cuentan Tareas y no filas: agrupado por miembros la misma Tarea aparece en la fila de cada
  // persona asignada, y contarla dos veces diria que hay mas trabajo del que hay.
  const tareas = new Set(filas.filter((fila) => fila.tareaId !== null).map((fila) => fila.tareaId))
  const vencidas = new Set(filas.filter((fila) => fila.vencida).map((fila) => fila.tareaId)).size

  const partes = [
    `${String(tareas.size)} ${tareas.size === 1 ? GLOSARIO.proceso.singular : GLOSARIO.proceso.plural}`,
    `${formatearFecha(fechaDeDia(rango.inicio))} → ${formatearFecha(fechaDeDia(rango.fin))}`,
    `escala ${NOMBRE_DE_ZOOM[opciones.zoom]}`,
    `agrupado por ${NOMBRE_DE_AGRUPACION[opciones.agrupar]}`
  ]

  if (vencidas > 0) {
    partes.push(vencidas === 1
      ? `1 ${GLOSARIO.proceso.singular.toLowerCase()} vencida`
      : `${String(vencidas)} ${GLOSARIO.proceso.plural.toLowerCase()} vencidas`)
  }

  return {
    titulo: `Diagrama de Gantt · ${GLOSARIO.espacio.singular} #${String(opciones.proyectoId)}`,
    subtitulo: partes.join(' · '),
    filas,
    marcas,
    flechas: flechasDeGantt(filas, anchoPistas),
    anchoPistas,
    hoy: posicionDeHoy(rango, opciones.hoy),
    ancho: MARGEN * 2 + ANCHO_NOMBRES + anchoPistas,
    alto: ALTO_CABECERA + ALTO_ESCALA * 2 + altoFilas + MARGEN
  }
}

/**
 * Escapa un texto para meterlo dentro de un SVG.
 *
 * Los nombres de Tarea los escribe cualquiera del equipo: un `&` o un `<` sin escapar rompen el
 * documento entero y el archivo baja vacio.
 *
 * @param texto el texto tal cual
 * @returns el texto apto para un nodo o un atributo XML
 */
export function escaparXml (texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Recorta un nombre al ancho de la columna, con puntos suspensivos.
 *
 * Un `<text>` de SVG no se recorta solo: sin esto el nombre largo se sigue dibujando sobre las
 * barras. El `clipPath` de la columna esta igual como red, pero cortar por caracter deja el corte
 * legible en vez de partir una letra al medio.
 *
 * @param texto el nombre completo
 * @param maximo cuantos caracteres entran
 * @returns el nombre, recortado si no entraba
 */
export function recortarTexto (texto: string, maximo: number): string {
  if (maximo <= 0) return ''
  if (texto.length <= maximo) return texto

  return `${texto.slice(0, Math.max(1, maximo - 1)).trimEnd()}…`
}

/** Recorta a dos decimales: mas precision solo engorda el archivo. */
function redondear (valor: number): number {
  return Math.round(valor * 100) / 100
}

/**
 * Dibuja el diagrama como un SVG independiente.
 *
 * **Por que se redibuja en vez de fotografiar el DOM.** El Gantt es DOM con clases de Tailwind, asi
 * que no hay `toDataURL()` posible: serializarlo dentro de un `<foreignObject>` pierde todo el
 * estilo —las hojas del documento no viajan con el nodo— y la alternativa es copiar el estilo
 * calculado de cada elemento, que es lo que hacen las librerias de DOM a imagen y lo que cuesta un
 * paquete mas. Aca la geometria ya esta en `gantt.ts` y es la misma que pinta la pantalla: con las
 * filas, las marcas y los trazos de las flechas se arma un SVG de `rect` y `text` que se rasteriza
 * en cualquier navegador, se imprime como vector y no depende de nada.
 *
 * Lo que se pierde es la tipografia del panel: el archivo se dibuja con la pila del sistema.
 *
 * @param diagrama el diagrama ya resuelto por `prepararDiagramaGantt`
 * @returns el documento SVG completo, con su `xmlns`
 */
export function svgDeGantt (diagrama: DiagramaExportado): string {
  const { anchoPistas, filas, marcas, hoy } = diagrama
  const altoFilas = altoDeGantt(filas.length)
  const altoCuerpo = ALTO_ESCALA * 2 + altoFilas
  const anchoCuerpo = ANCHO_NOMBRES + anchoPistas
  const enPistas = (porcentaje: number): number => redondear(ANCHO_NOMBRES + (porcentaje / 100) * anchoPistas)
  const partes: string[] = []

  partes.push(`<rect width="${String(diagrama.ancho)}" height="${String(diagrama.alto)}" fill="${PALETA.fondo}"/>`)
  partes.push(`<text x="${String(MARGEN)}" y="22" font-size="15" font-weight="700" fill="${PALETA.texto}">${escaparXml(diagrama.titulo)}</text>`)
  partes.push(`<text x="${String(MARGEN)}" y="39" font-size="11" fill="${PALETA.textoSutil}">${escaparXml(diagrama.subtitulo)}</text>`)
  partes.push(`<g transform="translate(${String(MARGEN)} ${String(ALTO_CABECERA)})">`)

  // Cebrado: cruza las dos columnas, igual que en pantalla.
  filas.forEach((fila, indice) => {
    if (indice % 2 === 0) return

    partes.push(`<rect x="0" y="${String(ALTO_ESCALA * 2 + indice * PASO_FILA)}" width="${String(anchoCuerpo)}" height="${String(PASO_FILA)}" fill="${PALETA.cebra}"/>`)
  })

  // Grilla vertical: arranca en la escala para que la etiqueta y su columna se lean juntas.
  marcas.forEach((marca, indice) => {
    if (indice === 0) return

    partes.push(`<rect x="${String(enPistas(marca.izquierda))}" y="0" width="1" height="${String(altoCuerpo)}" fill="${marca.limite ? PALETA.linea : PALETA.rejilla}"/>`)
  })

  partes.push(`<rect x="0" y="${String(ALTO_ESCALA * 2)}" width="${String(anchoCuerpo)}" height="1" fill="${PALETA.linea}"/>`)
  partes.push(`<rect x="${String(ANCHO_NOMBRES)}" y="0" width="1" height="${String(altoCuerpo)}" fill="${PALETA.linea}"/>`)

  for (const marca of marcas) {
    if (marca.periodo !== null) {
      partes.push(`<text x="${String(enPistas(marca.izquierda) + 4)}" y="14" font-size="11" font-weight="600" fill="${PALETA.texto}">${escaparXml(marca.periodo)}</text>`)
    }

    partes.push(`<text x="${String(enPistas(marca.izquierda + marca.ancho / 2))}" y="${String(ALTO_ESCALA + 14)}" font-size="11" text-anchor="middle" fill="${PALETA.textoSutil}">${escaparXml(marca.unidad)}</text>`)
  }

  if (hoy !== null) {
    partes.push(`<rect x="${String(enPistas(hoy))}" y="${String(ALTO_ESCALA)}" width="2" height="${String(altoCuerpo - ALTO_ESCALA)}" fill="${PALETA.hoy}"/>`)
    partes.push(`<text x="${String(enPistas(hoy))}" y="14" font-size="11" font-weight="600" text-anchor="middle" fill="${PALETA.hoy}">Hoy</text>`)
  }

  partes.push(dibujarFilas(filas, anchoPistas))

  if (diagrama.flechas.length > 0) {
    partes.push(`<g transform="translate(${String(ANCHO_NOMBRES)} ${String(ALTO_ESCALA * 2)})" fill="none">`)

    for (const flecha of diagrama.flechas) {
      // El halo del color del fondo separa la flecha de las barras que cruza; sin el, dos lineas
      // sobre una barra oscura se vuelven una mancha.
      partes.push(`<path d="${flecha.d}" stroke="${PALETA.fondo}" stroke-width="4" stroke-linejoin="round"/>`)
      partes.push(`<path d="${flecha.d}" stroke="${PALETA.textoSutil}" stroke-width="1.5" stroke-linejoin="round"/>`)
      partes.push(`<path d="${flecha.punta}" fill="${PALETA.textoSutil}" stroke="${PALETA.fondo}" stroke-width="1.5" stroke-linejoin="round"/>`)
    }

    partes.push('</g>')
  }

  partes.push('</g>')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(diagrama.ancho)}" height="${String(diagrama.alto)}"`,
    ` viewBox="0 0 ${String(diagrama.ancho)} ${String(diagrama.alto)}" font-family="${FUENTE}">`,
    `<title>${escaparXml(diagrama.titulo)}</title>`,
    partes.join(''),
    '</svg>'
  ].join('')
}

/**
 * Dibuja la columna de nombres y la de pistas, fila por fila.
 *
 * El grupo va como riel fino y la Tarea como barra completa, igual que en pantalla: la jerarquia la
 * marca el peso de la marca y no un alto de fila distinto, porque la geometria de las flechas cuenta
 * filas de alto fijo.
 *
 * @param filas las filas ya aplanadas
 * @param anchoPistas ancho del area de pistas, en pixeles
 * @returns el fragmento de SVG de las filas
 */
function dibujarFilas (filas: FilaGantt[], anchoPistas: number): string {
  const altoColumna = ALTO_ESCALA * 2 + altoDeGantt(filas.length)
  const partes: string[] = [
    `<clipPath id="${ID_RECORTE}"><rect x="0" y="0" width="${String(ANCHO_NOMBRES - 4)}" height="${String(altoColumna)}"/></clipPath>`,
    `<g clip-path="url(#${ID_RECORTE})">`
  ]
  const pistas: string[] = []

  filas.forEach((fila, indice) => {
    const arriba = ALTO_ESCALA * 2 + indice * PASO_FILA
    const sangria = fila.esGrupo ? 4 : 12
    const color = fila.esGrupo ? PALETA.texto : fila.vencida ? PALETA.peligro : PALETA.textoTenue
    // El aviso de vencida va dibujado y no como caracter: un simbolo de la fuente del sistema puede
    // no existir y salir como cuadrito justo en la fila que hay que mirar.
    const conAviso = !fila.esGrupo && fila.vencida
    const izquierdaDelTexto = conAviso ? sangria + ANCHO_AVISO + 4 : sangria
    const maximoDeNombre = Math.floor((ANCHO_NOMBRES - 8 - izquierdaDelTexto) / ANCHO_CARACTER)

    if (conAviso) {
      const base = arriba + PASO_FILA / 2 + 4
      partes.push(`<path d="M ${String(sangria + ANCHO_AVISO / 2)} ${String(base - 9)} L ${String(sangria + ANCHO_AVISO)} ${String(base)} L ${String(sangria)} ${String(base)} Z" fill="${PALETA.peligro}"/>`)
    }

    partes.push(`<text x="${String(izquierdaDelTexto)}" y="${String(arriba + PASO_FILA / 2 + 4)}" font-size="11" font-weight="${fila.esGrupo ? '600' : '400'}" fill="${color}">${escaparXml(recortarTexto(fila.titulo, maximoDeNombre))}</text>`)

    if (fila.esGrupo) {
      if (fila.barra === null) return

      pistas.push(`<rect x="${String(redondear((fila.barra.izquierda / 100) * anchoPistas))}" y="${String(arriba + (PASO_FILA - ALTO_RIEL) / 2)}" width="${String(Math.max(2, redondear((fila.barra.ancho / 100) * anchoPistas)))}" height="${String(ALTO_RIEL)}" rx="3" fill="${PALETA.riel}"/>`)

      return
    }

    pistas.push(`<rect x="0" y="${String(arriba + (PASO_FILA - ALTO_FILA) / 2)}" width="${String(anchoPistas)}" height="${String(ALTO_FILA)}" rx="4" fill="${PALETA.pista}"/>`)

    if (fila.barra === null) return

    const contorno = fila.vencida ? ` stroke="${PALETA.peligro}" stroke-width="1"` : ''

    pistas.push(`<rect x="${String(redondear((fila.barra.izquierda / 100) * anchoPistas))}" y="${String(arriba + (PASO_FILA - ALTO_FILA) / 2)}" width="${String(Math.max(2, redondear((fila.barra.ancho / 100) * anchoPistas)))}" height="${String(ALTO_FILA)}" rx="4" fill="${fila.color ?? PALETA.barra}"${contorno}/>`)
  })

  partes.push('</g>')
  partes.push(`<g transform="translate(${String(ANCHO_NOMBRES)} 0)">${pistas.join('')}</g>`)

  return partes.join('')
}
