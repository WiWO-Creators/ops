'use client'

import {
  CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla
} from '@/componentes/datos/Tabla'
import { ESCALONES } from '@/dominio/escalon'
import { CabeceraDePanel } from './piezas'
import type { CatalogoDeAccesos } from '@/datos/accesos'

interface PropsPanelEscalones {
  catalogo: CatalogoDeAccesos
}

/**
 * Los cuatro escalones jerárquicos: qué puesto nombra cada uno y cuánta gente lo tiene puesto.
 *
 * **Es una lista de lectura y no un CRUD, y eso es el cambio.** Antes los escalones se creaban, se
 * borraban y llevaban encima un piso de capacidades y un alcance, de modo que la escalera repartía
 * permisos: mover una casilla acá cambiaba lo que veía medio equipo y nadie podía reconstruir por
 * qué. Ahora el escalón **solo nombra el puesto**. Lo que decide cuánto ve alguien es el árbol de
 * personas, que tiene su propia pestaña; el escalón y el alcance dejaron de ser lo mismo.
 *
 * Los nombres salen de `dominio/escalon.ts` —la única lista del frontend— y el contador sale del
 * catálogo de la API, que es lo único que el frontend no puede saber solo. Un escalón que la API
 * traiga y acá no se conozca se muestra igual, con su clave: esconderlo dejaría gente contada en un
 * escalón invisible.
 */
export function PanelEscalones ({ catalogo }: PropsPanelEscalones) {
  const personasPorClave = new Map(catalogo.escalones.map((escalon) => [escalon.clave, escalon.personas]))
  const conocidos = new Set<string>(ESCALONES.map((escalon) => escalon.clave))
  const desconocidos = catalogo.escalones.filter((escalon) => !conocidos.has(escalon.clave))

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Escalones"
        descripcion="Los cuatro puestos de la escalera. Son fijos: no se crean ni se borran, y no otorgan nada por sí solos. Quién ve qué sale del árbol de personas."
      />

      <div className="overflow-x-auto">
        <Tabla>
          <EncabezadoTabla>
            <tr>
              <CeldaEncabezado numerica angosta>Orden</CeldaEncabezado>
              <CeldaEncabezado>Escalón</CeldaEncabezado>
              <CeldaEncabezado>Qué puesto nombra</CeldaEncabezado>
              <CeldaEncabezado numerica angosta>Personas</CeldaEncabezado>
            </tr>
          </EncabezadoTabla>
          <CuerpoTabla>
            {ESCALONES.map((escalon) => (
              <FilaTabla key={escalon.clave}>
                <CeldaTabla numerica>{escalon.orden}</CeldaTabla>
                <CeldaTabla>
                  <span className="text-texto">{escalon.nombre}</span>
                  <span className="text-texto-tenue block font-mono text-xs">{escalon.clave}</span>
                </CeldaTabla>
                <CeldaTabla>
                  <span className="text-texto-tenue block max-w-prose text-sm">{escalon.ayuda}</span>
                </CeldaTabla>
                <CeldaTabla numerica>{personasPorClave.get(escalon.clave) ?? 0}</CeldaTabla>
              </FilaTabla>
            ))}

            {desconocidos.map((escalon) => (
              <FilaTabla key={escalon.clave}>
                <CeldaTabla numerica>{escalon.orden}</CeldaTabla>
                <CeldaTabla>
                  <span className="text-texto">{escalon.nombre}</span>
                  <span className="text-texto-tenue block font-mono text-xs">{escalon.clave}</span>
                </CeldaTabla>
                <CeldaTabla>
                  <span className="text-texto-tenue block max-w-prose text-sm">
                    Este escalón lo publica la API y este panel todavía no lo conoce.
                  </span>
                </CeldaTabla>
                <CeldaTabla numerica>{escalon.personas}</CeldaTabla>
              </FilaTabla>
            ))}
          </CuerpoTabla>
        </Tabla>
      </div>
    </div>
  )
}
