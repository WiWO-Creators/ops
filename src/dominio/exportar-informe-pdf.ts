import type { TDocumentDefinitions } from 'pdfmake/interfaces'
import { descargar } from './exportar-acta.ts'
import {
  COLORES,
  MARGEN_LATERAL,
  cabeceraDeMarca,
  pdfmakeDelNavegador,
  pieDelActa,
  registrarFuente
} from './exportar-pdf.ts'
import { contenidoDelInforme, type ModeloDelInforme } from './informe-tablero.ts'
import { IDIOMAS } from './idiomas-acta.ts'
import { TEMAS, type CodigoDeMarca } from './marcas-acta.ts'

/** Rótulo de la banda de cabecera del informe. */
const ROTULO_DEL_INFORME = 'INFORME DE AVANCE'

/**
 * El nombre del archivo: `informe-<proyecto>-<YYYY-MM | en-curso>.pdf`, sin tildes ni símbolos.
 *
 * @param proyecto nombre del proyecto
 * @param mes el mes cerrado (`YYYY-MM`) o `null` si es el tablero vivo
 * @returns Un nombre seguro para cualquier sistema de archivos.
 */
export function nombreDelInforme (proyecto: string, mes: string | null): string {
  const slug = proyecto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase()

  return `informe-${slug === '' ? 'proyecto' : slug}-${mes ?? 'en-curso'}.pdf`
}

/**
 * Descarga el informe del tablero como PDF, con la cabecera y el pie de la marca que lo firma.
 *
 * pdfmake entra por `import()` dentro de `pdfmakeDelNavegador`: la pestaña no carga nada hasta que
 * alguien pide el informe.
 *
 * @param modelo lo que dice el informe (`modeloDelInforme`)
 * @param mes el mes cerrado o `null`, para nombrar el archivo
 * @param marca la marca que firma; por defecto WiWO
 * @throws Error si pdfmake no logra construir el documento
 */
export async function descargarInformePdf (
  modelo: ModeloDelInforme,
  mes: string | null,
  marca: CodigoDeMarca = 'wiwo'
): Promise<void> {
  const tema = TEMAS[marca]
  const colores = COLORES[marca]
  const pdfMake = await pdfmakeDelNavegador()
  const fuente = await registrarFuente(pdfMake, tema, IDIOMAS.es)

  const definicion: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [MARGEN_LATERAL, 44, MARGEN_LATERAL, 58],
    info: {
      title: `Informe · ${modelo.proyecto} · ${modelo.periodo}`,
      subject: `Informe de avance · ${modelo.proyecto}`,
      creator: tema.nombre
    },
    defaultStyle: { font: fuente, fontSize: 10.5, lineHeight: 1.35, color: colores.texto },
    content: [
      await cabeceraDeMarca(tema, colores, ROTULO_DEL_INFORME),
      ...contenidoDelInforme(modelo, colores)
    ],
    footer: (pagina: number, total: number) => pieDelActa(tema, colores, pagina, total)
  }

  const blob = await pdfMake.createPdf(definicion).getBlob()

  descargar(blob, nombreDelInforme(modelo.proyecto, mes))
}
