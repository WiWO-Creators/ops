'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactElement } from 'react'
import { ConfirmarBorrado, useConfirmarBorrado } from '@/componentes/datos/ConfirmarBorrado'
import { Boton } from '@/componentes/formularios/Boton'
import { useAviso } from '@/componentes/estado/useAviso'
import { escribirEnBff, leerDelBff } from '@/componentes/datos/mutaciones'
import { lineasDeCascada, nombreDeEntidad } from '@/dominio/papelera'
import type { ElementoEnPapelera, PrevisualizacionDeBorrado } from '@/datos/recursos'

/** La palabra que exige `DELETE /trash/...`. Exacta: la API no hace `trim` ni ignora mayúsculas. */
const PALABRA = 'ELIMINAR'

/**
 * Restaurar y borrar definitivamente una fila de la Papelera.
 *
 * Restaurar va directo, sin diálogo: es lo que se vino a hacer acá y no destruye nada. Borrar
 * definitivamente es el único borrado irreversible del panel, así que abre un diálogo que primero
 * trae la previsualización —cuántas Tareas, comentarios, adjuntos y horas se van— y exige escribir
 * la palabra. La previsualización no bloquea: si falla, se avisa y la palabra sigue alcanzando.
 */
export function AccionesPapelera ({ elemento }: { elemento: ElementoEnPapelera }): ReactElement {
  const router = useRouter()
  const aviso = useAviso()
  const [restaurando, setRestaurando] = useState(false)
  const [falloFila, setFalloFila] = useState<string | null>(null)
  const confirmarBorrado = useConfirmarBorrado()
  const [previa, setPrevia] = useState<PrevisualizacionDeBorrado | null>(null)
  const [falloPrevia, setFalloPrevia] = useState<string | null>(null)

  const ruta = `${elemento.entidad}/${elemento.id}`
  const bloqueado = previa !== null && !previa.puede_purgarse
  const lineas = lineasDeCascada(previa?.se_borra)
  const desvinculadas = lineasDeCascada(previa?.se_desvincula)

  /** Saca el elemento de la papelera, entero. Nunca lanza: el fallo queda bajo la fila. */
  async function restaurar (): Promise<void> {
    setRestaurando(true)
    setFalloFila(null)

    const resultado = await escribirEnBff(`trash/${ruta}/restore`, 'POST')

    setRestaurando(false)

    if (!resultado.ok) {
      setFalloFila(resultado.mensaje)
      return
    }

    router.refresh()
  }

  /** Abre el diálogo limpio y pide qué se lleva la cascada. */
  async function abrirBorrado (): Promise<void> {
    setPrevia(null)
    setFalloPrevia(null)
    confirmarBorrado.abrir()

    const resultado = await leerDelBff<PrevisualizacionDeBorrado>(`${ruta}/deletion-preview`)

    if (resultado.ok) setPrevia(resultado.datos)
    else setFalloPrevia(resultado.mensaje)
  }

  /**
   * El borrado definitivo. Solo existe acá: fuera de la papelera, eliminar siempre es reversible.
   * Lanza si falla: `ConfirmarBorrado` muestra el mensaje.
   */
  async function borrar (): Promise<void> {
    const resultado = await escribirEnBff(`trash/${ruta}`, 'DELETE', { confirmacion: PALABRA })

    if (!resultado.ok) throw new Error(resultado.mensaje)

    aviso.exito(`«${elemento.nombre}» se eliminó definitivamente.`)
    router.refresh()
  }

  return (
    <>
      <span className="flex justify-end gap-2 whitespace-nowrap">
        <Boton variante="sutil" tamano="chico" onClick={() => { void abrirBorrado() }}>
          Borrar definitivamente
        </Boton>
        <Boton variante="primario" tamano="chico" cargando={restaurando} onClick={() => { void restaurar() }}>
          Restaurar
        </Boton>
      </span>

      {falloFila !== null && <p role="alert" className="text-texto-peligro mt-1 text-right text-xs">{falloFila}</p>}

      <ConfirmarBorrado
        abierto={confirmarBorrado.abierto}
        onCerrar={confirmarBorrado.cerrar}
        tamano="chico"
        titulo="Borrar definitivamente"
        advertencia={`«${elemento.nombre}» (${nombreDeEntidad(elemento.entidad).toLowerCase()}) se borra para siempre, con todo lo que cuelga. Esto no se puede deshacer.`}
        confirmacionEscrita={PALABRA}
        etiquetaConfirmar="Borrar para siempre"
        deshabilitadoExtra={bloqueado}
        contenidoExtra={
          <>
            <ResumenDeCascada
              cargando={previa === null && falloPrevia === null}
              fallo={falloPrevia}
              lineas={lineas}
              desvinculadas={desvinculadas}
            />

            {bloqueado && (
              <p role="alert" className="text-texto-peligro text-sm">
                {previa?.motivo ?? 'No se puede borrar definitivamente.'}
              </p>
            )}
          </>
        }
        onConfirmar={borrar}
      />
    </>
  )
}

interface PropsResumen {
  cargando: boolean
  fallo: string | null
  lineas: string[]
  desvinculadas: string[]
}

/** Qué se lleva el borrado, dicho antes de pedir la palabra y no después. */
function ResumenDeCascada ({ cargando, fallo, lineas, desvinculadas }: PropsResumen): ReactElement {
  if (cargando) return <p className="text-texto-tenue text-sm">Calculando qué se borra…</p>

  if (fallo !== null) {
    return <p className="text-texto-tenue text-sm">No se pudo calcular qué se borra: {fallo}</p>
  }

  return (
    <div className="rounded-chico bg-superficie-hundida flex flex-col gap-2 p-3 text-sm">
      <p className="text-texto-tenue text-xs">Se borra</p>
      {lineas.length === 0
        ? <p>Solo el elemento: no tiene nada colgando.</p>
        : <ul className="list-disc pl-5">{lineas.map((linea) => <li key={linea}>{linea}</li>)}</ul>}

      {desvinculadas.length > 0 && (
        <>
          <p className="text-texto-tenue text-xs">Queda, pero sin vínculo</p>
          <ul className="list-disc pl-5">{desvinculadas.map((linea) => <li key={linea}>{linea}</li>)}</ul>
        </>
      )}
    </div>
  )
}
