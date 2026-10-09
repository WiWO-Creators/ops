'use client'

import { useMemo, type ReactElement, type ReactNode } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { CONFLICTOS_DE_FUSION, CONTEOS_DE_FUSION, DUPLICADOS_DE_FUSION } from '@/definiciones/fusion'
import type { DefinicionRecurso, ResultadoLista } from '@/definiciones/tipos'
import {
  salidaDelOrigen,
  textoDeValor,
  type ConflictoDeFusion,
  type EntidadFusionable,
  type EleccionesDeFusion,
  type LadoDeFusion,
  type PrevisualizacionDeFusion
} from '@/dominio/fusion'

/** Una tabla en modo memoria no tiene primera pagina que traer del servidor. */
const SIN_INICIAL: ResultadoLista<never> = { filas: [], paginacion: undefined }

interface PropsVistaPrevia {
  entidad: EntidadFusionable
  previa: PrevisualizacionDeFusion
  elecciones: EleccionesDeFusion
  onElegir: (campo: string, lado: LadoDeFusion) => void
}

/**
 * Lo que la fusion va a hacer, antes de hacerlo: bloqueos, lo que se mueve, los campos distintos y lo
 * que existe en los dos lados.
 *
 * Cada bloque aparece solo si tiene algo que decir —«clave ausente = bloque no dibujado», como en el
 * resto del panel—, y los bloqueos van primero porque son lo unico que impide seguir.
 *
 * @param entidad cual de las tres entidades es: decide que pasa con el origen
 * @param previa la respuesta de `merge-preview`
 * @param elecciones de que lado se queda cada campo en conflicto
 * @param onElegir recibe el campo y el lado elegido
 */
export function VistaPreviaDeFusion ({ entidad, previa, elecciones, onElegir }: PropsVistaPrevia): ReactElement {
  const { bloqueos, conteos, conflictos, duplicados, archivos, drive } = previa
  const hayArchivos = archivos.cantidad > 0 || drive.carpetas > 0
  const sinNada = conteos.length === 0 && conflictos.length === 0 && duplicados.length === 0 && !hayArchivos

  return (
    <div className="flex flex-col gap-5">
      <p className="text-texto-tenue text-sm">
        <span className="text-texto font-medium">{previa.origen.nombre}</span> {salidaDelOrigen(entidad)} y todo lo suyo queda en{' '}
        <span className="text-texto font-medium">{previa.destino.nombre}</span>.
      </p>

      {!previa.habilitada && (
        <p role="alert" className="border-linea bg-superficie-hundida rounded-tarjeta border p-3 text-sm">
          La fusión está desactivada en esta instalación: puedes ver qué cambiaría, pero no confirmarla.
        </p>
      )}

      {bloqueos.length > 0 && (
        <div role="alert" className="border-relleno-peligro rounded-tarjeta flex flex-col gap-1 border p-3 text-sm">
          <p className="text-texto-peligro font-semibold">No se puede fusionar</p>
          <ul className="list-disc pl-5">
            {bloqueos.map((bloqueo) => <li key={bloqueo}>{bloqueo}</li>)}
          </ul>
        </div>
      )}

      {conteos.length > 0 && (
        <Bloque titulo="Qué se mueve">
          <TablaRecurso
            definicion={CONTEOS_DE_FUSION}
            inicial={SIN_INICIAL}
            datos={conteos}
            claveFila={(conteo) => conteo.tabla}
            prefijoUrl="fc_"
            sinControles
          />
        </Bloque>
      )}

      {hayArchivos && (
        <p className="text-texto-tenue text-sm">
          {textoDeArchivos(archivos.cantidad, drive.carpetas)}
        </p>
      )}

      {conflictos.length > 0 && (
        <Bloque
          titulo="Datos distintos"
          ayuda="Elige de cuál lado se queda cada uno. Si no tocas nada, se conserva el del destino."
        >
          <TablaDeConflictos conflictos={conflictos} elecciones={elecciones} onElegir={onElegir} />
        </Bloque>
      )}

      {duplicados.length > 0 && (
        <Bloque
          titulo="Ya está en el destino"
          ayuda="No se copia dos veces: se descarta del origen y queda respaldado, así que vuelve si deshaces la fusión."
        >
          <TablaRecurso
            definicion={DUPLICADOS_DE_FUSION}
            inicial={SIN_INICIAL}
            datos={duplicados}
            claveFila={(duplicado) => duplicado.etiqueta}
            prefijoUrl="fd_"
            sinControles
          />
        </Bloque>
      )}

      {sinNada && bloqueos.length === 0 && (
        <p className="text-texto-tenue text-sm">
          El origen no tiene nada colgando: solo se fusiona el registro.
        </p>
      )}
    </div>
  )
}

/**
 * La frase de archivos y carpetas de Drive que cambian de dueño.
 *
 * @param archivos cuantos archivos adjuntos se mueven
 * @param carpetas cuantas carpetas de Drive se mueven al destino
 */
function textoDeArchivos (archivos: number, carpetas: number): string {
  const partes: string[] = []

  if (archivos > 0) partes.push(archivos === 1 ? '1 archivo adjunto' : `${archivos} archivos adjuntos`)
  if (carpetas > 0) partes.push(carpetas === 1 ? '1 carpeta de Drive' : `${carpetas} carpetas de Drive`)

  return `${partes.join(' y ')} se ${archivos + carpetas === 1 ? 'mueve' : 'mueven'} al destino.`
}

/** Titulo, ayuda opcional y la tabla de un bloque de la vista previa. */
function Bloque ({ titulo, ayuda, children }: { titulo: string, ayuda?: string, children: ReactNode }): ReactElement {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h4 className="text-texto text-sm font-semibold">{titulo}</h4>
        {ayuda !== undefined && <p className="text-texto-tenue text-xs">{ayuda}</p>}
      </div>
      {children}
    </section>
  )
}

const LADOS: readonly OpcionSegmentada[] = [
  { valor: 'origen', etiqueta: 'Origen' },
  { valor: 'destino', etiqueta: 'Destino' }
]

/**
 * Los campos distintos, con el valor de cada lado y el control que elige cual se conserva.
 *
 * La definicion se arma aca y no en `definiciones/fusion.ts` porque depende de la eleccion vigente y
 * de un manejador, y una funcion no puede vivir en un `.ts` que tambien exporta CSV. Se memoiza
 * porque `TablaRecurso` la usa como dependencia de sus efectos.
 */
function TablaDeConflictos ({ conflictos, elecciones, onElegir }: {
  conflictos: ConflictoDeFusion[]
  elecciones: EleccionesDeFusion
  onElegir: (campo: string, lado: LadoDeFusion) => void
}): ReactElement {
  const definicion = useMemo<DefinicionRecurso<ConflictoDeFusion>>(() => ({
    ...CONFLICTOS_DE_FUSION,
    columnas: [
      ...CONFLICTOS_DE_FUSION.columnas,
      { clave: 'valor_origen', encabezado: 'En el origen', presentar: (c) => textoDeValor(c.valor_origen) },
      { clave: 'valor_destino', encabezado: 'En el destino', presentar: (c) => textoDeValor(c.valor_destino) },
      {
        clave: 'conservar',
        encabezado: 'Conservar',
        angosta: true,
        sinCortar: true,
        presentar: (c) => (
          <Segmentado
            etiqueta={`Valor que se conserva de ${c.etiqueta}`}
            opciones={LADOS}
            activo={elecciones[c.campo] ?? 'destino'}
            tamano="chico"
            onElegir={(lado) => { onElegir(c.campo, lado as LadoDeFusion) }}
          />
        )
      }
    ]
  }), [elecciones, onElegir])

  return (
    <TablaRecurso
      definicion={definicion}
      inicial={SIN_INICIAL}
      datos={conflictos}
      claveFila={(conflicto) => conflicto.campo}
      prefijoUrl="fk_"
      sinControles
    />
  )
}
