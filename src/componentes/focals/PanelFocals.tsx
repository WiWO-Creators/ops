'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { ControlesDeCartera } from './ControlesDeCartera'
import { DetalleDeCuenta } from './DetalleDeCuenta'
import { TablaDeCuentas } from './TablaDeCuentas'
import type { EstadosRedactados } from './FilaEspacio'
import { useRecorteDeCartera } from './useRecorteDeCartera'
import { Cargando, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Cajon, ContenidoCajon } from '@/componentes/superposiciones/Cajon'
import type { CuentaFocal, EstadoDeSalud } from '@/datos/focals'
import {
  filtrarCartera,
  fotoDeLaCartera,
  nombreDeCuenta,
  ordenarCartera,
  prepararCartera,
  proyectosCoincidentes,
  resumirCartera
} from '@/dominio/cartera'

/** Lo que reciben las cuentas sin ningún Proyecto marcado: una sola referencia, para no romper su `memo`. */
const SIN_COINCIDENCIAS: readonly number[] = []

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
 * @param hoy el día de hoy en la zona del negocio, `YYYY-MM-DD`: con él se dice si la foto es de otro día
 * @param mostrarFocal si cada cuenta lleva el nombre de quien responde por ella. Se enciende para
 *   quien mira la cartera entera: sobre la cartera propia sería el mismo nombre en todas las filas
 *
 * El texto, el filtro y el orden viven en la URL: un enlace a la cartera filtrada se comparte igual que
 * cualquier otra vista con filtros, y recargar no la pierde. El estado de IA redactado vive acá y no en
 * cada fila, para que cerrar una cuenta o filtrar no lo pierda.
 */
export function PanelFocals (props: { cuentas: CuentaFocal[], hoy: string, mostrarFocal?: boolean }) {
  // `useFiltrosEnUrl` lee `useSearchParams`: sin este limite de Suspense falla el build.
  return (
    <Suspense fallback={<Cargando alto="min-h-60" mensaje="Cargando la cartera…" />}>
      <CuerpoDePanelFocals {...props} />
    </Suspense>
  )
}

function CuerpoDePanelFocals ({
  cuentas,
  hoy,
  mostrarFocal = false
}: {
  cuentas: CuentaFocal[]
  hoy: string
  mostrarFocal?: boolean
}) {
  const recorte = useRecorteDeCartera(mostrarFocal)
  const [estados, setEstados] = useState<EstadosRedactados>({})
  const [abierta, setAbierta] = useState<number | null>(null)

  const guardarEstado = useCallback((proyecto: number, estado: EstadoDeSalud): void => {
    setEstados((previos) => ({ ...previos, [proyecto]: estado }))
  }, [])

  const resumen = useMemo(() => resumirCartera(cuentas), [cuentas])
  const foto = useMemo(() => fotoDeLaCartera(cuentas, hoy), [cuentas, hoy])
  const preparadas = useMemo(() => prepararCartera(cuentas), [cuentas])
  const visibles = useMemo(
    () => ordenarCartera(filtrarCartera(preparadas, recorte.textoDiferido, recorte.filtro), recorte.orden),
    [preparadas, recorte.textoDiferido, recorte.filtro, recorte.orden]
  )
  const filas = useMemo(() => visibles.map(({ cuenta }) => cuenta), [visibles])
  // Se busca entre todas y no entre las visibles: filtrar con el panel abierto no debe cerrarlo.
  const cuentaAbierta = useMemo(
    () => cuentas.find((cuenta) => cuenta.cliente.client_id === abierta) ?? null,
    [cuentas, abierta]
  )
  const coincidencias = useMemo(() => {
    const porCuenta = new Map<number, readonly number[]>()

    for (const preparada of visibles) {
      const proyectos = proyectosCoincidentes(preparada, recorte.textoDiferido)

      if (proyectos.length > 0) porCuenta.set(preparada.cuenta.cliente.client_id, proyectos)
    }

    return porCuenta
  }, [visibles, recorte.textoDiferido])

  return (
    // El ancho se corta a propósito: en una pantalla de 1440 una fila estirada de borde a borde deja
    // medio metro de vacío entre el nombre de la cuenta y quien responde por ella, y leer los dos
    // extremos de la misma fila obliga a barrer la pantalla entera con los ojos.
    <div className="flex max-w-6xl flex-col gap-4">
      <ControlesDeCartera
        resumen={resumen}
        visibles={visibles.length}
        mostrarFocal={mostrarFocal}
        foto={foto}
        recorte={recorte}
      />

      {visibles.length === 0
        ? (
          <Vacio
            titulo="Ninguna cuenta coincide con el recorte"
            descripcion="Prueba con parte del nombre, o quita el filtro que está puesto."
            accion={
              <Boton variante="secundario" className="pointer-coarse:h-11" onClick={recorte.onLimpiar}>
                Quitar el recorte
              </Boton>
            }
          />
          )
        : (
          <TablaDeCuentas
            cuentas={filas}
            mostrarFocal={mostrarFocal}
            abierta={abierta}
            onAbrir={setAbierta}
            coincidencias={coincidencias}
          />
          )}

      <Cajon open={cuentaAbierta !== null} onOpenChange={(abierto) => { if (!abierto) setAbierta(null) }}>
        {cuentaAbierta !== null && (
          <ContenidoCajon titulo={nombreDeCuenta(cuentaAbierta)} aria-describedby={undefined}>
            <DetalleDeCuenta
              cuenta={cuentaAbierta}
              mostrarFocal={mostrarFocal}
              estados={estados}
              onEstado={guardarEstado}
              coincidencias={coincidencias.get(cuentaAbierta.cliente.client_id) ?? SIN_COINCIDENCIAS}
            />
          </ContenidoCajon>
        )}
      </Cajon>
    </div>
  )
}
