'use client'

import { memo } from 'react'
import { QuienResponde } from './DetalleDeCuenta'
import { BarraDeReparto, RecuentoDeTramos } from './ResumenDeTramos'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { NumeroDeScore, TRAMOS, Variacion } from '@/componentes/clientes/SemaforoCliente'
import { nombreDe, type CuentaFocal } from '@/datos/focals'
import { nombreDeCuenta } from '@/dominio/cartera'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

interface PropsCuadricula {
  cuentas: CuentaFocal[]
  mostrarFocal: boolean
  /** El logo de cada cliente, por id; sin entrada, la tarjeta usa las iniciales. */
  logos: Readonly<Record<number, string>>
  /** La cuenta abierta en el panel, para marcar su tarjeta. */
  abierta: number | null
  onAbrir: (clienteId: number) => void
  /** Los Proyectos que hicieron aparecer a cada cuenta en la búsqueda, por cliente. */
  coincidencias: ReadonlyMap<number, readonly number[]>
}

/**
 * Las cuentas de una página, como tarjetas.
 *
 * Una tarjeta por cuenta con su cara (el logo del cliente), el puntaje a la vista y quién responde
 * por ella: lo que hace falta para decidir a cuál entrar. El detalle no se despliega acá sino en un
 * panel lateral, y la lista se pagina: doce tarjetas caben en una pantalla, 133 no.
 *
 * @param cuentas las cuentas de la página, ya filtradas y ordenadas
 * @param mostrarFocal si cada tarjeta nombra a quien responde: solo en la cartera entera
 * @param logos el logo de cada cliente, por id
 * @param abierta el cliente cuyo detalle está abierto, si hay alguno
 * @param onAbrir pide abrir el detalle de un cliente
 * @param coincidencias los Proyectos que coincidieron con la búsqueda, por cliente
 */
export function CuadriculaDeCuentas ({ cuentas, mostrarFocal, logos, abierta, onAbrir, coincidencias }: PropsCuadricula) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cuentas.map((cuenta) => {
        const id = cuenta.cliente.client_id

        return (
          <li key={id} className="flex">
            <TarjetaDeCuenta
              cuenta={cuenta}
              mostrarFocal={mostrarFocal}
              logo={logos[id] ?? null}
              seleccionada={abierta === id}
              onAbrir={onAbrir}
              coincidencias={coincidencias.get(id) ?? null}
            />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Una cuenta. Va en `memo`: escribir en el buscador repinta la página entera y la mayoría de las
 * tarjetas no cambia.
 *
 * Toda la tarjeta es el área de clic, pero el control es **un solo botón**, el del nombre, extendido
 * con un pseudo-elemento: así no hay un botón con otros adentro, y el teclado y el lector de pantalla
 * ven un único destino por tarjeta.
 */
const TarjetaDeCuenta = memo(function TarjetaDeCuenta (
  { cuenta, mostrarFocal, logo, seleccionada, onAbrir, coincidencias }: {
    cuenta: CuentaFocal
    mostrarFocal: boolean
    logo: string | null
    seleccionada: boolean
    onAbrir: (clienteId: number) => void
    coincidencias: readonly number[] | null
  }
) {
  const { cliente, espacios } = cuenta
  const tramo = TRAMOS[cliente.semaforo] ?? TRAMOS.sin_datos
  const nombre = nombreDeCuenta(cuenta)
  const proyectosQueCoinciden = espacios.filter((espacio) => coincidencias?.includes(espacio.project_id) === true)

  return (
    <article
      className={cn(
        'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 relative flex w-full flex-col gap-3 border p-4',
        'ease-neo duration-rapida transition-colors hover:bg-hover',
        'has-[:focus-visible]:outline-foco has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
        seleccionada && 'border-acento'
      )}
    >
      <header className="flex items-start gap-3">
        <Avatar nombre={nombre} imagen={logo} tamano="ficha" sinTitulo className="rounded-medio" />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => { onAbrir(cliente.client_id) }}
            className={cn(
              'text-texto rounded-control truncate text-start text-sm font-semibold',
              'focus-visible:outline-none after:absolute after:inset-0 after:content-[""]'
            )}
          >
            {nombre}
          </button>
          <Insignia tono={tramo.tono} tamano="chico" className="self-start">{tramo.etiqueta}</Insignia>
        </div>

        <div className="flex flex-col items-end gap-1">
          <NumeroDeScore score={cliente.score} semaforo={cliente.semaforo} className="text-cifra" />
          <Variacion puntos={cliente.variacion} ocultarSinCambio />
        </div>
      </header>

      <div className="flex flex-col gap-1.5">
        <BarraDeReparto espacios={espacios} />
        <RecuentoDeTramos espacios={espacios} />
        {proyectosQueCoinciden.length > 0 && (
          <span className="text-acento text-xs">Coincide: {proyectosQueCoinciden.map(nombreDe).join(', ')}</span>
        )}
      </div>

      {mostrarFocal && (
        <footer className="border-linea-suave mt-auto flex flex-col gap-0.5 border-t pt-2">
          <span className="text-texto-sutil text-xs">{GLOSARIO.focal.singular}</span>
          <QuienResponde cliente={cliente} />
        </footer>
      )}
    </article>
  )
})
