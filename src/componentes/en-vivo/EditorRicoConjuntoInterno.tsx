'use client'

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { useAviso } from '@/componentes/estado/useAviso'
import { EditorRico, type PropsEditorRico } from '@/componentes/formularios/EditorRico'
import { EditorRicoMarcador } from '@/componentes/formularios/EditorRicoMarcador'
import { GrupoEnlacesPersona } from '@/componentes/presentadores/GrupoEnlacesPersona'
import { colorDeColaborador, textoDeGuardado } from '@/dominio/acta-colaborativa'
import { pedirBoletoConPermiso } from './boletoDeDocumento'
import { cursorDeColaborador, seleccionDeColaborador } from './cursores'
import { useDocumentoColaborativo, type MotivoDeFin } from './useDocumentoColaborativo'
import { useEditoresDelDocumento } from './useEditoresDelDocumento'
import { useYoEnVivo } from './useYoEnVivo'

/** Los textos que se editan en conjunto y el documento del servicio que corresponde a cada uno. */
export interface DocumentoDeTexto {
  clase: 'tarea' | 'ticket-borrador'
  id: number
}

export interface PropsEditorRicoConjunto extends Omit<PropsEditorRico, 'colaboracion'> {
  documento: DocumentoDeTexto
  /**
   * Si se avisa con un cartel cuando el servicio recarga el texto desde el board (alguien lo cambió por
   * otra vía). Por omisión, sí. El borrador de un ticket lo apaga: se recarga vacío cada vez que
   * alguien envía la respuesta, y avisarlo a quien la envió sería ruido.
   */
  avisarAlRecargar?: boolean
  /**
   * Se llama una vez cuando la edición conjunta deja de sostenerse (sin conexión o sin acceso) y se
   * sigue con el editor de siempre: quien lo usa pasa a guardar el texto por su propia vía.
   */
  alCaerElConjunto?: () => void
}

/**
 * El aviso que acompaña al editor de siempre cuando la edición conjunta terminó.
 *
 * @param estado cómo terminó la sesión
 * @param motivo si había texto en juego: se cortó con cambios sin enviar, o el board no aceptó guardar
 * @returns el aviso, o `null` si no hace falta (no abrió nunca o se cayó sin texto en juego)
 */
function avisoDeFin (
  estado: 'sin_conexion' | 'sin_acceso',
  motivo: MotivoDeFin | null
): { variante: 'error' | 'aviso', mensaje: string } | null {
  if (estado === 'sin_acceso') {
    return { variante: 'error', mensaje: 'Ya no tienes acceso a este texto en edición conjunta; lo que escribas aquí no se compartirá.' }
  }

  if (motivo === 'cambios_sin_enviar') {
    return { variante: 'aviso', mensaje: 'Se cortó la conexión de la edición conjunta con lo último que escribiste. Tu texto sigue aquí; guarda para no perderlo.' }
  }

  if (motivo === 'no_guardado') {
    return { variante: 'aviso', mensaje: 'No se pudieron guardar los cambios de la edición conjunta. Tu texto sigue aquí; guarda para no perderlo.' }
  }

  return null
}

/**
 * El editor de texto enriquecido en edición conjunta: el cuerpo que se carga bajo demanda desde
 * `EditorRicoConjunto`. Nadie lo importa directo, o Yjs y el proveedor de Hocuspocus viajarían en el
 * chunk de cada pantalla que ofrece escribir un texto.
 *
 * Abre la sesión del documento (`tarea:{id}` o `ticket-borrador:{id}`) y, con ella sincronizada, monta
 * el editor de siempre sobre el documento compartido, con una barra de quién más está y cuándo se
 * guardó. No hay Guardar: el servicio guarda solo.
 *
 * - Mientras se conecta, o se reconecta tras perder la conexión, se muestra un marcador: un editor
 *   montado sobre un documento todavía vacío mezclaría lo que se escribe con lo que llega.
 * - Si no abre (sin conexión, boleto negado, el servicio apagado) o pierde el acceso, **se sigue con el
 *   editor de siempre** y lo último que se vio en pantalla: apagar «en vivo» o que se caiga no deja a
 *   nadie sin poder escribir.
 *
 * @param props las del editor de siempre más el documento que se edita
 * @returns el editor conjunto, un marcador o el editor de siempre, según el estado de la sesión
 */
export function EditorRicoConjuntoInterno ({
  documento,
  avisarAlRecargar = true,
  alCaerElConjunto,
  valorInicial = null,
  onCambio,
  ...resto
}: PropsEditorRicoConjunto): ReactElement {
  const aviso = useAviso()
  const nombre = `${documento.clase}:${documento.id}`
  const yo = useYoEnVivo()
  // El BFF dice con el boleto si la persona puede escribir; si no, el servicio la abre en solo lectura.
  const [puedeEscribir, setPuedeEscribir] = useState(true)
  const sesion = useDocumentoColaborativo({
    nombre,
    pedirBoleto: async () => {
      const { boleto, escritura } = await pedirBoletoConPermiso(nombre, null)

      setPuedeEscribir(escritura)

      return boleto
    },
    activo: true,
    identidad: nombre
  })
  const editores = useEditoresDelDocumento(sesion.provider, yo?.id ?? 0)
  // Lo último que se vio en el editor, para seguir desde ahí si la edición conjunta se cae. Es estado
  // y no una ref porque se lee al dibujar el editor de siempre.
  const [ultimoHtml, setUltimoHtml] = useState<string | null>(null)
  const recargadosAvisados = useRef(0)

  const colaboracion = useMemo(() => {
    if (sesion.estado !== 'listo' || sesion.provider === null || sesion.ydoc === null || yo === null) return undefined

    return {
      sesion: sesion.ydoc,
      extensiones: [
        Collaboration.configure({ document: sesion.ydoc }),
        CollaborationCaret.configure({
          provider: sesion.provider,
          user: { id: yo.id, name: yo.full_name, color: colorDeColaborador(yo.id), imagen: yo.profile_image_url },
          render: cursorDeColaborador,
          selectionRender: seleccionDeColaborador
        })
      ]
    }
  }, [sesion.estado, sesion.provider, sesion.ydoc, yo])

  useEffect(() => {
    if (sesion.recargados === recargadosAvisados.current) return

    recargadosAvisados.current = sesion.recargados
    if (avisarAlRecargar) aviso.advertencia('El texto cambió fuera de tu edición; se cargó la última versión.')
    // `aviso` es estable (funciones de módulo): no hace falta volver a correr por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion.recargados])

  useEffect(() => {
    if (sesion.estado === 'sin_conexion' || sesion.estado === 'sin_acceso') alCaerElConjunto?.()
    // Solo importa el paso a un estado final; `alCaerElConjunto` suele ser una función nueva en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion.estado])

  function alCambiar (html: string): void {
    setUltimoHtml(html)
    onCambio(html)
  }

  const deshabilitado = resto.deshabilitado === true || !puedeEscribir

  if (sesion.estado === 'sin_conexion' || sesion.estado === 'sin_acceso') {
    const aviso = avisoDeFin(sesion.estado, sesion.motivoDeFin)

    return (
      <div className="flex flex-col gap-2">
        {aviso !== null && <AvisoEnLinea variante={aviso.variante} mensaje={aviso.mensaje} className="text-sm" />}
        <EditorRico key="solo" {...resto} deshabilitado={deshabilitado} valorInicial={ultimoHtml ?? valorInicial} onCambio={alCambiar} />
      </div>
    )
  }

  if (colaboracion === undefined) {
    return (
      <div className="flex flex-col gap-1.5">
        <EditorRicoMarcador etiqueta={resto.etiqueta} />
        <p role="status" className="text-texto-tenue text-xs">Conectando la edición conjunta…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {editores.personas.length > 0
            ? (
              <>
                <GrupoEnlacesPersona personas={editores.personas} />
                <span className="text-texto-tenue">Editando contigo</span>
              </>
              )
            : <span className="text-texto-tenue">Solo tú estás editando</span>}
        </div>
        <span className="text-texto-tenue tabular-nums">{textoDeGuardado(sesion.ultimoGuardado)}</span>
      </div>

      {!puedeEscribir && (
        <p role="status" className="text-texto-tenue text-xs">
          Solo lectura: no tienes permiso para editar este texto. Verás en vivo lo que escriban los demás.
        </p>
      )}

      <EditorRico key="conjunto" {...resto} deshabilitado={deshabilitado} colaboracion={colaboracion} onCambio={alCambiar} />
    </div>
  )
}
