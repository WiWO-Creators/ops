'use client'

import { useEffect, useRef } from 'react'
import { ErrorEstado } from '@/componentes/estado/Estados'
import { avisarError } from '@/lib/aviso-de-error'

interface PropsPantallaCaida {
  /** El error tal como lo entrega el limite de error de Next. */
  error: Error & { digest?: string }
  /** Volver a intentar el render, tambien de Next. */
  reset: () => void
  /** Lo que se le dice a la persona. Cada armazon tiene su frase: el portal no habla como el panel. */
  detalle: string
  className?: string
}

/**
 * El cartel de una pantalla que no se pudo dibujar, con el error ya registrado.
 *
 * Existe porque los cuatro limites de error del proyecto hacian lo mismo —mostrar `ErrorEstado` con
 * un reintento— y ninguno dejaba rastro. Una pantalla que se cae es el peor caso para no tener
 * rastro: no hay respuesta de la API que mirar, porque el fallo ocurrio despues, al construir la
 * vista, y en produccion Next reemplaza el mensaje por un `digest` que solo sirve si alguien lo
 * anoto en alguna parte. Aca se anota: el incidente guarda el digest, la ruta y quien lo sufrio, y
 * el codigo aparece en el aviso flotante para que la persona lo pueda reportar.
 *
 * El detalle tecnico **no** se muestra: el `message` de un error de servidor puede nombrar rutas,
 * tablas o fragmentos de consulta, y la ficha publica de una Tarea la abre cualquiera. Ese texto
 * viaja al incidente, que lo lee un superadministrador.
 */
export function PantallaCaida ({ error, reset, detalle, className }: PropsPantallaCaida) {
  // Un mismo error no se reporta dos veces. En desarrollo el modo estricto de React monta cada
  // componente dos veces a proposito, y sin esto cada pantalla caida dejaria dos filas iguales en
  // Incidentes con dos codigos distintos.
  const reportado = useRef(false)

  useEffect(() => {
    if (reportado.current) return

    reportado.current = true

    avisarError({
      mensaje: 'Esta pantalla no se pudo cargar. Ya quedó registrado.',
      reporte: {
        tipo: error.name === '' ? 'PantallaCaida' : error.name,
        // El digest va primero porque en produccion es lo unico que permite cruzar el incidente con
        // la linea que el servidor de Next escribio en su propio log.
        mensaje: error.digest === undefined
          ? error.message
          : `digest ${error.digest} · ${error.message}`,
        metodo: 'VISTA',
        traza: error.stack
      }
    })
  }, [error])

  return <ErrorEstado detalle={detalle} onReintentar={reset} className={className} />
}
