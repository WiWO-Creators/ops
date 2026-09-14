'use client'

import { Boton } from '@/componentes/formularios/Boton'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'

/**
 * Piezas compartidas por los cinco paneles de accesos.
 *
 * Viven acá y no en `componentes/superposiciones` porque hoy las usa una sola pantalla: subirlas al
 * sistema antes de tener un segundo consumidor es fijar una forma sin saber cuál hace falta.
 */

/**
 * Valor que usan los selectores para decir "ninguno" o "todos".
 *
 * No es la cadena vacía porque Radix Select lanza con `value=""`: reserva ese valor para "nada
 * elegido". Nunca viaja a la API — cada panel lo traduce a `null` o a un filtro ausente.
 */
export const SIN_VALOR = 'ninguno'

interface PropsConfirmacion {
  abierto: boolean
  titulo: string
  /** Qué se lleva por delante, dicho antes y no después. */
  descripcion: string
  /** Texto del botón que ejecuta. Un verbo, no "Aceptar". */
  etiquetaConfirmar: string
  /** Pinta el botón en rojo: lo que se confirma borra o cambia el acceso de todo el mundo. */
  peligroso?: boolean
  enCurso: boolean
  error: string | null
  onConfirmar: () => void
  onCerrar: () => void
}

/**
 * Confirmación de una acción que no se puede deshacer sola.
 *
 * Sin confirmación escrita a propósito: la de `BajaYBorrado` existe porque ahí se borra un cliente
 * con toda su facturación. Acá lo que se borra es un escalón o un cargo que la API ya bloquea con
 * 409 si alguien lo usa, y obligar a copiar un nombre en cada una de las cuatro tablas convertiría
 * la pantalla en un trámite.
 */
export function DialogoConfirmar ({
  abierto, titulo, descripcion, etiquetaConfirmar, peligroso = false, enCurso, error, onConfirmar,
  onCerrar
}: PropsConfirmacion) {
  return (
    <Dialogo open={abierto} onOpenChange={(siguiente) => { if (!siguiente) onCerrar() }}>
      <ContenidoDialogo titulo={titulo} descripcion={descripcion} ancho="chico">
        <div className="flex flex-col gap-4">
          {error !== null && <MensajeDeError>{error}</MensajeDeError>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton
              variante={peligroso ? 'peligro' : 'primario'}
              cargando={enCurso}
              onClick={onConfirmar}
            >
              {etiquetaConfirmar}
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/** El error de una escritura, donde se pidió. `role="alert"` para que un lector lo lea al aparecer. */
export function MensajeDeError ({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="text-texto-peligro text-sm">{children}</p>
}

/** Cabecera de un panel: qué administra y el botón que agrega uno nuevo. */
export function CabeceraDePanel ({
  titulo, descripcion, accion
}: {
  titulo: string
  descripcion: string
  accion?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-prose">
        <h2 className="text-texto font-titular text-base font-extrabold">{titulo}</h2>
        <p className="text-texto-tenue text-sm">{descripcion}</p>
      </div>
      {accion}
    </div>
  )
}
