'use client'

import { memo } from 'react'
import { QuienResponde } from './DetalleDeCuenta'
import { BarraDeReparto, RecuentoDeTramos } from './ResumenDeTramos'
import { CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla } from '@/componentes/datos/Tabla'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { NumeroDeScore, TRAMOS, Variacion } from '@/componentes/clientes/SemaforoCliente'
import { nombreDe, type CuentaFocal } from '@/datos/focals'
import { nombreDeCuenta } from '@/dominio/cartera'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { FOCO_INTERIOR } from './clases-de-foco'

interface PropsTablaDeCuentas {
  cuentas: CuentaFocal[]
  mostrarFocal: boolean
  /** La cuenta abierta en el panel, para marcar su fila. */
  abierta: number | null
  onAbrir: (clienteId: number) => void
  /** Los Proyectos que hicieron aparecer a cada cuenta en la búsqueda, por cliente. */
  coincidencias: ReadonlyMap<number, readonly number[]>
}

/**
 * La cartera como tabla: una línea por cuenta, para compararlas de un vistazo.
 *
 * El detalle no se abre debajo de la fila sino en un panel lateral: una lista de cuentas que crece
 * hacia abajo al abrir cada una obliga a recorrer pantallas enteras para encontrar la siguiente. La
 * fila entera abre el panel con el mouse; el botón del nombre es la vía del teclado y del lector de
 * pantalla.
 *
 * @param cuentas las cuentas ya filtradas y ordenadas
 * @param mostrarFocal si hay columna de quien responde: solo en la cartera entera
 * @param abierta el cliente cuyo detalle está abierto, si hay alguno
 * @param onAbrir pide abrir el detalle de un cliente
 * @param coincidencias los Proyectos que coincidieron con la búsqueda, por cliente
 */
export function TablaDeCuentas ({ cuentas, mostrarFocal, abierta, onAbrir, coincidencias }: PropsTablaDeCuentas) {
  return (
    <Tabla principales={2} aria-label="Cuentas, de la que peor está a la que mejor">
      <EncabezadoTabla>
        <tr>
          <CeldaEncabezado angosta>Puntaje</CeldaEncabezado>
          <CeldaEncabezado>Cuenta</CeldaEncabezado>
          <CeldaEncabezado angosta>Estado</CeldaEncabezado>
          <CeldaEncabezado>{GLOSARIO.espacio.plural}</CeldaEncabezado>
          {mostrarFocal && <CeldaEncabezado>{GLOSARIO.focal.singular}</CeldaEncabezado>}
        </tr>
      </EncabezadoTabla>

      <CuerpoTabla>
        {cuentas.map((cuenta) => (
          <FilaDeCuenta
            key={cuenta.cliente.client_id}
            cuenta={cuenta}
            mostrarFocal={mostrarFocal}
            seleccionada={abierta === cuenta.cliente.client_id}
            onAbrir={onAbrir}
            coincidencias={coincidencias.get(cuenta.cliente.client_id) ?? null}
          />
        ))}
      </CuerpoTabla>
    </Tabla>
  )
}

/**
 * Una cuenta. Va en `memo`: escribir en el buscador repinta la tabla entera y, con una cartera global
 * de cientos de cuentas, la mayoría de las filas no cambia.
 */
const FilaDeCuenta = memo(function FilaDeCuenta (
  { cuenta, mostrarFocal, seleccionada, onAbrir, coincidencias }: {
    cuenta: CuentaFocal
    mostrarFocal: boolean
    seleccionada: boolean
    onAbrir: (clienteId: number) => void
    coincidencias: readonly number[] | null
  }
) {
  const { cliente, espacios } = cuenta
  const tramo = TRAMOS[cliente.semaforo] ?? TRAMOS.sin_datos
  const nombre = nombreDeCuenta(cuenta)
  const proyectosQueCoinciden = espacios.filter((espacio) => coincidencias?.includes(espacio.project_id) === true)

  return (
    <FilaTabla
      interactiva
      className={cn(seleccionada && 'bg-seleccionado')}
      onClick={() => { onAbrir(cliente.client_id) }}
    >
      <CeldaTabla angosta>
        <span className="flex items-baseline justify-end gap-2">
          <Variacion puntos={cliente.variacion} ocultarSinCambio />
          <NumeroDeScore score={cliente.score} semaforo={cliente.semaforo} className="text-xl" />
        </span>
      </CeldaTabla>

      <CeldaTabla>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={(evento) => { evento.stopPropagation(); onAbrir(cliente.client_id) }}
          className={cn('rounded-control text-texto -mx-1 px-1 text-start font-medium', FOCO_INTERIOR)}
        >
          {nombre}
        </button>
        {proyectosQueCoinciden.length > 0 && (
          <span className="text-acento block text-xs">
            Coincide: {proyectosQueCoinciden.map(nombreDe).join(', ')}
          </span>
        )}
      </CeldaTabla>

      <CeldaTabla angosta>
        <Insignia tono={tramo.tono} tamano="chico">{tramo.etiqueta}</Insignia>
      </CeldaTabla>

      <CeldaTabla>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <BarraDeReparto espacios={espacios} />
          <RecuentoDeTramos espacios={espacios} />
        </span>
      </CeldaTabla>

      {mostrarFocal && (
        <CeldaTabla>
          <QuienResponde cliente={cliente} />
        </CeldaTabla>
      )}
    </FilaTabla>
  )
})
