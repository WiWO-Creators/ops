'use client'

import { AvisosDeError } from '@/componentes/estado/AvisosDeError'
import { PantallaCaida } from '@/componentes/estado/PantallaCaida'
import './globals.css'

/**
 * El ultimo limite: lo que se ve cuando se cae el propio armazon.
 *
 * Los otros tres limites (`(panel)`, `portal`, `tarea/[token]`) viven dentro de su layout, asi que
 * no pueden atrapar un error del layout mismo ni del layout raiz. Eso caia en la pagina de error
 * interna de Next —fondo blanco, tipografia del navegador, ningun rastro— y es justamente el caso
 * mas grave: si el armazon no se dibuja, la persona no puede ni cambiar de pantalla.
 *
 * Trae su propio `<html>` y su propio `<body>` porque reemplaza al layout raiz, no se anida en el.
 * Por lo mismo importa `globals.css` y monta `AvisosDeError` de nuevo: el layout raiz no corrio, asi
 * que ni los tokens del sistema de diseño ni la pila de avisos existen todavia, y sin la pila no
 * habria donde mostrar el codigo del incidente.
 *
 * El tema queda en el claro: el script que lee la preferencia vive en el `<head>` del layout raiz,
 * que es el que no se ejecuto. Repetirlo aca para una pantalla que casi nunca aparece costaria mas
 * de lo que arregla.
 */
export default function ErrorGlobal ({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  return (
    <html lang="es">
      <body>
        <main className="bg-superficie mx-auto flex min-h-dvh max-w-2xl items-center p-6">
          <PantallaCaida
            error={error}
            reset={reset}
            detalle="Ops no pudo arrancar esta vista. Prueba de nuevo; si sigue igual, repórtalo con el código del aviso."
            className="w-full"
          />
        </main>
        <AvisosDeError />
      </body>
    </html>
  )
}
