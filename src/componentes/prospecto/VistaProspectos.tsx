'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Boton } from '@/componentes/formularios/Boton'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { Prospecto } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { PROSPECTOS } from '@/definiciones/prospectos'
import type { ResultadoLista } from '@/definiciones/tipos'
import { camposDeAltaDeProspecto } from './campos'

/**
 * Listado de Prospectos.
 *
 * Solo tabla: un prospecto se compara por empresa, estado y cuantas licitaciones tiene, y esas tres
 * comparaciones se hacen en columnas.
 *
 * Vive del lado cliente de la frontera por la misma restriccion que `VistaLicitaciones`: una
 * `DefinicionRecurso` esta llena de funciones y **una funcion no cruza de un Server Component a uno
 * cliente**, asi que la definicion se importa de este lado y la pagina solo manda datos serializables.
 */
interface PropsVistaProspectos {
  /** Primera pagina ya resuelta en el servidor: sin esto la tabla parpadearia al montar. */
  inicial: ResultadoLista<Prospecto>
  /** Capacidades sobre `projects`: el prospecto es la antesala de un Espacio y usa ese permiso. */
  capacidades?: Capacidad[]
  /** Catalogo `countries` de `GET /lookups`, para el formulario de alta. */
  paises: OpcionCampo[]
}

export function VistaProspectos ({ inicial, capacidades = [], paises }: PropsVistaProspectos) {
  const router = useRouter()
  const [creando, setCreando] = useState(false)

  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo(() => ({
    ...PROSPECTOS,
    columnas: PROSPECTOS.columnas.map((columna) => (
      columna.clave === 'empresa'
        ? {
            ...columna,
            presentar: (prospecto: Prospecto) => (
              <Link
                href={`/prospectos/${prospecto.id}`}
                className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
              >
                {prospecto.empresa}
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
            Nuevo prospecto
          </Boton>
        </div>
      )}

      <TablaRecurso
        definicion={definicion}
        inicial={inicial}
        claveFila={(prospecto) => prospecto.id}
        capacidades={capacidades}
      />

      {capacidades.includes('create') && (
        <FormularioRecurso
          abierto={creando}
          onAbiertoCambia={setCreando}
          titulo="Nuevo prospecto"
          descripcion="La empresa a la que se le va a licitar. El cliente no se crea todavía: eso pasa al ganar la primera licitación."
          campos={camposDeAltaDeProspecto(paises)}
          ruta="prospectos"
          metodo="POST"
          onGuardado={() => { router.refresh() }}
          columnas={2}
          ancho="grande"
        />
      )}
    </div>
  )
}
