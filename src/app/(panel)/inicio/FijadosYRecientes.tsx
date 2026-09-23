'use client'

import Link from 'next/link'
import { Building2, FolderKanban, Search, Star } from 'lucide-react'
import { useEffect } from 'react'
import { sembrarFijados, useFijados } from '@/componentes/fijados/almacen'
import { claveDeElemento, hrefDeElemento, type ElementoPersonal, type Fijado, type Reciente } from '@/componentes/fijados/fijados'
import { abrirPaleta } from '@/componentes/paleta/abrir'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { formatearRelativo } from '@/lib/fechas'

/** Cuantos recientes se muestran en el Inicio: los que no estan ya fijados, hasta seis. */
const RECIENTES_EN_INICIO = 6

/**
 * "Fijados y recientes": la vuelta rapida a lo que la persona usa, arriba de todo en el Inicio.
 *
 * Reemplaza a la grilla "Ir a", que repetia el menu con tarjetas grandes. Lo que ofrecia —ir a una
 * seccion— hoy esta en el menu y en la paleta (`Ctrl K`); lo que faltaba era ir a UN Proyecto o
 * Cliente concreto, que es lo que esta persona abre todos los dias.
 *
 * Los fijados salen de la copia del navegador (`useFijados`) y no solo de lo que trajo el servidor:
 * si la persona quita una estrella desde el menu o desde una ficha, este bloque se entera en el
 * mismo fotograma. Los recientes son del servidor y no cambian mientras se mira el Inicio.
 *
 * Un reciente que ya esta fijado no se repite: estaria dos veces a la misma distancia.
 *
 * @param fijados lo que trajo el servidor, para el primer render
 * @param recientes los ultimos abiertos segun `GET /me/recientes`
 */
export function FijadosYRecientes ({ fijados: iniciales, recientes }: { fijados: Fijado[], recientes: Reciente[] }) {
  const fijados = useFijados(iniciales)
  const claves = new Set(fijados.map(claveDeElemento))
  const soloRecientes = recientes.filter((reciente) => !claves.has(claveDeElemento(reciente))).slice(0, RECIENTES_EN_INICIO)

  useEffect(() => { sembrarFijados(iniciales) }, [iniciales])

  if (fijados.length === 0 && soloRecientes.length === 0) return <SinNadaTodavia />

  return (
    <section className="flex flex-col gap-5">
      <TituloModulo nivel="h2" titulo="Fijados y recientes" acciones={<BotonBuscar />} />

      <div className="grid gap-5 lg:grid-cols-5">
        {fijados.length > 0 && (
          <ul aria-label="Fijados" className="grid content-start gap-3 sm:grid-cols-2 lg:col-span-3">
            {fijados.map((fijado, orden) => (
              <li key={claveDeElemento(fijado)} className="animate-entrar-abajo" style={{ animationDelay: `${Math.min(orden, 8) * 30}ms` }}>
                <TarjetaFijado elemento={fijado} />
              </li>
            ))}
          </ul>
        )}

        {soloRecientes.length > 0 && (
          <div className={fijados.length > 0 ? 'lg:col-span-2' : 'lg:col-span-5'}>
            <h3 className="text-texto-sutil mb-2 px-1 text-sm font-semibold">Abiertos hace poco</h3>
            <ul className="divide-linea border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col divide-y overflow-hidden border">
              {soloRecientes.map((reciente) => (
                <li key={claveDeElemento(reciente)}>
                  <FilaReciente elemento={reciente} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

/** El icono de cada tipo: el mismo que usa el menu. */
function IconoDe ({ elemento, className }: { elemento: ElementoPersonal, className?: string }) {
  const Icono = elemento.type === 'project' ? FolderKanban : Building2
  return <Icono size={18} strokeWidth={2} aria-hidden="true" className={className} />
}

/** Lo que va debajo del nombre: el cliente de un Proyecto, o que es un Cliente. */
function detalleDe (elemento: ElementoPersonal): string {
  return elemento.type === 'project' ? elemento.client?.company ?? 'Proyecto sin cliente' : 'Cliente'
}

/**
 * Un fijado como tarjeta: nombre grande, a quien pertenece y la estrella que dice por que esta aca.
 *
 * @returns el enlace a la ficha
 */
function TarjetaFijado ({ elemento }: { elemento: Fijado }) {
  return (
    <Link
      href={hrefDeElemento(elemento)}
      className="group border-linea bg-superficie-elevada rounded-tarjeta shadow-1 hover:border-linea-fuerte flex items-center gap-3 border px-4 py-3 transition-[border-color,transform] duration-150 ease-neo active:scale-[0.99]"
    >
      <span className="bg-acento/10 text-acento rounded-control inline-flex size-9 shrink-0 items-center justify-center">
        <IconoDe elemento={elemento} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-texto truncate text-base font-semibold">{elemento.name}</span>
        <span className="text-texto-tenue truncate text-sm">{detalleDe(elemento)}</span>
      </span>
      <Star size={14} strokeWidth={2} aria-label="Fijado" className="text-acento shrink-0 fill-current" />
    </Link>
  )
}

/**
 * Un reciente como fila: nombre, a quien pertenece y hace cuanto se abrio.
 *
 * @returns el enlace a la ficha
 */
function FilaReciente ({ elemento }: { elemento: Reciente }) {
  return (
    <Link
      href={hrefDeElemento(elemento)}
      className="hover:bg-hover focus-visible:bg-hover flex items-center gap-3 px-4 py-3 transition-colors duration-150 ease-neo"
    >
      <IconoDe elemento={elemento} className="text-texto-sutil shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-texto truncate text-sm">{elemento.name}</span>
        <span className="text-texto-sutil truncate text-xs">{detalleDe(elemento)}</span>
      </span>
      {/* El servidor y el navegador calculan "hace N minutos" con segundos de diferencia; el texto
          puede no coincidir y eso no es un error de hidratacion que valga la pena reportar. */}
      <span suppressHydrationWarning className="text-texto-sutil shrink-0 text-xs">{formatearRelativo(elemento.viewed_at)}</span>
    </Link>
  )
}

/** El boton que abre la paleta, el reemplazo de la grilla "Ir a". */
function BotonBuscar () {
  return (
    <button
      type="button"
      onClick={abrirPaleta}
      className="text-acento hover:bg-hover rounded-control flex items-center gap-1.5 px-3 py-2 text-base font-semibold transition-colors duration-150 ease-neo"
    >
      <Search size={18} strokeWidth={2.25} aria-hidden="true" />
      Buscar o ir a
    </button>
  )
}

/**
 * Sin fijados ni recientes: se explica como se llenan, en una linea y sin marco (un marco vacio se
 * lee como "algo fallo").
 *
 * @returns la invitacion
 */
function SinNadaTodavia () {
  return (
    <section className="flex flex-col gap-3">
      <TituloModulo nivel="h2" titulo="Fijados y recientes" acciones={<BotonBuscar />} />
      <p className="text-texto-tenue max-w-prose text-base">
        Toca la estrella <Star size={16} strokeWidth={2} aria-hidden="true" className="inline align-text-bottom" /> en la ficha de un proyecto o de un cliente para tenerlo siempre a mano acá y en el menú. Lo que abras también va a aparecer acá.
      </p>
    </section>
  )
}
