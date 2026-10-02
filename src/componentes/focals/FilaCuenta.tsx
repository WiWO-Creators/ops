'use client'

import { memo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { FilaEspacio, type EstadosRedactados } from './FilaEspacio'
import { BarraDeReparto, RecuentoDeTramos } from './ResumenDeTramos'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { DesgloseSenales, NumeroDeScore, TRAMOS, Variacion } from '@/componentes/clientes/SemaforoCliente'
import { nombresDeFocales, type CuentaFocal, type EstadoDeSalud, type ScoreEspacio } from '@/datos/focals'
import { nombreDeCuenta } from '@/dominio/cartera'
import type { ScoreCliente } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

interface PropsFilaCuenta {
  cuenta: CuentaFocal
  mostrarFocal: boolean
  /** Los párrafos redactados en esta sesión; mandan sobre el que trajo el servidor. */
  estados: EstadosRedactados
  onEstado: (proyecto: number, estado: EstadoDeSalud) => void
}

/**
 * Una cuenta: su puntaje, cómo se reparten sus {@link GLOSARIO.espacio} y el detalle.
 *
 * El detalle arranca cerrado a propósito. Un Focal con doce cuentas necesita ver las doce de un
 * vistazo para elegir en cuál entrar; abiertas, la primera ya ocupa la pantalla entera.
 *
 * La fila entera es **un solo botón**, y no un botón con un enlace adentro: así el clic cae en
 * cualquier parte y no hay que apuntarle a una flecha de 16 píxeles. El enlace a la ficha del
 * cliente vive dentro del detalle, donde es un destino elegido y no un accidente del clic.
 *
 * Va en `memo`: escribir en el buscador vuelve a pintar el panel entero, y con una cartera global
 * de cientos de cuentas esas filas no cambian. `estados` y `onEstado` llegan estables entre teclas.
 */
export const FilaCuenta = memo(function FilaCuenta (
  { cuenta, mostrarFocal, estados, onEstado }: PropsFilaCuenta
) {
  const [abierta, setAbierta] = useState(false)
  const { cliente, espacios } = cuenta
  const tramo = TRAMOS[cliente.semaforo] ?? TRAMOS.sin_datos
  const nombre = nombreDeCuenta(cuenta)

  return (
    <article
      className={cn(
        'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 overflow-hidden border',
        abierta && 'border-linea-fuerte'
      )}
    >
      <button
        type="button"
        onClick={() => { setAbierta(!abierta) }}
        aria-expanded={abierta}
        className={cn(
          'ease-neo duration-rapida grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center',
          'gap-x-3 gap-y-1 p-3 text-start transition-colors hover:bg-hover',
          'focus-visible:outline-foco focus-visible:outline-2 focus-visible:-outline-offset-2',
          'sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]'
        )}
      >
        <span className="flex flex-col items-end gap-0.5">
          <NumeroDeScore score={cliente.score} semaforo={cliente.semaforo} className="text-cifra" />
          <Variacion puntos={cliente.variacion} />
        </span>

        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="text-texto truncate text-sm font-semibold">{nombre}</span>
            <Insignia tono={tramo.tono} tamano="chico">{tramo.etiqueta}</Insignia>
          </span>

          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <BarraDeReparto espacios={espacios} />
            <RecuentoDeTramos espacios={espacios} />
          </span>
        </span>

        {mostrarFocal && (
          <span className="col-start-2 sm:col-start-3">
            <QuienResponde cliente={cliente} />
          </span>
        )}

        <ChevronRight
          size={16}
          aria-hidden="true"
          className={cn(
            'text-texto-sutil ease-neo duration-rapida col-start-3 row-start-1 justify-self-end',
            'transition-transform sm:col-start-4',
            abierta && 'rotate-90'
          )}
        />
      </button>

      {abierta && (
        <div className="border-linea flex flex-col gap-4 border-t p-4">
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-texto-tenue text-xs antetitulo">
                Por qué el cliente tiene ese puntaje
              </h3>

              <Link
                href={`/clientes/${cliente.client_id}`}
                className={cn(
                  'text-texto-tenue hover:text-acento rounded-control ease-neo duration-rapida',
                  'inline-flex items-center gap-1 text-xs underline-offset-4 transition-colors hover:underline',
                  'focus-visible:outline-foco focus-visible:outline-2 focus-visible:outline-offset-2'
                )}
              >
                Abrir la ficha de {nombre}
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </Link>
            </div>

            <DesgloseSenales senales={cliente.senales} />
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-texto-tenue text-xs antetitulo">
              Sus {GLOSARIO.espacio.plural.toLowerCase()}
            </h3>
            <ListaEspacios espacios={espacios} estados={estados} onEstado={onEstado} />
          </section>
        </div>
      )}
    </article>
  )
})

/**
 * "Focal: Ana Pérez", o la falta de focal dicha con todas las letras.
 *
 * Solo aparece en la cartera entera. Sin este renglón la pantalla de una gerencia es una lista de
 * clientes ordenada por puntaje y nada más: sirve para ver qué está mal, no para saber con quién
 * hablarlo, que es la mitad de la pregunta.
 *
 * Una cuenta sin focal se dibuja como tal —y no se omite el renglón— porque es justamente el caso
 * que hay que ver: un cliente del que nadie responde no tiene a quién reclamarle el rojo. Por eso
 * lleva tono de aviso y el resto de las cuentas, sólo el nombre en gris: lo que hay que encontrar
 * acá es la ausencia.
 */
function QuienResponde ({ cliente }: { cliente: ScoreCliente }) {
  const nombres = nombresDeFocales(cliente)
  const focal = GLOSARIO.focal.singular

  if (nombres.length === 0) {
    return (
      <Insignia tono="aviso" tamano="chico" className="self-start">
        Sin {focal.toLowerCase()}
      </Insignia>
    )
  }

  return (
    <span className="text-texto-tenue block max-w-48 truncate text-xs">
      {focal}: <span className="text-texto">{nombres.join(', ')}</span>
    </span>
  )
}

/** Los {@link GLOSARIO.espacio} de una cuenta, del peor al mejor. */
function ListaEspacios (
  { espacios, estados, onEstado }: {
    espacios: ScoreEspacio[]
    estados: EstadosRedactados
    onEstado: (proyecto: number, estado: EstadoDeSalud) => void
  }
) {
  if (espacios.length === 0) {
    return (
      <p className="text-texto-tenue text-sm">
        Este cliente no tiene ningún {GLOSARIO.espacio.singular.toLowerCase()}, así que no hay nada
        que puntuar acá abajo.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {espacios.map((espacio) => (
        <li key={espacio.project_id}>
          <FilaEspacio
            espacio={espacio}
            estado={estados[espacio.project_id] ?? espacio.estado}
            onEstado={onEstado}
          />
        </li>
      ))}
    </ul>
  )
}
