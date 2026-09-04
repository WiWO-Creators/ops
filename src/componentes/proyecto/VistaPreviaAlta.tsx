import type { ReactElement } from 'react'

/**
 * Lo que se entendio de un texto libre, antes de crear la tarea.
 *
 * Sin esto la sintaxis del alta rapida es adivinanza: la persona no sabe si `@franz` encontro a
 * alguien hasta que la tarea ya se creo mal. Lo no resuelto se muestra aparte y en tono de aviso, no
 * de error, porque no impide crear: queda en el titulo y nada se pierde en silencio.
 *
 * La comparte el alta rapida (`AltaRapidaProceso`) con el alta completa (`FormularioTarea`), que
 * ademas rellena campos con lo que interpreto un modelo. De ahi el `origen` de cada marca: **nada
 * que produjo el modelo puede verse igual que algo que la persona escribio**, porque lo que la
 * persona escribio no hace falta revisarlo y lo que propuso el modelo si.
 */

/** Una marca de la vista previa: un dato reconocido y de donde salio. */
export interface MarcaPrevia {
  texto: string
  origen: 'texto' | 'ia'
}

interface PropsVistaPrevia {
  titulo: string
  /** De donde salio el titulo. El modelo lo redacta, asi que puede haber pisado lo que se escribio. */
  origenTitulo?: 'texto' | 'ia'
  marcas: MarcaPrevia[]
  /** Lo que se escribio con prefijo o nombro el modelo y no se pudo resolver. Sigue en el titulo. */
  sinResolver: string[]
}

export function VistaPreviaAlta (
  { titulo, origenTitulo = 'texto', marcas, sinResolver }: PropsVistaPrevia
): ReactElement | null {
  if (titulo.trim() === '' && marcas.length === 0 && sinResolver.length === 0) return null

  return (
    <div className="border-borde bg-superficie-sutil flex flex-col gap-2 rounded-chico border p-3">
      <p
        className="text-texto text-sm font-medium"
        title={origenTitulo === 'ia' ? 'Sugerido por IA' : undefined}
      >
        {titulo.trim() === ''
          ? <span className="text-texto-sutil">Sin título todavía</span>
          : titulo}
      </p>

      {marcas.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {marcas.map((marca) => (
            <li
              key={`${marca.origen}:${marca.texto}`}
              title={marca.origen === 'ia' ? 'Sugerido por IA' : undefined}
              className={
                marca.origen === 'ia'
                  ? 'border-acento bg-acento-suave text-texto rounded-chico border border-dashed px-2 py-0.5 text-xs'
                  : 'border-borde text-texto-tenue rounded-chico border px-2 py-0.5 text-xs'
              }
            >
              {marca.texto}
            </li>
          ))}
        </ul>
      )}

      {sinResolver.length > 0 && (
        <p className="text-texto-tenue text-xs">
          Sin reconocer: {sinResolver.join(', ')} — queda en el título.
        </p>
      )}
    </div>
  )
}
