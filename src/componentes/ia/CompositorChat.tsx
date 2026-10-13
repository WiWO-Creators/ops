'use client'

import type { ReactElement, ReactNode, Ref } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { cn } from '@/lib/clases'
import { BotonDictado } from './BotonDictado'

interface PropsCompositorChat {
  valor: string
  onCambio: (valor: string) => void
  /** Se llama con Enter (no Shift+Enter ni durante la composición IME) y al enviar el formulario. */
  onEnviar: () => void
  /** Límite de caracteres: 1000 en la consulta, 12000 en el agente. */
  maximo: number
  /** Bloquea el campo y el dictado. */
  deshabilitado?: boolean
  /** Bloquea solo el botón de enviar, además de cuando el campo está vacío. */
  envioDeshabilitado?: boolean
  placeholder: string
  /** El límite de la función, siempre visible al pie. */
  pie: string
  etiquetaEnviar: string
  /** Si el dictado puede caer al respaldo de Whisper (solo el equipo). */
  dictadoConRespaldo?: boolean
  /** Encima del campo: p. ej. el chip de contexto de la pantalla. */
  cabecera?: ReactNode
  /** Ref del campo, para enfocarlo desde fuera (p. ej. «Editar pregunta»). */
  campoRef?: Ref<HTMLTextAreaElement>
  /** Avisos entre el campo y el pie (p. ej. «envía los cambios o borra el texto»). */
  aviso?: ReactNode
  className?: string
  claseCampo?: string
  claseEnviar?: string
}

/**
 * El compositor de las dos conversaciones: campo, dictado y enviar.
 *
 * Enter envía; Shift+Enter hace salto de línea; durante la composición IME no envía.
 */
export function CompositorChat ({
  valor,
  onCambio,
  onEnviar,
  maximo,
  deshabilitado = false,
  envioDeshabilitado = false,
  placeholder,
  pie,
  etiquetaEnviar,
  dictadoConRespaldo,
  cabecera,
  campoRef,
  aviso,
  className,
  claseCampo,
  claseEnviar
}: PropsCompositorChat): ReactElement {
  return (
    <form className={cn('flex flex-col gap-2', className)} onSubmit={(evento) => { evento.preventDefault(); onEnviar() }}>
      {cabecera}
      <AreaTexto
        ref={campoRef}
        className={claseCampo}
        value={valor}
        onChange={(evento) => { onCambio(evento.target.value) }}
        onKeyDown={(evento) => {
          if (evento.key !== 'Enter' || evento.shiftKey || evento.nativeEvent.isComposing) return

          evento.preventDefault()
          onEnviar()
        }}
        maxLength={maximo}
        disabled={deshabilitado}
        aria-label="Tu pregunta"
        placeholder={placeholder}
      />
      {aviso}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Siempre visible, también con el hilo lleno: es el límite de la función, no un aviso de
            bienvenida que se lee una vez. */}
        <p className="text-texto-sutil text-xs">{pie}</p>
        <div className="flex items-center gap-2">
          <BotonDictado valor={valor} alEscribir={onCambio} maximo={maximo} deshabilitado={deshabilitado} conRespaldo={dictadoConRespaldo} />
          <Boton type="submit" variante="primario" className={claseEnviar} disabled={deshabilitado || envioDeshabilitado || valor.trim() === ''}>
            {etiquetaEnviar}
          </Boton>
        </div>
      </div>
    </form>
  )
}
