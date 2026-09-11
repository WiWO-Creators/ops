'use client'

import { useState, type ReactElement } from 'react'
import { Download } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { GLOSARIO } from '@/dominio/glosario'
import { rangoDeGantt, type ZoomGantt } from './gantt'
import {
  csvDeGantt,
  filasDeExportacionGantt,
  nombreDeArchivoGantt,
  prepararDiagramaGantt,
  svgDeGantt
} from './exportar-gantt'
import type { AgrupacionGantt, EstadoLookup, GrupoGantt } from '@/datos/recursos'

/**
 * Menu para bajarse el diagrama de Gantt: planilla, imagen o documento para imprimir.
 *
 * Un menu y no tres botones: tres controles seguidos compiten con la agrupacion y la escala, que son
 * los que se usan todo el tiempo, y esto se usa una vez por reunion.
 *
 * Los tres formatos salen de los datos que el panel ya tiene en pantalla —con su filtro de estados y
 * su agrupacion— y no de una consulta nueva. La conversion vive en `exportar-gantt.ts`, que se
 * prueba sin navegador; aca queda solo lo que necesita DOM: armar el `Blob`, rasterizar el SVG en un
 * `canvas` y abrir el dialogo de impresion.
 *
 * **El PDF es el `print()` de un iframe propio**, el mismo camino que usa el Meeting Paper, y no un
 * `@media print` sobre la pagina. Imprimir la pagina obliga a esconder la barra lateral, la cabecera
 * y las pestañas con reglas globales, y el diagrama igual saldria cortado por el ancho de la hoja
 * porque en papel no hay barra de desplazamiento. El iframe lleva un documento de una sola pieza —el
 * mismo SVG de la imagen, en vectorial— que el navegador escala a la hoja apaisada sin cortar nada.
 */

/** Factor con el que se rasteriza el PNG: a 1x el texto de 11px sale sucio al pegarlo en un documento. */
const ESCALA_PNG = 2

/** Aviso unico para los dos formatos que necesitan un diagrama dibujado. */
const SIN_FECHAS = `Ninguna ${GLOSARIO.proceso.singular.toLowerCase()} tiene fechas, asi que no hay diagrama que dibujar. La planilla igual se puede bajar.`

interface PropsExportarGantt {
  /** Los grupos tal como los devolvio la API, ya filtrados por estado. */
  grupos: GrupoGantt[]
  /** La escala que esta puesta en pantalla. */
  zoom: ZoomGantt
  agrupar: AgrupacionGantt
  /** Fecha `YYYY-MM-DD` congelada por el panel: decide el marcador de hoy y las vencidas. */
  hoy: string
  proyectoId: number
  /** Catalogo `task_statuses`. Vacio mientras `/lookups` no llego: el estado sale como `#id`. */
  estados: EstadoLookup[]
}

export function ExportarGantt ({
  grupos,
  zoom,
  agrupar,
  hoy,
  proyectoId,
  estados
}: PropsExportarGantt): ReactElement {
  const [error, setError] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)

  const hayTareas = grupos.some((grupo) => grupo.tareas.length > 0)
  const hayFechas = rangoDeGantt(grupos) !== null

  /** Arma el diagrama con lo que hay en pantalla, o deja dicho por que no se puede. */
  function resolverDiagrama (): string | null {
    const diagrama = prepararDiagramaGantt(grupos, { zoom, agrupar, hoy, proyectoId })

    if (diagrama === null) {
      setError(SIN_FECHAS)

      return null
    }

    setError(null)

    return svgDeGantt(diagrama)
  }

  function descargarPlanilla (): void {
    const filas = filasDeExportacionGantt(grupos, { agrupar, estados, hoy })

    if (filas.length === 0) {
      setError(`No hay ${GLOSARIO.proceso.plural.toLowerCase()} que exportar.`)

      return
    }

    setError(null)
    descargarArchivo(
      // El BOM hace que Excel abra el archivo como UTF-8; sin el, "Diseño" llega roto.
      new Blob([`﻿${csvDeGantt(grupos, { agrupar, estados, hoy })}`], { type: 'text/csv;charset=utf-8' }),
      nombreDeArchivoGantt(proyectoId, 'csv', new Date())
    )
  }

  async function descargarImagen (): Promise<void> {
    const svg = resolverDiagrama()
    if (svg === null) return

    setGenerando(true)

    try {
      descargarArchivo(await pngDesdeSvg(svg), nombreDeArchivoGantt(proyectoId, 'png', new Date()))
    } catch (falla) {
      setError(falla instanceof Error
        ? `No se pudo generar la imagen: ${falla.message}`
        : 'No se pudo generar la imagen.')
    } finally {
      setGenerando(false)
    }
  }

  function imprimir (): void {
    const svg = resolverDiagrama()
    if (svg === null) return

    try {
      imprimirSvg(svg)
    } catch (falla) {
      setError(falla instanceof Error
        ? `No se pudo abrir la impresión: ${falla.message}`
        : 'No se pudo abrir la impresión.')
    }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      {error !== null && <p role="alert" className="text-texto-peligro max-w-80 text-xs">{error}</p>}

      <MenuContextual>
        <DisparadorMenu asChild>
          <Boton variante="secundario" tamano="chico" cargando={generando}>
            <Download aria-hidden="true" className="size-3.5" />
            Exportar
          </Boton>
        </DisparadorMenu>

        <ContenidoMenu align="end">
          <ItemMenu disabled={!hayTareas} onSelect={descargarPlanilla}>
            Planilla (CSV para Excel)
          </ItemMenu>
          <ItemMenu disabled={!hayTareas || !hayFechas} onSelect={() => { void descargarImagen() }}>
            Imagen (PNG)
          </ItemMenu>
          <ItemMenu disabled={!hayTareas || !hayFechas} onSelect={imprimir}>
            Imprimir o guardar en PDF
          </ItemMenu>

          {/* Un menu con todo apagado y sin explicacion se lee como una falla del panel. */}
          {!hayTareas && (
            <p className="text-texto-sutil px-2.5 py-1.5 text-xs">
              Este {GLOSARIO.espacio.singular.toLowerCase()} todavía no tiene{' '}
              {GLOSARIO.proceso.plural.toLowerCase()} que exportar.
            </p>
          )}
          {hayTareas && !hayFechas && (
            <p className="text-texto-sutil max-w-60 px-2.5 py-1.5 text-xs">
              Sin fechas no hay diagrama que dibujar: solo baja la planilla.
            </p>
          )}
        </ContenidoMenu>
      </MenuContextual>
    </div>
  )
}

/**
 * Baja un archivo ya armado.
 *
 * @param contenido el archivo
 * @param nombre con que nombre se guarda
 */
function descargarArchivo (contenido: Blob, nombre: string): void {
  const url = URL.createObjectURL(contenido)
  const enlace = document.createElement('a')

  enlace.href = url
  enlace.download = nombre
  enlace.click()

  URL.revokeObjectURL(url)
}

/**
 * Rasteriza el SVG del diagrama a PNG.
 *
 * El SVG viaja como `data:` y no como `blob:` a proposito: una imagen SVG traida de un blob ensucia
 * el lienzo en algunos navegadores y ahi `toBlob` falla con un error de seguridad. Como el documento
 * no referencia ninguna fuente ni imagen externa, el dibujo se completa sin pedir nada a la red.
 *
 * @param svg el documento SVG completo
 * @returns el PNG listo para descargar
 * @throws Error si el navegador no puede decodificar el dibujo o no entrega el lienzo
 */
async function pngDesdeSvg (svg: string): Promise<Blob> {
  const imagen = new Image()

  imagen.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  await imagen.decode()

  const lienzo = document.createElement('canvas')

  lienzo.width = Math.round(imagen.naturalWidth * ESCALA_PNG)
  lienzo.height = Math.round(imagen.naturalHeight * ESCALA_PNG)

  const pincel = lienzo.getContext('2d')

  if (pincel === null) throw new Error('el navegador no entregó un lienzo donde dibujar.')

  pincel.scale(ESCALA_PNG, ESCALA_PNG)
  pincel.drawImage(imagen, 0, 0)

  return await new Promise<Blob>((entregar, fallar) => {
    lienzo.toBlob((png) => {
      if (png === null) fallar(new Error('el navegador no pudo codificar el PNG.'))
      else entregar(png)
    }, 'image/png')
  })
}

/**
 * Abre el dialogo de impresion con el diagrama solo, en horizontal.
 *
 * El diagrama va como `<img>` y no como SVG en linea: una imagen es un elemento reemplazado, asi que
 * `max-width` y `max-height` la achican conservando su proporcion y el diagrama entra entero en la
 * hoja. En linea, el SVG se recortaria por el borde derecho.
 *
 * El iframe se retira cuando el dialogo se cierra. `allow-same-origin` es lo que permite llamarle
 * `print()` desde acá y `allow-modals` lo que deja abrir el dialogo; sin `allow-scripts` el
 * documento no ejecuta nada.
 *
 * @param svg el documento SVG completo
 */
function imprimirSvg (svg: string): void {
  const marco = document.createElement('iframe')

  marco.setAttribute('sandbox', 'allow-same-origin allow-modals')
  marco.setAttribute('aria-hidden', 'true')
  marco.setAttribute('title', 'Impresión del diagrama de Gantt')
  // Fuera de la vista pero con tamaño real: un iframe de 0x0 o en `display:none` no llega a
  // maquetar su documento y se imprime en blanco.
  marco.style.cssText = 'position:fixed;left:-10000px;top:0;width:1024px;height:768px;border:0'
  marco.srcdoc = documentoImprimible(svg)

  marco.addEventListener('load', () => {
    const ventana = marco.contentWindow

    if (ventana === null) {
      marco.remove()

      return
    }

    ventana.addEventListener('afterprint', () => { marco.remove() }, { once: true })
    ventana.focus()
    ventana.print()
  })

  document.body.append(marco)
}

/**
 * Documento de una sola pieza que se manda a imprimir.
 *
 * @param svg el documento SVG completo
 * @returns el HTML del iframe
 */
function documentoImprimible (svg: string): string {
  const imagen = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>Diagrama de Gantt</title>
<style>
  @page { size: landscape; margin: 10mm }
  html, body { height: 100%; margin: 0; background: #fff }
  body { display: flex; align-items: flex-start; justify-content: center }
  img { max-width: 100%; max-height: 100%; width: auto; height: auto }
</style></head>
<body><img src="${imagen}" alt="Diagrama de Gantt"></body></html>`
}
