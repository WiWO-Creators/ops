'use client'

import Link from 'next/link'
import { Etiquetas } from '@/componentes/presentadores/Etiqueta'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import type { Columna } from '@/definiciones/tipos'
import type { Espacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { puedeVerSeccion } from '@/dominio/permisos'
import { cn } from '@/lib/clases'

/**
 * Enriquecimiento visual de las columnas del listado de Proyectos.
 *
 * Las columnas se declaran una sola vez, en `src/definiciones/espacios.ts`, con presentadores de
 * texto plano —eso es lo que exporta el CSV, y un `.ts` no puede contener JSX—. Acá se reemplazan
 * los presentadores de las tres columnas que merecen algo mas que texto: el nombre, que ademas lleva
 * las acciones de fila; las etiquetas; y los miembros.
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
 * @param acciones Permisos y manejadores de las acciones de fila.
 * @returns Un array nuevo; las columnas originales no se mutan.
 */
export function enriquecerColumnas (
  columnas: Array<Columna<Espacio>>,
  acciones: AccionesDeFila
): Array<Columna<Espacio>> {
  return columnas.map((columna) => {
    if (columna.clave === 'name') {
      return { ...columna, presentar: (espacio: Espacio) => <CeldaNombre espacio={espacio} acciones={acciones} /> }
    }

    if (columna.clave === 'tags') {
      return { ...columna, presentar: (espacio: Espacio) => <Etiquetas etiquetas={espacio.tags} maximo={2} /> }
    }

    if (columna.clave === 'members') {
      return { ...columna, presentar: (espacio: Espacio) => <GrupoAvatares personas={espacio.members ?? []} maximo={3} /> }
    }

    return columna
  })
}

/**
 * Celda del nombre: el enlace a la ficha y las acciones que aparecen al pasar el mouse.
 *
 * Las acciones no se ocultan con `display:none` sino con opacidad, asi siguen alcanzables con el
 * teclado: `focus-within` las muestra en cuanto una recibe el foco. Cada una aparece solo si la
 * persona tiene la capacidad correspondiente — ocultar no autoriza, pero ofrecer un boton que siempre
 * responde 403 es peor que no ofrecerlo.
 */
function CeldaNombre ({ espacio, acciones }: { espacio: Espacio, acciones: AccionesDeFila }) {
  const { capacidades, onCopiar, onEditar, onEliminar } = acciones

  return (
    <span className="group/fila flex min-w-0 items-center gap-2">
      {puedeVerSeccion(capacidades, 'projects')
        ? (
          <Link href={`/espacios/${espacio.id}`} className="hover:text-acento truncate font-medium">
            {espacio.name}
          </Link>
          )
        : <span className="truncate font-medium">{espacio.name}</span>}

      <span
        className={cn(
          'flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150',
          'group-hover/fila:opacity-100 focus-within:opacity-100'
        )}
      >
        {puedeVerSeccion(capacidades, 'projects') && (
          <EnlaceAccion href={`/espacios/${espacio.id}`}>Ver</EnlaceAccion>
        )}
        {capacidades.includes('create') && (
          <BotonAccion onClick={() => { onCopiar(espacio) }}>Copiar</BotonAccion>
        )}
        {capacidades.includes('edit') && (
          <BotonAccion onClick={() => { onEditar(espacio) }}>Editar</BotonAccion>
        )}
        {capacidades.includes('delete') && (
          <BotonAccion peligrosa onClick={() => { onEliminar(espacio) }}>Eliminar</BotonAccion>
        )}
      </span>
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
