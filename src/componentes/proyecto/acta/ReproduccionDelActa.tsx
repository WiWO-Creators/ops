'use client'

import { useLayoutEffect, useRef, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import type { Guion } from '@/dominio/diff-acta'
import { claseDeMarca, cssDeMarcas, temaDeMarca } from '@/dominio/marcas-acta'
import { montarEscena } from './escenaDeReproduccion'
import '@/estilos/acta-reproduccion.css'

interface PropsReproduccion {
  /** Lo que se reproduce: de la versión que se veía a la que llegó. */
  guion: Guion
  /** Código de marca del acta, como en `ContenidoHtml`. */
  marca: string | null
  /** El `lang` del documento, el mismo del visor. */
  idioma: string
  /** Se llama al terminar, al saltar y con Escape; quien monta la quita. */
  onTerminar: () => void
}

/**
 * La edición del Orbe, reproducida sobre el Meeting Paper en lugar de cambiarlo de golpe.
 *
 * Se monta ENCIMA del visor (`absolute inset-0` sobre el contenedor del iframe) y no en su lugar: el
 * iframe sigue debajo con el cuerpo nuevo ya cargado, así que cuando la capa se apaga el documento
 * real está listo y no hay un fotograma en blanco. La capa no puede ser el iframe: adentro no corre
 * JavaScript. Dibuja el mismo documento con las mismas medidas (`estilos/acta-reproduccion.css`), con
 * la cabecera y el pie de la marca para que nada se corra al volver.
 *
 * Accesibilidad: la capa animada va con `aria-hidden` mientras corre —un lector de pantalla no tiene
 * por qué oír un acta escribiéndose palabra a palabra—; lo que se anuncia es el resumen, que vive
 * en la región `aria-live` de quien la monta. No toma el foco, y «Saltar» (o `Escape`) la corta.
 *
 * @param props el guion, la marca, el idioma y qué hacer al terminar
 * @returns la capa, o nada si no hay nada que mostrar
 */
export function ReproduccionDelActa ({ guion, marca, idioma, onTerminar }: PropsReproduccion): ReactElement {
  const capa = useRef<HTMLDivElement>(null)
  const hoja = useRef<HTMLDivElement>(null)
  const documento = useRef<HTMLDivElement>(null)
  const tema = marca === null || marca === '' ? null : temaDeMarca(marca)

  // Antes del primer pintado: la capa tiene que mostrar el acta viejo desde el primer fotograma.
  useLayoutEffect(() => {
    if (capa.current === null || hoja.current === null || documento.current === null) return

    const cancelar = montarEscena({
      capa: capa.current,
      hoja: hoja.current,
      documento: documento.current,
      guion,
      alTerminar: onTerminar
    })
    const alTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') onTerminar()
    }

    window.addEventListener('keydown', alTecla)

    return () => {
      window.removeEventListener('keydown', alTecla)
      cancelar()
    }
  }, [guion, onTerminar])

  return (
    <div ref={capa} className="rounded-chico border-linea absolute inset-0 z-10 overflow-hidden border bg-white">
      <div
        ref={hoja}
        aria-hidden="true"
        lang={idioma}
        className={`acta-reproduccion${tema === null ? '' : ` acta-marca ${claseDeMarca(tema.codigo)}`}`}
      >
        {tema !== null && <style>{cssDeMarcas('')}</style>}
        <div className="acta-reproduccion__cuerpo">
          {tema !== null && (
            <header className="marca-cabecera">
              {/* eslint-disable-next-line @next/next/no-img-element -- el logo es un archivo de marca fijo, igual que en el visor */}
              <img src={tema.logo} alt="" style={{ height: tema.altoLogo }} />
              <p className="marca-rotulo">Meeting Paper</p>
            </header>
          )}
          <div ref={documento} />
          {tema !== null && <p className="marca-pie">{tema.pie}</p>}
        </div>
      </div>

      <Boton
        variante="secundario"
        tamano="chico"
        onClick={onTerminar}
        aria-keyshortcuts="Escape"
        className="absolute top-3 right-5 shadow-none"
      >
        Saltar
      </Boton>
    </div>
  )
}
