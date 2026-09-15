'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import type { Escena, Frescura, ParametrosDePantalla } from '@/dominio/pantalla-area'

interface Props {
  area: string | null
  guion: Escena[]
  escenaId: string | null
  frescura: Frescura
  esperando: boolean
  /** El reloj del navegador, o `null` antes de hidratar. */
  ahora: number | null
  zona: string | null
  zoom: number
  tema: ParametrosDePantalla['tema']
  transicion: ParametrosDePantalla['transicion']
  children: ReactNode
}

/**
 * El marco fijo de la pantalla: cabecera, cuerpo y pie.
 *
 * === LAS TRES DECISIONES QUE NO SON DE GUSTO ===
 *
 * **`h-dvh` y no `min-h-dvh`.** Las otras rutas publicas usan `min-h`, y acá seria un error: si el
 * contenido creciera un pixel aparece una barra de scroll, y en un televisor nadie va a hacer scroll.
 * Lo que no entra desaparece sin que nadie se entere. Con `h-dvh` y `overflow: hidden`, no entrar es
 * un fallo visible que el paginado tiene que resolver antes.
 *
 * **Todo en `vmin`, cero `px`.** Un televisor 4K puede reportar 1920 px CSS a DPR 2 o 3840 px CSS a
 * DPR 1 segun el navegador del aparato; una escala en pixeles sale del doble de grande o de chica en
 * uno de los dos casos. Es lo mismo que ya hace `/sala/[token]`.
 *
 * **Oscuro forzado.** El tema lo fija un script desde `localStorage`, y un televisor en modo kiosco
 * arrastra el que tuviera quien lo configuro. Una pared en modo claro a las once de la noche es una
 * lampara. Se puede volver a claro con `?tema=claro` para una sala muy iluminada.
 */
export function MarcoDePantalla (props: Props): ReactNode {
  const { area, guion, escenaId, frescura, esperando, ahora, zona, zoom, tema, transicion, children } = props

  // El tema se fuerza desde el cliente y no con una clase: el script de arranque escribe
  // `data-theme` en el `<html>`, y lo que gana es el ultimo que escribe.
  useEffect(() => {
    const anterior = document.documentElement.dataset.theme

    document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark'

    return () => {
      if (anterior === undefined) delete document.documentElement.dataset.theme
      else document.documentElement.dataset.theme = anterior
    }
  }, [tema])

  const escena = guion.find((pieza) => pieza.id === escenaId) ?? null

  /**
   * Cuando empezo la escena que se esta viendo.
   *
   * Existe para poder verificar desde afuera lo unico que una prueba de navegador no puede deducir
   * mirando el DOM: que un sondeo a mitad de escena **no** reinicio la rotacion. Si este valor cambia
   * sin que cambie `data-escena`, el motor esta roto.
   */
  const [desde, setDesde] = useState(0)

  // Por `setTimeout` y no en el cuerpo del efecto: un `setState` sincrono ahi encadena renders.
  useEffect(() => {
    const marca = globalThis.setTimeout(() => { setDesde(Date.now()) }, 0)

    return () => { globalThis.clearTimeout(marca) }
  }, [escenaId])

  return (
    <main
      className="pantalla-raiz bg-superficie text-texto grid h-dvh grid-rows-[auto_1fr_auto] overflow-hidden"
      style={{ '--escala': zoom } as React.CSSProperties}
      data-escena={escenaId ?? ''}
      data-escena-desde={desde}
      data-frescura={frescura}
    >
      <header className="pantalla-deriva flex items-baseline justify-between px-[4vmin] pt-[3vmin]">
        <h1 className="text-texto-tenue truncate text-[3vmin] font-semibold tracking-[0.2em] uppercase">
          {area ?? 'WiWO Ops'}
        </h1>
        <Reloj ahora={ahora} zona={zona} />
      </header>

      <section
        // `key` por id de escena: es lo que remonta el bloque —y reinicia su fundido y su barra— solo
        // cuando la escena cambia de verdad, y nunca porque llegaron datos nuevos.
        key={escenaId ?? 'vacio'}
        className={cn(
          'flex min-h-0 flex-col justify-center px-[4vmin] py-[2vmin]',
          transicion !== 'ninguna' && 'pantalla-escena'
        )}
        style={transicion === 'vista' ? { viewTransitionName: 'escena' } : undefined}
      >
        {esperando ? <Esperando /> : children}
      </section>

      <footer className="pantalla-deriva flex flex-col gap-[1.2vmin] px-[4vmin] pb-[3vmin]">
        <div className="flex items-center justify-between">
          <Puntos guion={guion} escenaId={escenaId} />
          <Estado frescura={frescura} esperando={esperando} />
        </div>

        <div className="bg-linea-suave h-[0.5vmin] w-full overflow-hidden rounded-full">
          {escena !== null && (
            <div
              className="bg-acento pantalla-progreso h-full w-full"
              style={{ animationDuration: `${escena.duracionMs}ms` }}
            />
          )}
        </div>
      </footer>
    </main>
  )
}

/**
 * El reloj de pared.
 *
 * No se renderiza en el servidor —saldria con la hora del servidor y React protestaria al hidratar—,
 * asi que hasta que hidrate dice `--:--`. Importa el doble en esta pantalla: en `pnpm dev` la pagina
 * no hidrata, y un mismatch pasa inadvertido en desarrollo y arruina la pared en produccion.
 *
 * La zona sale del backend y no del aparato: un televisor barato tiene el reloj mal a menudo, y a
 * veces en UTC.
 */
function Reloj ({ ahora, zona }: { ahora: number | null, zona: string | null }): ReactNode {
  if (ahora === null) {
    return <p className="text-texto-tenue text-[3vmin] tabular-nums">--:--</p>
  }

  const opciones: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

  if (zona !== null) opciones.timeZone = zona

  return (
    <p className="text-texto text-[3.2vmin] font-semibold tabular-nums">
      {new Intl.DateTimeFormat('es-CL', opciones).format(new Date(ahora))}
    </p>
  )
}

/** Un punto por escena: dice cuantas hay y en cual va. */
function Puntos ({ guion, escenaId }: { guion: Escena[], escenaId: string | null }): ReactNode {
  return (
    <ul className="flex items-center gap-[1vmin]">
      {guion.map((escena) => (
        <li
          key={escena.id}
          className={cn(
            'h-[1vmin] rounded-full transition-all duration-500',
            escena.id === escenaId ? 'bg-acento w-[4vmin]' : 'bg-linea-fuerte w-[1vmin]'
          )}
        />
      ))}
    </ul>
  )
}

/**
 * El aviso de frescura.
 *
 * Con los datos al dia no dice nada: un indicador verde permanente es ruido, y ademas un bloque de
 * color fijo en la misma esquina durante meses es justo lo que quema un panel.
 */
function Estado ({ frescura, esperando }: { frescura: Frescura, esperando: boolean }): ReactNode {
  if (frescura === 'fresco' && !esperando) return null

  const texto = esperando
    ? 'Reconectando…'
    : frescura === 'viejo' ? 'Datos sin actualizar' : 'Sin conexión con Ops'

  return (
    <p className="text-texto-aviso flex items-center gap-[1vmin] text-[2.6vmin]">
      <span className="bg-relleno-aviso inline-block size-[1.4vmin] rounded-full" />
      {texto}
    </p>
  )
}

/** Lo que se ve mientras la API no contesta y todavia no hay ni un paquete. */
function Esperando (): ReactNode {
  return (
    <div className="flex flex-col items-center gap-[2vmin] text-center">
      <p className="text-texto-tenue text-[5vmin]">Esperando a Ops…</p>
      <p className="text-texto-sutil text-[3vmin]">La pantalla se actualiza sola en cuanto vuelva.</p>
    </div>
  )
}
