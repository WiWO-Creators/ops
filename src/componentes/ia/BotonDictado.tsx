'use client'

import { Mic, Square } from 'lucide-react'
import { type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { useDictado } from './useDictado'

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

/**
 * El microfono del chat: dicta y el texto cae en el campo, donde se puede corregir a mano.
 *
 * **No se dibuja si el navegador no sabe reconocer voz** (Firefox, WebKit de iOS): un microfono que
 * no puede grabar no es un boton, es una trampa. Quien use esos navegadores ve el chat de antes.
 *
 * El error se muestra aca abajo y no en un aviso flotante porque es local al campo y se arregla
 * ahi mismo —dar permiso, conectar un microfono, hablar mas cerca—.
 */
export function BotonDictado ({ valor, alEscribir, maximo, deshabilitado = false }: PropsBotonDictado): ReactElement | null {
  const dictado = useDictado(() => valor, alEscribir, maximo)

  if (!dictado.soportado) return null

  return (
    <div className="flex items-center gap-2">
      <Boton
        type="button"
        variante="sutil"
        soloIcono
        aria-pressed={dictado.dictando}
        aria-label={dictado.dictando ? 'Parar el dictado' : 'Dictar la pregunta'}
        title={dictado.dictando ? 'Parar el dictado' : 'Dictar la pregunta'}
        disabled={deshabilitado}
        onClick={dictado.alternar}
      >
        {dictado.dictando ? <Square aria-hidden /> : <Mic aria-hidden />}
      </Boton>

      {dictado.dictando && (
        <span role="status" className="text-texto-tenue text-xs">Escuchando…</span>
      )}
      {dictado.error !== '' && (
        <span role="alert" className="text-texto-tenue text-xs">{dictado.error}</span>
      )}
    </div>
  )
}
