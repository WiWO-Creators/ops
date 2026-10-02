'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { ControlesDeCartera } from './ControlesDeCartera'
import { FilaCuenta } from './FilaCuenta'
import type { EstadosRedactados } from './FilaEspacio'
import { useRecorteDeCartera } from './useRecorteDeCartera'
import { Cargando, Vacio } from '@/componentes/estado/Estados'
import type { CuentaFocal, EstadoDeSalud } from '@/datos/focals'
import {
  filtrarCartera,
  ordenarCartera,
  prepararCartera,
  resumirCartera
} from '@/dominio/cartera'

/**
 * La cartera de un Focal: sus clientes, y dentro de cada uno sus Proyectos.
 *
 * === Por qué dos niveles y no una tabla plana ===
 *
 * Porque las dos preguntas del Focal son distintas y se hacen en ese orden: primero "¿cuál de mis
 * cuentas está mal?" y recién después "¿qué parte de esa cuenta la tiene mal?". Una tabla de todos
 * los Proyectos ordenados por score contesta la segunda y hace imposible la primera:
 * una cuenta con cuatro proyectos regulares se lee peor que otra con uno pésimo, y no lo está.
 *
 * === Por qué la fila empieza por el número ===
 *
 * Porque con veinte cuentas la pregunta no se contesta leyendo veinte nombres: se contesta mirando
 * una columna de números alineados y frenando en el más bajo. El puntaje va primero, en su propia
 * columna y en cifras tabulares, para que esa columna exista. El nombre viene después: sirve para
 * confirmar en cuál se paró el ojo, no para encontrarla.
 *
 * La barra de reparto que sigue al nombre es el mismo dato que el recuento escrito al lado, dibujado:
 * una cuenta con cinco de cinco Proyectos en rojo se ve entera roja antes de leer
 * ninguna palabra, y una con uno malo entre seis buenos deja de parecer lo mismo.
 *
 * === Por qué el párrafo de Thinking Orb es un botón y no aparece solo ===
 *
 * Porque cuesta plata. Redactarlo al abrir la pantalla serían decenas de llamadas al modelo de las
 * que casi ninguna se lee. El semáforo, el desglose y los contadores están completos sin él: el
 * párrafo es lo que se pide cuando el número no alcanza para entender.
 *
 * Con Thinking Orb apagado el botón sigue ahí y contesta en una línea qué pasa, en vez de desaparecer sin
 * explicación. Lo que no cambia nunca es el semáforo, que no depende del modelo.
 *
 * @param cuentas los clientes de esta persona, ya ordenados por el servidor del peor al mejor
 * @param mostrarFocal si cada cuenta lleva el nombre de quien responde por ella. Se enciende para
 *   quien mira la cartera entera: sobre la cartera propia sería el mismo nombre en todas las filas
 *
 * El texto, el filtro y el orden viven en la URL: un enlace a la cartera filtrada se comparte igual que
 * cualquier otra vista con filtros, y recargar no la pierde. El estado de IA redactado vive acá y no en
 * cada fila, para que cerrar una cuenta o filtrar no lo pierda.
 */
export function PanelFocals (props: { cuentas: CuentaFocal[], mostrarFocal?: boolean }) {
  // `useFiltrosEnUrl` lee `useSearchParams`: sin este limite de Suspense falla el build.
  return (
    <Suspense fallback={<Cargando alto="min-h-60" mensaje="Cargando la cartera…" />}>
      <CuerpoDePanelFocals {...props} />
    </Suspense>
  )
}

function CuerpoDePanelFocals ({
  cuentas,
  mostrarFocal = false
}: {
  cuentas: CuentaFocal[]
  mostrarFocal?: boolean
}) {
  const recorte = useRecorteDeCartera(mostrarFocal)
  const [estados, setEstados] = useState<EstadosRedactados>({})

  const guardarEstado = useCallback((proyecto: number, estado: EstadoDeSalud): void => {
    setEstados((previos) => ({ ...previos, [proyecto]: estado }))
  }, [])

  const resumen = useMemo(() => resumirCartera(cuentas), [cuentas])
  const preparadas = useMemo(() => prepararCartera(cuentas), [cuentas])
  const visibles = useMemo(
    () => ordenarCartera(filtrarCartera(preparadas, recorte.textoDiferido, recorte.filtro), recorte.orden),
    [preparadas, recorte.textoDiferido, recorte.filtro, recorte.orden]
  )

  return (
    // El ancho se corta a propósito: en una pantalla de 1440 una fila estirada de borde a borde deja
    // medio metro de vacío entre el nombre de la cuenta y quien responde por ella, y leer los dos
    // extremos de la misma fila obliga a barrer la pantalla entera con los ojos.
    <div className="flex max-w-5xl flex-col gap-4">
      <ControlesDeCartera
        resumen={resumen}
        visibles={visibles.length}
        mostrarFocal={mostrarFocal}
        recorte={recorte}
      />

      {visibles.length === 0
        ? (
          <Vacio
            titulo="Ninguna cuenta coincide con el recorte"
            descripcion="Prueba con parte del nombre, o quita el filtro que está puesto."
          />
          )
        : (
          <ul className="flex flex-col gap-2">
            {visibles.map(({ cuenta }) => (
              <li key={cuenta.cliente.client_id}>
                <FilaCuenta
                  cuenta={cuenta}
                  mostrarFocal={mostrarFocal}
                  estados={estados}
                  onEstado={guardarEstado}
                />
              </li>
            ))}
          </ul>
          )}
    </div>
  )
}
