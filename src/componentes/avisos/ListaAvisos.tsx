'use client'

import { useEffect, useState } from 'react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Cargando, Vacio } from '@/componentes/estado/Estados'
import { pedirSobre } from '@/datos/cliente'
import { AVISOS_POR_PAGINA, type Aviso } from '@/datos/avisos'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'

/**
 * Los ultimos avisos de quien mira.
 *
 * Se monta con el desplegable de la campana, y ese montaje **es** la peticion: la lista no viaja en
 * el intervalo del contador. Al cerrarse se desmonta, asi que volver a abrir vuelve a pedir, que es
 * exactamente lo que se quiere — es la unica forma de ver algo escrito hace diez segundos.
 *
 * Una sola pagina y sin scroll infinito: es un desplegable de cabecera, no una bandeja. Quien
 * necesite el historial completo lo tiene en el panel clasico, que es donde `link` apunta.
 *
 * `link` no se convierte en enlace a proposito: es una ruta del panel viejo (`#taskid=512`), y
 * ofrecerla como enlace sacaria a la persona de Ops hacia una pantalla que quizas ya no existe.
 */
export function ListaAvisos () {
  const [avisos, setAvisos] = useState<Aviso[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<Aviso[]>(`notifications?per_page=${AVISOS_POR_PAGINA}`, control.signal)
      .then((sobre) => { setAvisos(sobre.data) })
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return

        setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los avisos.')
      })

    return () => { control.abort() }
  }, [])

  return (
    <div className="flex flex-col">
      <p className="border-linea text-texto border-b px-3 py-2 text-sm font-semibold">Avisos</p>

      {error !== null && (
        <p role="alert" className="text-texto-peligro text-pretty px-3 py-4 text-sm">{error}</p>
      )}

      {error === null && avisos === null && (
        <Cargando alto="min-h-24" mensaje="Cargando los avisos…" />
      )}

      {error === null && avisos !== null && avisos.length === 0 && (
        <Vacio
          titulo="Sin avisos"
          descripcion="Aquí aparece lo que el sistema tenga que contarte."
          className="px-3 py-6"
        />
      )}

      {error === null && avisos !== null && avisos.length > 0 && (
        <ul className="divide-linea-suave max-h-96 divide-y overflow-y-auto">
          {avisos.map((aviso) => (
            <li key={aviso.id} className="flex items-start gap-2 px-3 py-2">
              <Avatar
                nombre={aviso.from?.name ?? 'Sistema'}
                tamano="chico"
                className="mt-0.5"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className={cn('text-pretty text-sm', aviso.read ? 'text-texto-tenue' : 'text-texto font-medium')}>
                  {aviso.text}
                </span>
                <span className="text-texto-sutil text-xs">{formatearFecha(aviso.date, true)}</span>
              </div>
              {!aviso.read && (
                <span aria-hidden="true" className="bg-acento mt-2 size-1.5 shrink-0 rounded-full" />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
