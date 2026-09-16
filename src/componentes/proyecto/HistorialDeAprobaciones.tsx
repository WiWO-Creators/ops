'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { pedirRespuesta } from '@/datos/cliente'
import type { RondaDeAprobacion } from '@/datos/recursos'

/**
 * Todas las rondas de aprobacion de un Proceso, con lo que dijo el cliente en cada una.
 *
 * === Por que existe esta pantalla ===
 *
 * El comentario del cliente se venia guardando desde la migracion 0100 y no se mostraba en ninguna
 * parte. Peor: hasta la 0690 la tabla tenia `UNIQUE (taskid)`, asi que volver a pedir la aprobacion
 * **reescribia la fila** y lo que el cliente habia dicho la vez anterior dejaba de existir. Un
 * Proceso que se rechazo tres veces se veia igual que uno aprobado a la primera.
 *
 * Ahora cada ronda es una fila y esto las lista. Es el dato que contesta "¿por que esto lleva tres
 * semanas?" sin ir a buscar el correo.
 *
 * === Por que se pide aparte y no viene en la tarea ===
 *
 * Son N filas por Proceso y el listado muestra decenas: el backend manda `rondas` (el numero) en el
 * bloque `approval` y deja el detalle en `GET /tasks/{id}/approvals`. Esta pantalla lo pide **solo
 * cuando alguien lo despliega**, que es cuando de verdad interesa.
 */

interface Props {
  /** Id del Proceso cuyo historial se lista. */
  tareaId: number
  /**
   * Cuantas rondas declaro el backend en el bloque `approval`.
   *
   * Con `undefined` (base sin la migracion 0690) o con 1 o menos, el desplegable no se ofrece: una
   * sola ronda ya esta enteramente a la vista en el bloque de arriba, y un boton que abre para
   * mostrar lo mismo es ruido.
   */
  rondas: number | undefined
}

/** Como se lee cada estado. Misma escala de color que el bloque de SLA, para que no digan cosas distintas. */
const ESTADO: Record<string, { etiqueta: string, tono: TonoInsignia }> = {
  pendiente: { etiqueta: 'Pendiente', tono: 'acento' },
  aprobada: { etiqueta: 'Aprobada', tono: 'exito' },
  rechazada: { etiqueta: 'Rechazada', tono: 'peligro' }
}

export function HistorialDeAprobaciones ({ tareaId, rondas }: Props): ReactElement | null {
  const [abierto, setAbierto] = useState(false)
  const [filas, setFilas] = useState<RondaDeAprobacion[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const peticion = useRef<AbortController | null>(null)

  // Lo unico que hace el efecto es cortar la peticion en vuelo cuando el componente se desmonta. No
  // dispara la carga: esa la dispara el clic, que es cuando de verdad hace falta el dato, y hacerlo
  // desde un efecto encadenaria renders por cada `setState` del camino.
  useEffect(() => () => { peticion.current?.abort() }, [])

  /** Trae el historial. Nunca lanza: el fallo se lee debajo del boton. */
  async function cargar (): Promise<void> {
    peticion.current?.abort()

    const control = new AbortController()
    peticion.current = control

    setCargando(true)
    setFallo(null)

    try {
      const respuesta = await pedirRespuesta(`tasks/${tareaId}/approvals`, control.signal)

      if (!respuesta.ok) {
        setFallo('No se pudo traer el historial de aprobaciones.')
        return
      }

      const sobre = await respuesta.json() as { data?: RondaDeAprobacion[] }

      setFilas(sobre.data ?? [])
    } catch {
      // `pedirRespuesta` ya avisa por su cuenta lo que es de red, y el aborto no es un error: lo
      // dispara este mismo componente al desmontarse o al reabrir.
    } finally {
      if (!control.signal.aborted) setCargando(false)
    }
  }

  /** Abre o cierra. Al abrir siempre se vuelve a pedir: entre una vuelta y otra pudo haber otra ronda. */
  function alternar (): void {
    if (abierto) {
      setAbierto(false)
      return
    }

    setAbierto(true)
    void cargar()
  }

  // Menos de dos rondas no tiene historial que contar: lo unico que habria adentro ya se lee arriba.
  if (rondas === undefined || rondas <= 1) return null

  return (
    <div className="border-linea col-span-full flex flex-col gap-2 border-t pt-3">
      <Boton
        variante="sutil"
        tamano="chico"
        className="self-start"
        aria-expanded={abierto}
        onClick={alternar}
      >
        {abierto ? 'Ocultar las rondas' : `Ver las ${rondas} rondas de aprobación`}
      </Boton>

      {abierto && cargando && <p className="text-texto-sutil text-sm">Cargando…</p>}

      {abierto && fallo !== null && (
        <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>
      )}

      {abierto && !cargando && fallo === null && filas !== null && (
        filas.length === 0
          ? <p className="text-texto-sutil text-sm">Todavía no se pidió ninguna aprobación.</p>
          : <ol className="flex flex-col gap-3">{filas.map(unaRonda)}</ol>
      )}
    </div>
  )
}

/** Una ronda: numero, estado, cuando se pidió, cuando se respondió y qué dijo el cliente. */
function unaRonda (fila: RondaDeAprobacion): ReactElement {
  const lectura = fila.estado === null ? undefined : ESTADO[fila.estado]

  return (
    <li key={fila.ronda} className="border-linea flex flex-col gap-1 border-l-2 pl-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-texto text-sm font-semibold">Ronda {fila.ronda}</span>
        {lectura === undefined
          ? <Insignia tono="contorno" tamano="chico">Sin pedir</Insignia>
          : <Insignia tono={lectura.tono} tamano="chico">{lectura.etiqueta}</Insignia>}
      </div>

      <div className="text-texto-sutil flex flex-wrap gap-x-3 text-xs">
        {fila.solicitada_en !== null && (
          <span>Pedida el <Fecha valor={fila.solicitada_en} conHora /></span>
        )}
        {fila.resuelta_en !== null && (
          <span>Respondida el <Fecha valor={fila.resuelta_en} conHora /></span>
        )}
      </div>

      {/* El comentario se muestra en TODAS las rondas y no solo en las rechazadas: un "aprobado,
          pero la próxima vez avisen antes" es exactamente el dato que se venía perdiendo. */}
      {fila.comentario !== null && fila.comentario !== '' && (
        <p className="text-texto-tenue text-sm">
          <span className="text-texto-sutil">Dijo el cliente: </span>
          {fila.comentario}
        </p>
      )}
    </li>
  )
}
