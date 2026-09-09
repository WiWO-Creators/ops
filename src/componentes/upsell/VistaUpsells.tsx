'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Boton } from '@/componentes/formularios/Boton'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { GLOSARIO } from '@/dominio/glosario'
import type { Upsell } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { UPSELLS } from '@/definiciones/upsells'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import { camposDeUpsell } from './campos'

/**
 * Listado de oportunidades de Upselling.
 *
 * Solo tabla, igual que Licitaciones: una oportunidad se compara por cliente, estado, monto y
 * probabilidad, y esas cuatro comparaciones se hacen en columnas.
 *
 * Vive del lado cliente de la frontera porque una `DefinicionRecurso` esta llena de funciones y
 * **una funcion no cruza de un Server Component a uno cliente**.
 */
interface PropsVistaUpsells {
  /** Primera pagina ya resuelta en el servidor: sin esto la tabla parpadearia al montar. */
  inicial: ResultadoLista<Upsell>
  /** Capacidades sobre `projects`: un Upsell **es** un Espacio, y el backend usa ese permiso. */
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  /**
   * Los clientes ACTIVOS entre los que elegir en el alta.
   *
   * Sale de `GET /clients/minimos?filter[active]=1`, la ruta que existe justamente para esto: que
   * cualquiera del equipo pueda ver que un cliente existe sin ver su legajo.
   */
  clientes: OpcionCampo[]
  /** Catalogo `currencies` de `GET /lookups`. */
  monedas: OpcionCampo[]
}

export function VistaUpsells ({
  inicial,
  capacidades = [],
  opcionesDeFiltro,
  clientes,
  monedas
}: PropsVistaUpsells) {
  const router = useRouter()
  const [creando, setCreando] = useState(false)

  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo(() => ({
    ...UPSELLS,
    columnas: UPSELLS.columnas.map((columna) => (
      columna.clave === 'espacio'
        ? {
            ...columna,
            presentar: (upsell: Upsell) => (
              <Link
                href={`/upsells/${upsell.id}`}
                className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
              >
                {upsell.espacio.name}
              </Link>
            )
          }
        : columna
    ))
  }), [])

  return (
    <div className="flex flex-col gap-3">
      {capacidades.includes('create') && (
        <div className="flex justify-end">
          <Boton tamano="chico" variante="primario" onClick={() => { setCreando(true) }}>
            Nueva oportunidad
          </Boton>
        </div>
      )}

      <TablaRecurso
        definicion={definicion}
        inicial={inicial}
        claveFila={(upsell) => upsell.id}
        capacidades={capacidades}
        opcionesDeFiltro={opcionesDeFiltro}
      />

      {capacidades.includes('create') && (
        <FormularioRecurso
          abierto={creando}
          onAbiertoCambia={setCreando}
          titulo="Nueva oportunidad"
          descripcion={`Se crea el ${GLOSARIO.espacio.singular.toLowerCase()} donde se prepara la propuesta. No aparece entre los proyectos del cliente —ni en su portal— hasta que la oportunidad se gane.`}
          campos={camposDeUpsell(clientes, monedas)}
          ruta="upsells"
          metodo="POST"
          onGuardado={() => { router.refresh() }}
          columnas={2}
          ancho="grande"
        />
      )}
    </div>
  )
}
