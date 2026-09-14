'use client'

import { PantallaCaida } from '@/componentes/estado/PantallaCaida'

/**
 * Red de contencion del panel.
 *
 * Es el limite que faltaba: el portal y la ficha publica ya tenian el suyo, pero las veintitantas
 * pantallas del panel —que son las que usa el equipo todo el dia— caian en la pagina de error
 * generica de Next, fuera del sistema de diseño, sin barra lateral y sin dejar rastro.
 *
 * Vive en `(panel)` y no en la raiz para quedar **dentro** del armazon: asi la persona conserva la
 * navegacion y puede irse a otra pantalla, en vez de quedarse con una pagina que solo ofrece
 * reintentar lo que acaba de fallar.
 */
export default function ErrorDelPanel ({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <PantallaCaida
      error={error}
      reset={reset}
      detalle="No pudimos cargar esta pantalla. Prueba de nuevo en un momento."
      className="mt-10"
    />
  )
}
