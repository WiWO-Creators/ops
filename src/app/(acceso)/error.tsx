'use client'

import { PantallaCaida } from '@/componentes/estado/PantallaCaida'
import { codigoDeFallo, detalleConCodigoDeFallo } from '@/lib/fallo-de-pantalla'

/**
 * Red de contencion de las pantallas de acceso.
 *
 * Era el unico armazon sin limite propio: el panel, el portal y la ficha publica ya tenian el suyo,
 * y un fallo al dibujar `/` o `/colab` subia hasta `global-error`, que reemplaza al layout raiz. Con
 * los scripts del `<head>` sin correr, eso se veia como una pantalla negra y muda —el tema queda en
 * el claro pero el fondo del `body` no llega— justo en la puerta, donde la persona no tiene ninguna
 * otra pantalla a la que irse.
 *
 * Vive en `(acceso)` y no en `(acceso)/colab` porque las dos puertas —la del cliente en la raiz y la
 * del equipo en `/colab`— se caen por lo mismo: leen la cookie y la clave de sesion antes de
 * dibujar. Un limite solo en `colab` dejaria a la del cliente igual de muda.
 *
 * El codigo se pinta en la frase porque aca el aviso flotante casi nunca puede mostrar uno: registrar
 * un incidente exige sesion (`datos/incidentes.ts`) y quien esta en la pantalla de acceso no la
 * tiene. `PantallaCaida` igual reporta —si la sesion existe y lo que fallo fue el render, el
 * incidente queda— y no repite el reporte al reintentar.
 *
 * El boton reintenta con `retry` y no con `reset`, al reves que los otros limites: lo que se cae aca
 * es el render del servidor —leer la cookie, preguntar por el acceso con Google—, y `reset()` vuelve
 * a dibujar con la misma carga que ya venia fallando. `retry()` refresca antes de reintentar, que es
 * lo unico que puede cambiar el resultado.
 */
export default function ErrorDeAcceso (
  { error, retry }: { error: Error & { digest?: string }, retry: () => void }
) {
  return (
    <main className="fondo-marca flex h-dvh items-center overflow-y-auto p-6">
      <PantallaCaida
        error={error}
        reset={retry}
        detalle={detalleConCodigoDeFallo(
          'No pudimos mostrar la pantalla de acceso. Prueba de nuevo en un momento.',
          codigoDeFallo(error)
        )}
        className="mx-auto w-full max-w-lg"
      />
    </main>
  )
}
