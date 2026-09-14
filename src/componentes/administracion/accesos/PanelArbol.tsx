'use client'

import { useEffect, useState } from 'react'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { pedirSobre } from '@/datos/cliente'
import { arbolDePersonas, type RamaDelArbol } from '@/dominio/accesos'
import { etiquetaDeEscalon } from '@/dominio/escalon'
import { CabeceraDePanel } from './piezas'
import type { NodoDeArbol } from '@/datos/accesos'

/**
 * El árbol de personas: de quién cuelga cada uno.
 *
 * **Es la pieza que hace entendible el resto de la pantalla.** El alcance de una persona es su
 * descendencia acá —la cadena de jefes, más la gente del área que dirija—, no su escalón: un
 * `director` sin nadie debajo ve exactamente lo suyo. Sin poder ver el árbol, la pregunta "por qué
 * esta persona ve esto" solo se contesta abriendo la base, que es justo lo que pasaba antes.
 *
 * Es de lectura: el jefe de cada persona se cambia en la pestaña Personas, que es donde está el
 * resto de sus datos. Duplicar la edición acá sería una segunda puerta al mismo campo.
 *
 * Quien no cuelga de nadie aparece como raíz, y también quien cuelga de alguien que no está en la
 * lista. No se esconde a nadie: un árbol que se traga gente en silencio es el problema, no la
 * solución.
 */
export function PanelArbol () {
  const [nodos, setNodos] = useState<NodoDeArbol[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<NodoDeArbol[]>('accesos/arbol', control.signal)
      .then((sobre) => { setNodos(sobre.data) })
      .catch((problema: unknown) => {
        if (control.signal.aborted) return

        setError(problema instanceof Error ? problema.message : 'No se pudo leer el árbol de personas.')
      })

    return () => { control.abort() }
  }, [])

  const ramas = nodos === null ? [] : arbolDePersonas(nodos)

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Árbol de personas"
        descripcion="De quién cuelga cada uno. Lo que alguien ve es su descendencia en este árbol, no su escalón: el escalón solo nombra el puesto."
      />

      {error !== null && <ErrorEstado detalle={error} />}

      {error === null && nodos === null && (
        <Cargando alto="min-h-56" mensaje="Cargando el árbol…" />
      )}

      {error === null && nodos !== null && ramas.length === 0 && (
        <Vacio
          titulo="Todavía no hay árbol"
          descripcion="Ninguna persona tiene jefe puesto. Hasta que lo tengan, cada una ve solo lo suyo."
        />
      )}

      {error === null && ramas.length > 0 && (
        <ul className="flex flex-col gap-1">
          {ramas.map((rama) => <Rama key={rama.nodo.staffid} rama={rama} />)}
        </ul>
      )}
    </div>
  )
}

/**
 * Una persona y su descendencia.
 *
 * La sangría es `padding` y no `margin` para que la línea de la izquierda —la que deja ver de dónde
 * cuelga cada rama— llegue hasta el borde de la fila y no se corte a mitad de camino.
 */
function Rama ({ rama }: { rama: RamaDelArbol }) {
  const cuantos = contarDescendencia(rama)

  return (
    <li>
      <div className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-wrap items-center gap-2 border px-3 py-2">
        <span className="text-texto text-sm font-medium">{rama.nodo.nombre}</span>
        <Insignia tono="contorno" tamano="chico">{etiquetaDeEscalon(rama.nodo.escalon)}</Insignia>
        {cuantos > 0 && (
          <span className="text-texto-tenue text-xs">
            {cuantos === 1 ? '1 persona debajo' : `${cuantos} personas debajo`}
          </span>
        )}
      </div>

      {rama.hijas.length > 0 && (
        <ul className="border-linea ml-3 flex flex-col gap-1 border-l pt-1 pl-3">
          {rama.hijas.map((hija) => <Rama key={hija.nodo.staffid} rama={hija} />)}
        </ul>
      )}
    </li>
  )
}

/**
 * Cuánta gente cuelga de esta rama, sin contarla a ella.
 *
 * @param rama La rama a contar.
 * @returns El total de su descendencia.
 */
function contarDescendencia (rama: RamaDelArbol): number {
  return rama.hijas.reduce((suma, hija) => suma + 1 + contarDescendencia(hija), 0)
}
