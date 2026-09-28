'use client'

import Link from 'next/link'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { EnlaceProyecto } from '@/componentes/presentadores/EnlaceProyecto'
import { GrupoEnlacesPersona } from '@/componentes/presentadores/GrupoEnlacesPersona'
import { BarraProgreso } from './CabeceraProyecto'
import type { Columna } from '@/definiciones/tipos'
import type { Espacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { puedeVerSeccion } from '@/dominio/permisos'
import { DistintivoSolicitud } from './SolicitudDeEliminacion'
import { cn } from '@/lib/clases'

/**
 * Enriquecimiento visual de las columnas del listado de Proyectos.
 *
 * Las columnas se declaran una sola vez, en `src/definiciones/espacios.ts`, con presentadores de
 * texto plano —eso es lo que exporta el CSV, y un `.ts` no puede contener JSX—. Acá se reemplazan
 * los presentadores de las columnas que merecen algo mas que texto: el nombre, que ademas lleva las
 * acciones de fila; las etiquetas; los miembros; y el avance, con su barra.
 *
 * Reemplazar en vez de redeclarar es lo que evita que la lista de columnas viva en dos lugares y se
 * desincronice: si mañana se agrega una columna a la definicion, aparece sola en la tabla.
 */

export interface AccionesDeFila {
  capacidades: Capacidad[]
  onCopiar: (espacio: Espacio) => void
  onEditar: (espacio: Espacio) => void
  onEliminar: (espacio: Espacio) => void
}

/**
 * Devuelve las columnas con los presentadores ricos ya puestos.
 *
 * @param columnas Columnas de la definicion, incluidas las de campos personalizados.
 * @param acciones Permisos y manejadores de las acciones de fila. Ausente = la celda del nombre
 *        pinta solo el enlace, sin las acciones al pasar el mouse: es el caso de una tabla acotada
 *        (la pestaña Proyectos de un Cliente) que no ofrece copiar, editar ni eliminar desde ahi.
 * @returns Un array nuevo; las columnas originales no se mutan.
 */
export function enriquecerColumnas (
  columnas: Array<Columna<Espacio>>,
  acciones?: AccionesDeFila
): Array<Columna<Espacio>> {
  return columnas.map((columna) => {
    if (columna.clave === 'name') {
      return { ...columna, presentar: (espacio: Espacio) => <CeldaNombre espacio={espacio} acciones={acciones} /> }
    }

    if (columna.clave === 'tags') {
      return { ...columna, presentar: (espacio: Espacio) => <Etiquetas etiquetas={espacio.tags} maximo={2} /> }
    }

    if (columna.clave === 'members') {
      return { ...columna, presentar: (espacio: Espacio) => <GrupoEnlacesPersona personas={espacio.members ?? []} maximo={3} /> }
    }

    if (columna.clave === 'progress') {
      return { ...columna, presentar: (espacio: Espacio) => <CeldaAvance porcentaje={espacio.progress} /> }
    }

    return columna
  })
}

/** Avance con su barra y el porcentaje al lado, la misma presentacion en cualquier tabla de Espacios. */
function CeldaAvance ({ porcentaje }: { porcentaje: number }) {
  return (
    <span className="flex items-center gap-2">
      <BarraProgreso porcentaje={porcentaje} className="min-w-16" />
      <span className="text-texto-tenue w-9 shrink-0 text-right text-xs tabular-nums">{porcentaje}%</span>
    </span>
  )
}

/**
 * Celda del nombre: el enlace a la ficha y, si hay `acciones`, las que aparecen al pasar el mouse.
 *
 * Las acciones no se ocultan con `display:none` sino con opacidad, asi siguen alcanzables con el
 * teclado: `focus-within` las muestra en cuanto una recibe el foco. Cada una aparece solo si la
 * persona tiene la capacidad correspondiente — ocultar no autoriza, pero ofrecer un boton que siempre
 * responde 403 es peor que no ofrecerlo.
 */
function CeldaNombre ({ espacio, acciones }: { espacio: Espacio, acciones: AccionesDeFila | undefined }) {
  const capacidades = acciones?.capacidades ?? []

  return (
    <span className="group/fila flex min-w-0 items-center gap-2">
      <EnlaceProyecto
        id={espacio.id}
        nombre={espacio.name}
        capacidades={acciones !== undefined ? capacidades : undefined}
      />

      {/* El pedido de eliminacion se lee junto al nombre y no en una columna propia: cambia como se
          lee la fila entera, y una columna mas obligaria a mirar a la derecha para enterarse. */}
      <DistintivoSolicitud solicitud={espacio.deletion_request} />

      {acciones !== undefined && (
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150',
            'group-hover/fila:opacity-100 focus-within:opacity-100'
          )}
        >
          {puedeVerSeccion(capacidades, 'projects') && (
            <EnlaceAccion href={`/proyectos/${espacio.id}`}>Ver</EnlaceAccion>
          )}
          {capacidades.includes('create') && (
            <BotonAccion onClick={() => { acciones.onCopiar(espacio) }}>Copiar</BotonAccion>
          )}
          {capacidades.includes('edit') && (
            <BotonAccion onClick={() => { acciones.onEditar(espacio) }}>Editar</BotonAccion>
          )}
          {capacidades.includes('delete') && (
            <BotonAccion peligrosa onClick={() => { acciones.onEliminar(espacio) }}>Eliminar</BotonAccion>
          )}
        </span>
      )}
    </span>
  )
}

const CLASES_ACCION = 'rounded-control px-1.5 py-0.5 text-xs whitespace-nowrap hover:bg-hover'

/** Accion de fila que navega. */
function EnlaceAccion ({ href, children }: { href: string, children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(CLASES_ACCION, 'text-texto-tenue hover:text-texto')}>
      {children}
    </Link>
  )
}

/** Accion de fila que abre un dialogo. No es un `Boton` del sistema: dentro de una celda densa, un control de 32px de alto rompe el alto de la fila. */
function BotonAccion ({
  peligrosa = false,
  onClick,
  children
}: {
  peligrosa?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(CLASES_ACCION, peligrosa ? 'text-texto-peligro' : 'text-texto-tenue hover:text-texto')}
    >
      {children}
    </button>
  )
}
