import Link from 'next/link'
import type { ReactElement } from 'react'
import type { Cita } from '@/dominio/ia'

interface PropsFuentesIA {
  citas: Cita[]
  /** A dónde lleva cada cita (`configuracion.hrefDeCita`), o `null` si no hay pantalla que la resuelva. */
  hrefDeCita: (cita: Cita) => string | null
}

/**
 * Las fuentes al pie de una respuesta: una etiqueta por cita, con enlace interno si la cita tiene
 * destino y texto si no. La comparten el motor de consulta y el agente.
 *
 * @param props citas verificadas por el servidor y cómo resolver su destino
 * @returns la lista, o nada si no hay citas
 */
export function FuentesIA ({ citas, hrefDeCita }: PropsFuentesIA): ReactElement | null {
  if (citas.length === 0) return null

  return (
    <div className="animate-aparecer flex flex-col gap-1">
      <p className="text-texto-sutil text-xs font-medium">Fuentes</p>
      <ul className="flex flex-wrap gap-1.5">
        {citas.map((cita, i) => (
          <li key={i}>
            <Fuente cita={cita} numero={i + 1} href={hrefDeCita(cita)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Una fuente del pie: la misma regla que el marcador, con el título al lado del número. */
function Fuente ({ cita, numero, href }: { cita: Cita, numero: number, href: string | null }): ReactElement {
  const clases = 'border-linea bg-superficie text-texto-tenue rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-xs'
  const contenido = (
    <>
      <span className="text-texto-sutil">[{numero}]</span>
      {cita.titulo}
    </>
  )

  if (href === null) return <span className={clases}>{contenido}</span>

  return <Link href={href} className={`${clases} hover:bg-hover hover:text-texto`}>{contenido}</Link>
}
