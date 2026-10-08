'use client'

import { Suspense, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Muestra, SeccionTaller } from '@/componentes/estructura/Muestra'
import { EntradaEscalonada } from '@/componentes/estructura/EntradaEscalonada'
import { Plegable } from '@/componentes/estructura/Plegable'
import { FirmaDeMarca, TituloDeFicha } from '@/componentes/estructura/TituloModulo'
import { BotonFiltroEnUrl } from '@/componentes/datos/BotonFiltroEnUrl'
import { Boton } from '@/componentes/formularios/Boton'
import { MatrizAsignacion, type CargaDeAsignacion } from '@/componentes/formularios/MatrizAsignacion'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { Avatar } from '@/componentes/presentadores/Avatar'
import type { Resultado } from '@/componentes/datos/mutaciones'
import type { StaffReferencia } from '@/datos/tipos'
import { cn } from '@/lib/clases'
import { PERSONAS_DE_EJEMPLO } from './datos-de-ejemplo'

/** Lo que tarda la carga y el guardado simulados de la matriz: lo justo para ver sus estados. */
const LATENCIA_SIMULADA_MS = 600

const FILAS_ESCALONADAS = ['Revisar el contrato', 'Migrar los adjuntos', 'Publicar la guía', 'Cerrar el mes']

/**
 * Espera la latencia simulada y devuelve un valor, como lo haria la API.
 *
 * @param valor lo que "contesta" el backend de ejemplo
 * @returns una promesa con `valor` tras `LATENCIA_SIMULADA_MS`
 */
function contestar<T> (valor: T): Promise<T> {
  return new Promise((resolver) => { setTimeout(() => { resolver(valor) }, LATENCIA_SIMULADA_MS) })
}

/**
 * Alterna `?taller_filtro=1` en la URL del taller.
 *
 * @param params la query actual
 * @returns la query con el filtro alternado y el resto intacto
 */
function alternarFiltro (params: URLSearchParams): URLSearchParams {
  const siguiente = new URLSearchParams(params)
  if (siguiente.has('taller_filtro')) siguiente.delete('taller_filtro')
  else siguiente.set('taller_filtro', '1')
  return siguiente
}

/** La matriz de asignacion contra un backend de ejemplo en memoria. */
function MatrizDeEjemplo () {
  const [asignados, setAsignados] = useState<StaffReferencia[]>(PERSONAS_DE_EJEMPLO.slice(0, 2))

  const cargar = (): Promise<CargaDeAsignacion<StaffReferencia, StaffReferencia>> =>
    contestar({ opciones: PERSONAS_DE_EJEMPLO, asignados })

  const guardar = async (ids: number[]): Promise<Resultado<StaffReferencia[]>> => {
    const nuevos = PERSONAS_DE_EJEMPLO.filter((persona) => ids.includes(persona.id))
    setAsignados(nuevos)
    return await contestar({ ok: true as const, datos: nuevos })
  }

  return (
    <MatrizAsignacion<StaffReferencia, StaffReferencia>
      clave="taller"
      puedeEditar
      cargar={cargar}
      guardar={guardar}
      idDe={(persona) => persona.id}
      comoOpcion={(persona) => persona}
      textos={{
        cargando: 'Cargando las personas…',
        falloDeCarga: 'No se pudieron cargar las personas.',
        leyenda: 'Responsables de la cuenta',
        descripcion: <p className="text-texto-tenue mb-2 text-xs">Cambia la lista y guarda: nada sale del navegador.</p>,
        sinNinguno: 'La cuenta quedará sin responsables.',
        guardar: 'Guardar responsables',
        exito: 'Responsables de «Acme» actualizados.',
        vacio: { titulo: 'Sin responsables', descripcion: 'Nadie responde por esta cuenta todavía.' }
      }}
      selector={(opciones, elegidas, onCambiar) => (
        <SelectorPersonas personas={opciones} elegidas={elegidas} onCambiar={onCambiar} />
      )}
      chipConImagen
      chip={(persona) => (
        <span className="flex items-center gap-2 text-sm">
          <Avatar nombre={persona.full_name} imagen={persona.profile_image_url} tamano="chico" />
          {persona.full_name}
        </span>
      )}
    />
  )
}

/** Las piezas que agrego el plan de pulido: plegado, entrada escalonada, firma, filtros y matriz. */
export function SeccionPiezasDelSistema () {
  const idPanel = useId()
  const [abierto, setAbierto] = useState(false)
  const [tanda, setTanda] = useState(0)

  return (
    <SeccionTaller
      titulo="Piezas del sistema"
      nota="Plegable anima el alto con grid-rows, no con max-height; EntradaEscalonada es el único escalonado (anime.js) y respeta reducir movimiento; el filtro vive en la URL para sobrevivir al refresco."
    >
      <Muestra etiqueta="plegable" className="w-full max-w-sm">
        <div className="flex w-full flex-col gap-2">
          <Boton variante="sutil" className="self-start" aria-expanded={abierto} aria-controls={idPanel} onClick={() => { setAbierto((a) => !a) }}>
            Historial
            <ChevronDown size={16} aria-hidden="true" className={cn('ease-neo transition-transform duration-rapida', abierto && 'rotate-180')} />
          </Boton>
          <Plegable id={idPanel} abierto={abierto} className="-mt-2" claseContenido="pt-2">
            <p className="text-texto-tenue text-sm">Plegado queda con alto cero y no deja hueco al pie.</p>
          </Plegable>
        </div>
      </Muestra>
      <Muestra etiqueta="entrada escalonada" className="w-full max-w-sm">
        <div className="flex w-full flex-col gap-2">
          <Boton variante="sutil" tamano="chico" className="self-start" onClick={() => { setTanda((t) => t + 1) }}>Repetir</Boton>
          <EntradaEscalonada clave={tanda} densa>
            <ul className="flex flex-col gap-1">
              {FILAS_ESCALONADAS.map((fila) => (
                <li key={fila} data-entrada="item" className="border-linea rounded-chico border px-3 py-2 text-sm">{fila}</li>
              ))}
            </ul>
          </EntradaEscalonada>
        </div>
      </Muestra>
      <Muestra etiqueta="título de ficha y firma">
        <div className="flex flex-col gap-2">
          <TituloDeFicha>Acme Corporation</TituloDeFicha>
          <FirmaDeMarca />
        </div>
      </Muestra>
      <Muestra etiqueta="filtro en la URL">
        <Suspense fallback={null}>
          <BotonFiltroEnUrl etiqueta="Completadas" activo={(params) => params.has('taller_filtro')} alternar={alternarFiltro} />
        </Suspense>
      </Muestra>
      <Muestra etiqueta="matriz de asignación" className="w-full max-w-md">
        <div className="w-full">
          <MatrizDeEjemplo />
        </div>
      </Muestra>
    </SeccionTaller>
  )
}
