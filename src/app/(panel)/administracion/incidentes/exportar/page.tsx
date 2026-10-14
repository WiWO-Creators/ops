import Link from 'next/link'
import { ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { BloqueCopiable } from '@/componentes/presentadores/BloqueCopiable'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { ErrorApi } from '@/datos/errores'
import { cargarYo, pedir } from '@/datos/servidor'
import { agruparIncidentes, textoDeExportacion } from '@/dominio/exportar-incidentes'
import type { Incidente, IncidenteConTraza } from '@/datos/recursos'

export const metadata = { title: 'Exportar incidentes · WiWO Ops' }

/** Cuántos incidentes recientes entran al reporte. Es el máximo de `per_page` que acepta la API. */
const INCIDENTES_EXPORTADOS = 500

/** Cuántas trazas se piden a la vez: una por grupo, sin disparar cientos de peticiones juntas. */
const TRAZAS_POR_TANDA = 8

/**
 * Trae la traza de cada código, en tandas.
 *
 * Una traza que no se pudo traer no tumba el reporte: queda anotada en su lugar, porque el resto
 * del grupo (mensaje, archivo, línea) sigue sirviendo para diagnosticar.
 *
 * @param codigos códigos de los incidentes representativos
 * @returns la traza por código, o una nota cuando falló
 */
async function cargarTrazas (codigos: string[]): Promise<Map<string, string | null>> {
  const trazas = new Map<string, string | null>()

  for (let inicio = 0; inicio < codigos.length; inicio += TRAZAS_POR_TANDA) {
    const tanda = codigos.slice(inicio, inicio + TRAZAS_POR_TANDA)
    const resultados = await Promise.allSettled(tanda.map(async (codigo) => await pedir<IncidenteConTraza>(`/incidentes/${codigo}`)))

    resultados.forEach((resultado, indice) => {
      const codigo = tanda[indice] ?? ''
      const traza = resultado.status === 'fulfilled'
        ? resultado.value.data.traza
        : `(no se pudo traer la traza: ${resultado.reason instanceof Error ? resultado.reason.message : 'error desconocido'})`

      trazas.set(codigo, traza)
    })
  }

  return trazas
}

/**
 * Arma el texto del reporte, o devuelve el error de la API como valor.
 *
 * Separada de la página para no construir JSX dentro del `try`, igual que en el listado.
 */
async function cargarTexto (): Promise<string | ErrorApi> {
  try {
    const lista = await pedir<Incidente[]>(`/incidentes?page=1&per_page=${INCIDENTES_EXPORTADOS}`)
    const grupos = agruparIncidentes(lista.data)
    const representativos = grupos.map((grupo) => grupo.filas[0]?.incidente ?? '').filter((codigo) => codigo !== '')
    const trazas = await cargarTrazas(representativos)

    return textoDeExportacion(grupos, trazas, lista.meta?.pagination?.total ?? lista.data.length)
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Exportar incidentes: todos los recientes en un solo texto para copiar y pegar.
 *
 * Agrupa los repetidos —un mismo bug deja decenas de filas idénticas— y adjunta una traza por
 * grupo. Así el reporte cabe en un mensaje y los errores distintos no quedan enterrados.
 */
export default async function ExportarIncidentesPage () {
  const { data: yo } = await cargarYo()

  if (!yo.is_superadmin) return <SinPermiso className="mt-10" />

  const texto = await cargarTexto()

  if (texto instanceof ErrorApi) {
    if (texto.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={texto.message} className="mt-10" />
  }

  return (
    <section className="flex flex-col gap-6">
      <Link
        href="/administracion/incidentes"
        className="text-texto-tenue hover:text-texto w-fit text-sm transition-colors"
      >
        ← Volver a incidentes
      </Link>

      <TituloModulo
        titulo="Exportar incidentes"
        descripcion={`Los ${INCIDENTES_EXPORTADOS} más recientes, agrupados por error, con una traza por grupo. Cópialo entero y pégalo donde lo necesites.`}
      />

      <BloqueCopiable titulo="Reporte" texto={texto} />
    </section>
  )
}
