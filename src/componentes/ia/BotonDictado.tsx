'use client'

import { Loader2, Mic, Square } from 'lucide-react'
import { type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { useDictado, type FaseDictado } from './useDictado'

interface PropsBotonDictado {
  /** Lo que hay en el campo ahora. Se lee al arrancar el dictado. */
  valor: string
  /** Recibe el texto que el campo tiene que mostrar mientras se dicta. */
  alEscribir: (texto: string) => void
  /** Largo maximo del campo, en caracteres. */
  maximo: number
  /** Apaga el boton mientras el chat esta ocupado. */
  deshabilitado?: boolean
}

/** Que dice el boton en cada fase, para el lector de pantalla y para el globo del raton. */
const ETIQUETAS: Record<FaseDictado, string> = {
  reposo: 'Dictar la pregunta',
  escuchando: 'Parar el dictado',
  grabando: 'Parar el dictado',
  transcribiendo: 'Transcribiendo el dictado'
}

/** El aviso que acompaña al boton. Vacio en reposo: no hay nada que contar. */
const AVISOS: Record<FaseDictado, string> = {
  reposo: '',
  escuchando: 'Escuchando…',
  grabando: 'Grabando…',
  transcribiendo: 'Transcribiendo…'
}

/**
 * El microfono del chat: dicta y el texto cae en el campo, donde se puede corregir a mano.
 *
 * **No se dibuja si el navegador no puede dictar por ningun camino**: ni reconocer voz ni grabar
 * audio. Un microfono que no puede grabar no es un boton, es una trampa.
 *
 * Las dos formas de dictar se ven distintas a proposito. Con el motor del navegador el texto
 * aparece mientras se habla ("Escuchando…"); con el respaldo hay que terminar de hablar, esperar a
 * que el board transcriba ("Grabando…", despues "Transcribiendo…") y el texto llega de una vez. Es
 * una diferencia real en el tiempo de espera y esconderla dejaria a la persona mirando un campo
 * vacio sin saber si la estan oyendo.
 *
 * El error se muestra aca abajo y no en un aviso flotante porque es local al campo y se arregla
 * ahi mismo: dar permiso, conectar un microfono, hablar mas cerca.
 */
export function BotonDictado ({ valor, alEscribir, maximo, deshabilitado = false }: PropsBotonDictado): ReactElement | null {
  const dictado = useDictado(() => valor, alEscribir, maximo)

  if (!dictado.soportado) return null

  const etiqueta = ETIQUETAS[dictado.fase]
  const aviso = AVISOS[dictado.fase]
  const andando = dictado.fase === 'escuchando' || dictado.fase === 'grabando'

  return (
    <div className="flex items-center gap-2">
      <Boton
        type="button"
        variante="sutil"
        soloIcono
        aria-pressed={andando}
        aria-label={etiqueta}
        title={etiqueta}
        disabled={deshabilitado || dictado.fase === 'transcribiendo'}
        onClick={dictado.alternar}
      >
        {dictado.fase === 'transcribiendo'
          ? <Loader2 className="animate-spin" aria-hidden />
          : andando ? <Square aria-hidden /> : <Mic aria-hidden />}
      </Boton>

      {aviso !== '' && (
        <span role="status" className="text-texto-tenue text-xs">{aviso}</span>
      )}
      {dictado.error !== '' && (
        <span role="alert" className="text-texto-tenue text-xs">{dictado.error}</span>
      )}
    </div>
  )
}
