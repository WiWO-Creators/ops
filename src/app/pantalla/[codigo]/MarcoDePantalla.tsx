'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { horaDeReloj } from '@/dominio/momento-del-dia'
import type { Escena, Frescura, Orientacion, ParametrosDePantalla } from '@/dominio/pantalla-area'

interface Props {
  area: string | null
  guion: Escena[]
  escenaId: string | null
  /**
   * La clave de continuidad de la escena: ver `Escena.continuidad` en el dominio.
   *
   * Es el `key` del cuerpo. Entre dos paginas del mismo tablero no cambia, y por eso la cabecera de
   * la escena y los rotulos de columna NO se remontan: lo unico que se mueve son las filas.
   */
  continuidad: string | null
  frescura: Frescura
  esperando: boolean
  /** El reloj del navegador, o `null` antes de hidratar. */
  ahora: number | null
  zona: string | null
  orientacion: Orientacion
  zoom: number
  margen: number
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
  const {
    area, guion, escenaId, continuidad, frescura, esperando, ahora, zona, orientacion, zoom, margen,
    tema, transicion, children
  } = props

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
      // El margen se aplica al contenedor entero y no a cada bloque: lo que compensa es el recorte
      // del televisor, que se come los cuatro bordes por igual.
      style={{ '--escala': zoom, padding: `${margen}vmin` } as React.CSSProperties}
      data-escena={escenaId ?? ''}
      // Lo lee el CSS para apagar las animaciones de fila con `?transicion=ninguna`, que existe para
      // el televisor que no da abasto. Ver `pantalla.css`.
      data-transicion={transicion}
      data-escena-desde={desde}
      data-frescura={frescura}
      data-orientacion={orientacion}
    >
      <header className="pantalla-deriva flex items-baseline justify-between px-[4vmin] pt-[3vmin] portrait:pt-[5vmin]">
        <h1 className="text-texto-tenue truncate text-[3vmin] font-semibold tracking-[0.2em] uppercase">
          {area ?? 'WiWO Ops'}
        </h1>
        <Reloj ahora={ahora} zona={zona} />
      </header>

      <section
        /*
         * `key` por CONTINUIDAD y no por id de escena.
         *
         * Remonta el bloque —y con el reinicia su fundido— cuando se cambia de vista de verdad, y
         * nunca porque llegaron datos nuevos. La diferencia con el id es el paginado: dos paginas de
         * `trabajando` son la misma vista con otras filas, asi que comparten continuidad, el marco se
         * queda montado y lo unico que se mueve son los `<li>`, que voltean uno a uno. Dos anuncios,
         * en cambio, son dos laminas distintas y ahi si se funde entero.
         *
         * Quien decide cual es cual es el dominio (`Escena.continuidad`), no este componente: es una
         * afirmacion sobre el guion y se prueba sin navegador.
         */
        key={continuidad ?? escenaId ?? 'vacio'}
        className={cn(
          // `justify-start` y no `justify-center`: con el contenido centrado, el titulo de la escena
          // cambia de altura segun cuantas fichas haya, y en una pared eso se lee como que la pantalla
          // salta. Cada escena decide por su cuenta si se centra —la portada lo hace—.
          'flex min-h-0 flex-col justify-start px-[4vmin] py-[2vmin]',
          transicion !== 'ninguna' && 'pantalla-escena'
        )}
        style={transicion === 'vista' ? { viewTransitionName: 'escena' } : undefined}
      >
        {esperando ? <Esperando /> : children}
      </section>

      <footer className="pantalla-deriva flex flex-col gap-[1.2vmin] px-[4vmin] pb-[3vmin] portrait:pb-[5vmin]">
        <div className="flex items-center justify-between">
          <Puntos guion={guion} escenaId={escenaId} />
          <Estado frescura={frescura} esperando={esperando} />
        </div>

        <div className="bg-linea-suave h-[0.5vmin] w-full overflow-hidden rounded-full">
          {escena !== null && (
            <div
              // `key` por ID de escena y no por continuidad: la barra mide UNA pagina, asi que tiene
              // que rearrancar en cada una. Sin `key` el `<div>` se reutiliza, la animacion no vuelve
              // a empezar y la barra se queda vacia el resto de la vuelta — que es justo lo contrario
              // de lo que esta ahi para decir.
              key={escenaId ?? 'vacio'}
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
 *
 * El formateo lo hace `horaDeReloj()` y no un `Intl` propio: la escena `momento` muestra la misma hora
 * en 22vmin en mitad de la pared, y los dos relojes visibles a la vez no pueden discrepar ni en el
 * minuto ni en el formato.
 */
function Reloj ({ ahora, zona }: { ahora: number | null, zona: string | null }): ReactNode {
  if (ahora === null) {
    return <p className="text-texto-tenue text-[3vmin] tabular-nums">--:--</p>
  }

  return (
    <p className="text-texto text-[3.2vmin] font-semibold tabular-nums">
      {horaDeReloj(ahora, zona)}
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
