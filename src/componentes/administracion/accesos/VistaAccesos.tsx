'use client'

import { useCallback, useState } from 'react'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import { pedirSobre } from '@/datos/cliente'
import { MensajeDeError } from './piezas'
import { PanelAreasCargos } from './PanelAreasCargos'
import { PanelEscalones } from './PanelEscalones'
import { PanelInterruptores } from './PanelInterruptores'
import { PanelPersonas } from './PanelPersonas'
import { PanelRoles } from './PanelRoles'
import type { CatalogoDeAccesos } from '@/datos/accesos'

interface PropsVistaAccesos {
  /** El catálogo que trajo el servidor en la primera pintada. */
  inicial: CatalogoDeAccesos
  /** `id` de quien administra: la API impide cambiarse el escalón a uno mismo. */
  actorId: number
}

/**
 * El panel de accesos: un solo dueño del catálogo y cinco pestañas que lo leen.
 *
 * El catálogo vive acá y no en cada panel por una razón concreta: las cinco pestañas miran los mismos
 * datos desde ángulos distintos —borrar un escalón cambia el contador de los roles, mover a alguien
 * de área cambia el de las áreas—, y con una copia por pestaña la segunda mostraría números viejos
 * sin que nada avisara.
 *
 * Se recarga con `pedirSobre()` y no con `router.refresh()` a propósito: el refresco del router
 * vuelve a resolver la ruta entera en el servidor y pierde la pestaña abierta y el estado de los
 * diálogos. Acá se repide una sola respuesta —`GET /accesos/catalogo`, que es exactamente lo que la
 * pantalla necesita— y el resto no se mueve.
 */
export function VistaAccesos ({ inicial, actorId }: PropsVistaAccesos) {
  const [catalogo, setCatalogo] = useState(inicial)
  const [error, setError] = useState<string | null>(null)

  /**
   * Vuelve a pedir el catálogo después de escribir.
   *
   * Un fallo no borra lo que ya está en pantalla: la escritura sí ocurrió, y vaciar la tabla haría
   * pensar lo contrario. Se avisa arriba y los datos que se ven quedan como estaban hasta el próximo
   * intento.
   */
  const recargar = useCallback((): void => {
    setError(null)

    pedirSobre<CatalogoDeAccesos>('accesos/catalogo', new AbortController().signal)
      .then((sobre) => { setCatalogo(sobre.data) })
      .catch((fallo: unknown) => {
        setError(
          fallo instanceof Error
            ? `El cambio se guardó, pero la pantalla no se pudo actualizar: ${fallo.message}`
            : 'El cambio se guardó, pero la pantalla no se pudo actualizar. Recárgala.'
        )
      })
  }, [])

  const paneles: Panel[] = [
    {
      clave: 'escalones',
      etiqueta: 'Escalones',
      contenido: <PanelEscalones catalogo={catalogo} recargar={recargar} />
    },
    {
      clave: 'roles',
      etiqueta: 'Roles',
      contenido: <PanelRoles catalogo={catalogo} recargar={recargar} />
    },
    {
      clave: 'personas',
      etiqueta: 'Personas',
      contenido: <PanelPersonas catalogo={catalogo} recargar={recargar} actorId={actorId} />
    },
    {
      clave: 'areas',
      etiqueta: 'Áreas y cargos',
      contenido: <PanelAreasCargos catalogo={catalogo} recargar={recargar} />
    },
    {
      clave: 'interruptores',
      etiqueta: 'Interruptores',
      contenido: <PanelInterruptores catalogo={catalogo} recargar={recargar} />
    }
  ]

  return (
    <div className="flex flex-col gap-4">
      {error !== null && <MensajeDeError>{error}</MensajeDeError>}
      <Pestanas paneles={paneles} etiqueta="Secciones de accesos" />
    </div>
  )
}
