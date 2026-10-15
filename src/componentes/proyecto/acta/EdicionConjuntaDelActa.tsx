'use client'

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { Boton } from '@/componentes/formularios/Boton'
import { GrupoEnlacesPersona } from '@/componentes/presentadores/GrupoEnlacesPersona'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { colorDeColaborador, textoDeGuardado } from '@/dominio/acta-colaborativa'
import { ASISTENTE, GLOSARIO } from '@/dominio/glosario'
import { EditorDeActa } from '../EditorDeActa'
import type { ComentariosDelEditor } from './comentariosDelEditor'
import { useActaColaborativa } from './useActaColaborativa'
import { useEditoresDelActa } from './useEditoresDelActa'

/** Cuánto se espera, al cerrar, a que lo último que se escribió llegue al servicio. */
const ESPERA_DE_ENVIO_MS = 3000

/** Cada cuánto se mira si ya llegó todo al servicio mientras se espera. */
const SONDEO_DE_ENVIO_MS = 100

interface PropsEdicionConjunta {
  actaId: number
  /** El Proyecto (Espacio) del acta: el BFF lo usa para comprobar el permiso. */
  proyectoId: number
  marca: string | null
  conIa: boolean
  /** Quien edita: su nombre y color son lo que los demás ven en su cursor. */
  yo: { id: number, full_name: string, profile_image_url: string | null }
  /** El servicio guardó una versión nueva: hay que volver a pedir el acta para ver su revisión. */
  onGuardado: () => void
  /** La persona cerró la edición y lo escrito ya llegó al servicio. */
  onCerrar: () => void
  /**
   * La edición conjunta no se pudo sostener (no abrió, o se perdió y no volvió): se sigue con la
   * edición de siempre. Trae lo último que se vio en el editor y la última revisión guardada, si hubo.
   */
  onSinConexion: (html: string | null, revision: string | null) => void
  /**
   * Los comentarios en línea, si están activos: el editor ofrece «Comentar». La marca de cada hilo
   * viaja por el documento compartido como cualquier otro texto.
   */
  comentarios?: ComentariosDelEditor
}

/**
 * Espera a que el proveedor haya enviado todo lo que tenía pendiente, hasta un tope.
 *
 * Cerrar el editor con una tecla todavía en el buffer del socket la perdería: el servicio guarda al
 * desconectarse el último cliente, pero solo lo que ya le llegó.
 *
 * @param provider el proveedor de la sesión
 * @param topeMs cuánto esperar como máximo
 * @returns cuando no hay cambios sin enviar, o al vencer el tope
 */
async function esperarEnvio (provider: HocuspocusProvider | null, topeMs: number): Promise<void> {
  const limite = Date.now() + topeMs

  while (provider !== null && provider.hasUnsyncedChanges && Date.now() < limite) {
    await new Promise<void>((resolver) => { window.setTimeout(resolver, SONDEO_DE_ENVIO_MS) })
  }
}

/**
 * El Meeting Paper en edición conjunta: la barra de quién está y cuándo se guardó, y el editor
 * montado sobre el documento compartido.
 *
 * No hay Guardar ni Descartar: el servicio guarda solo, cada pocos segundos, y avisa cuando lo hizo.
 * Lo único que se decide es cerrar la edición. Si la conexión no abre o se pierde y no vuelve, se
 * avisa a quien lo monta para que siga con la edición de siempre (`onSinConexion`). Si se pierde
 * mientras hay sesión, el editor se retira y se reconecta con un documento nuevo; ver
 * `useActaColaborativa` para el porqué.
 *
 * @param props el acta, quién edita y qué hacer al guardar, cerrar o perder la conexión
 * @returns la edición conjunta, o el estado de la conexión mientras no está lista
 */
export function EdicionConjuntaDelActa ({ actaId, proyectoId, marca, conIa, yo, onGuardado, onCerrar, onSinConexion, comentarios }: PropsEdicionConjunta): ReactElement {
  const aviso = useAviso()
  const sesion = useActaColaborativa(actaId, proyectoId, true)
  const editores = useEditoresDelActa(sesion.provider, yo.id)
  const [cerrando, setCerrando] = useState(false)
  const ultimoHtml = useRef<string | null>(null)
  const [estuvoListo, setEstuvoListo] = useState(false)
  const revisionAvisada = useRef<string | null>(null)
  const recargadosAvisados = useRef(0)

  const colaboracion = useMemo(() => {
    if (sesion.estado !== 'listo' || sesion.provider === null || sesion.ydoc === null) return undefined

    return {
      provider: sesion.provider,
      ydoc: sesion.ydoc,
      usuario: { id: yo.id, name: yo.full_name, color: colorDeColaborador(yo.id), imagen: yo.profile_image_url }
    }
  }, [sesion.estado, sesion.provider, sesion.ydoc, yo.id, yo.full_name, yo.profile_image_url])

  // Para distinguir «conectando» de «reconectando»; se ajusta en el render, como pide React para
  // derivar estado de lo que ya se calculó.
  if (colaboracion !== undefined && !estuvoListo) setEstuvoListo(true)

  useEffect(() => {
    if (sesion.revision === null || sesion.revision === revisionAvisada.current) return

    revisionAvisada.current = sesion.revision
    onGuardado()
  }, [sesion.revision, onGuardado])

  useEffect(() => {
    if (sesion.recargados === recargadosAvisados.current) return

    recargadosAvisados.current = sesion.recargados
    aviso.advertencia(`El ${GLOSARIO.acta.singular} cambió fuera de la edición conjunta; se cargó la última versión.`)
    // `aviso` es estable (funciones de módulo): no hace falta volver a correr por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion.recargados])

  useEffect(() => {
    if (sesion.estado === 'sin_conexion') onSinConexion(ultimoHtml.current, sesion.revision)
    // Solo importa el paso a `sin_conexion`; el resto de los valores se leen en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion.estado])

  /** Cierra la edición cuando lo último escrito ya llegó al servicio. */
  async function cerrar (): Promise<void> {
    setCerrando(true)
    await esperarEnvio(sesion.provider, ESPERA_DE_ENVIO_MS)
    onCerrar()
  }

  if (sesion.estado === 'sin_acceso') {
    return (
      <div className="flex flex-col items-start gap-3">
        <AvisoEnLinea
          variante="error"
          mensaje={`Ya no tienes acceso a este ${GLOSARIO.acta.singular}.`}
          className="bg-superficie-peligro rounded-chico px-3 py-2 text-sm"
        />
        <Boton variante="secundario" tamano="chico" onClick={onCerrar}>Cerrar edición</Boton>
      </div>
    )
  }

  if (colaboracion === undefined) {
    return (
      <p role="status" className="text-texto-tenue text-sm">
        {estuvoListo
          ? 'Se perdió la conexión; reconectando la edición conjunta…'
          : 'Conectando la edición conjunta…'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {editores.personas.length > 0
            ? (
              <>
                <GrupoEnlacesPersona personas={editores.personas} />
                <span className="text-texto-tenue text-xs">Editando contigo</span>
              </>
              )
            : <span className="text-texto-tenue text-xs">Solo tú estás editando</span>}
          {editores.orbe && <Insignia tono="acento" tamano="chico">{ASISTENTE} está escribiendo</Insignia>}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-texto-tenue text-xs tabular-nums">{textoDeGuardado(sesion.ultimoGuardado)}</span>
          <Boton variante="primario" tamano="chico" cargando={cerrando} onClick={() => { void cerrar() }}>
            Cerrar edición
          </Boton>
        </div>
      </div>

      <EditorDeActa
        colaboracion={colaboracion}
        proyectoId={proyectoId}
        conIa={conIa}
        marca={marca}
        actaId={actaId}
        comentarios={comentarios}
        onCambio={(html) => { ultimoHtml.current = html }}
      />
    </div>
  )
}
