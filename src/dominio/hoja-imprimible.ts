/**
 * La hoja de supervisión en papel: el documento HTML que se manda a imprimir.
 *
 * Existe porque la revisión se hace también recorriendo la oficina con la hoja en la mano. El papel
 * repite la hoja del día —por cliente, con el atraso de cada Tarea— y agrega lo que en pantalla no
 * hace falta: dos casillas para marcar a mano, una línea de observaciones y el pie para la firma.
 * Si la hoja ya tiene revisión digital, la casilla correspondiente sale marcada; si ya está firmada,
 * el pie lleva el sello además de la línea.
 *
 * **Todo el texto va escapado.** Los nombres de Tareas, Proyectos, clientes y personas los escribe
 * cualquiera, y el documento se carga en un iframe del mismo origen: un `<img onerror>` en el nombre
 * de una Tarea sería HTML vivo. El iframe va además sin `allow-scripts`, pero una sola defensa es
 * una defensa que se puede caer.
 *
 * Es texto puro y sin DOM para poder probarlo con `node --test`; el componente solo lo mete en el
 * iframe.
 */

import { formatearFecha } from '../lib/fechas.ts'
import { textoDeAtraso } from './supervision.ts'
import type { ClienteDeLaHoja, HojaDeSupervision, TareaDeLaHoja } from '../datos/supervision.ts'

/**
 * Escapa un texto para meterlo en HTML, tanto en contenido como en un atributo entre comillas.
 *
 * @param texto el texto crudo; `null` y `undefined` dan cadena vacía
 * @returns el texto sin caracteres con significado en HTML
 */
export function escaparHtml (texto: string | number | null | undefined): string {
  if (texto === null || texto === undefined) return ''

  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Una casilla cuadrada, marcada o vacía. `aria-label` para quien lea el documento con lector. */
function casilla (marcada: boolean, rotulo: string): string {
  const clase = marcada ? 'casilla marcada' : 'casilla'

  return `<span class="${clase}" role="img" aria-label="${escaparHtml(rotulo)}${marcada ? ' (marcada)' : ''}">${marcada ? '&#10005;' : ''}</span>`
}

/** Los asignados de una Tarea, o un guion si no tiene. */
function responsables (tarea: TareaDeLaHoja): string {
  if (tarea.asignados.length === 0) return '—'

  return tarea.asignados.map((persona) => escaparHtml(persona.nombre)).join(', ')
}

/** La fila de una Tarea. La nota digital, si la hay, ocupa la línea de observaciones. */
function filaDeTarea (tarea: TareaDeLaHoja): string {
  const estado = tarea.revision?.estado ?? null
  const patente = tarea.patente === null ? '' : `<span class="patente">${escaparHtml(tarea.patente)}</span> `
  const nota = tarea.revision?.nota ?? ''
  const atraso = tarea.dias_atraso > 0 ? `<strong>${escaparHtml(textoDeAtraso(tarea.dias_atraso))}</strong>` : escaparHtml(textoDeAtraso(0))

  return `<tr>
<td>${patente}${escaparHtml(tarea.name)}</td>
<td>${escaparHtml(tarea.proyecto?.name ?? '—')}</td>
<td>${responsables(tarea)}</td>
<td class="fecha">${escaparHtml(formatearFecha(tarea.duedate))}</td>
<td class="atraso">${atraso}</td>
<td class="marca">${casilla(estado === 'ok', 'Lista')}</td>
<td class="marca">${casilla(estado === 'no_ok', 'No lista')}</td>
<td class="observaciones">${escaparHtml(nota)}</td>
</tr>`
}

/** La tabla de un cliente, con su nombre como título. */
function tablaDeCliente (cliente: ClienteDeLaHoja): string {
  return `<section class="cliente">
<h2>${escaparHtml(cliente.company)}</h2>
<table>
<thead><tr>
<th>Tarea</th><th>Proyecto</th><th>Responsable</th><th>Vence</th><th>Atraso</th>
<th class="marca">Lista</th><th class="marca">No lista</th><th>Observaciones</th>
</tr></thead>
<tbody>
${cliente.tareas.map(filaDeTarea).join('\n')}
</tbody>
</table>
</section>`
}

/** El pie: la línea de firma siempre, y el sello si la hoja ya está firmada. */
function pieDeFirma (hoja: HojaDeSupervision): string {
  const sello = hoja.firma === null
    ? ''
    : `<p class="sello">Firmado digitalmente por ${escaparHtml(hoja.firma.nombre)} el ${escaparHtml(formatearFecha(hoja.firma.firmado_en, true))}</p>`

  return `<footer class="firma">
<div class="linea"></div>
<p>Firma</p>
<p><strong>${escaparHtml(hoja.supervisor.nombre)}</strong> · ${escaparHtml(formatearFecha(hoja.fecha))}</p>
${sello}
</footer>`
}

/** Estilos del documento: A4 vertical, tinta negra, sin fondos que gasten tóner. */
const ESTILOS = `
  @page { size: A4 portrait; margin: 14mm 12mm }
  * { box-sizing: border-box }
  body { margin: 0; font: 10pt/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif; color: #000; background: #fff }
  h1 { font-size: 16pt; margin: 0 0 2mm }
  .datos { margin: 0 0 5mm; font-size: 10pt }
  .cliente { break-inside: auto; margin-bottom: 5mm }
  h2 { font-size: 11.5pt; margin: 0 0 1.5mm; break-after: avoid }
  table { width: 100%; border-collapse: collapse; table-layout: fixed }
  th, td { border: 0.3mm solid #444; padding: 1.2mm 1.5mm; vertical-align: top; text-align: left; word-wrap: break-word }
  th { font-size: 8.5pt; font-weight: 600 }
  tr { break-inside: avoid }
  th:nth-child(1) { width: 23% } th:nth-child(2) { width: 13% } th:nth-child(3) { width: 13% }
  th:nth-child(4) { width: 12% } th:nth-child(5) { width: 11% } th.marca { width: 6.5% }
  td.marca, th.marca { text-align: center }
  td.fecha { white-space: nowrap; word-wrap: normal; font-size: 8.5pt }
  td.atraso { font-size: 8.5pt }
  .patente { font-family: ui-monospace, monospace; font-size: 8.5pt }
  .casilla { display: inline-block; width: 4.2mm; height: 4.2mm; border: 0.35mm solid #000; line-height: 4mm; text-align: center; font-size: 9pt; font-weight: 700 }
  td.observaciones { min-height: 7mm; height: 7mm }
  .vacio { font-style: italic }
  .firma { margin-top: 12mm; break-inside: avoid; width: 70mm }
  .firma .linea { border-bottom: 0.35mm solid #000; height: 14mm }
  .firma p { margin: 1mm 0 }
  .sello { font-size: 9pt; font-style: italic }
`

/**
 * El documento HTML completo de la hoja, listo para el `srcdoc` de un iframe.
 *
 * @param hoja la hoja tal como la devolvió la API (con las revisiones que haya)
 * @returns el HTML, con todo el texto escapado
 */
export function htmlDeHojaImprimible (hoja: HojaDeSupervision): string {
  const titulo = `Supervisión diaria · ${formatearFecha(hoja.fecha)}`
  const cuerpo = hoja.clientes.length === 0
    ? '<p class="vacio">Sin tareas por supervisar este día.</p>'
    : hoja.clientes.map(tablaDeCliente).join('\n')

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<title>${escaparHtml(titulo)}</title>
<style>${ESTILOS}</style></head>
<body>
<h1>Supervisión diaria</h1>
<p class="datos">Supervisor: <strong>${escaparHtml(hoja.supervisor.nombre)}</strong> · Fecha: <strong>${escaparHtml(formatearFecha(hoja.fecha))}</strong> · ${escaparHtml(hoja.totales.tareas)} tareas, ${escaparHtml(hoja.totales.atrasadas)} atrasadas</p>
${cuerpo}
${pieDeFirma(hoja)}
</body></html>`
}
