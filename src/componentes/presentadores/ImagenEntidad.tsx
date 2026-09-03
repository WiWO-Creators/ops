'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { escribirEnBff, subirArchivoEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { cn } from '@/lib/clases'
import { coloresAvatar, iniciales } from '@/lib/personas'

const LIMITE_BYTES = 5 * 1024 * 1024
const TIPOS_ACEPTADOS = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface PropsImagenEntidad {
  nombre: string
  /** Archivo propio. `null` permite mostrar una imagen heredada sin duplicarla. */
  imagenPropia: string | null
  imagenEfectiva?: string | null
  ruta?: string
  puedeEditar?: boolean
  tamano?: 'chico' | 'grande'
  className?: string
}

/**
 * Muestra la marca de un cliente o proyecto y, cuando corresponde, permite reemplazarla o quitarla.
 *
 * @param imagenPropia archivo de la entidad; un proyecto sin este valor puede recibir `imagenEfectiva`
 *   desde su cliente.
 */
export function ImagenEntidad ({
  nombre,
  imagenPropia,
  imagenEfectiva = imagenPropia,
  ruta,
  puedeEditar = false,
  tamano = 'chico',
  className
}: PropsImagenEntidad) {
  const router = useRouter()
  const entrada = useRef<HTMLInputElement>(null)
  const [imagenFallida, setImagenFallida] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imagen = imagenEfectiva ?? ''
  const muestraImagen = imagen !== '' && imagenFallida !== imagen

  /** Valida y envía el único archivo permitido por el contrato. */
  const cambiarImagen = async (evento: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const archivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!archivo || !ruta) return

    if (!TIPOS_ACEPTADOS.has(archivo.type)) {
      setError('Elegí una imagen JPG, PNG o WebP.')
      return
    }
    if (archivo.size > LIMITE_BYTES) {
      setError('La imagen no puede superar 5 MB.')
      return
    }

    setCargando(true)
    setError(null)
    const resultado = await subirArchivoEnBff<unknown>(`${ruta}/image`, archivo, 'image')
    setCargando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    router.refresh()
  }

  /** Borra solo la imagen propia: la heredada vuelve a mostrarse en el proyecto. */
  const quitarImagen = async (): Promise<void> => {
    if (!ruta) return

    setCargando(true)
    setError(null)
    const resultado = await escribirEnBff<unknown>(`${ruta}/image`, 'DELETE')
    setCargando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    router.refresh()
  }

  const tamanos = tamano === 'grande' ? 'size-12 text-base' : 'size-8 text-xs'

  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      <span
        className={cn('border-linea bg-superficie-hundida inline-flex overflow-hidden rounded-control border', tamanos)}
        style={muestraImagen ? undefined : { backgroundColor: coloresAvatar(nombre).fondo, color: coloresAvatar(nombre).texto }}
        title={nombre}
      >
        {muestraImagen
          ? (
            // Las imágenes llegan desde `uploads/`, sin tamaño fijo para optimizar con `next/image`.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagen} alt={nombre} className="size-full object-cover" onError={() => setImagenFallida(imagen)} />
            )
          : <span className="m-auto font-semibold">{iniciales(nombre, 2)}</span>}
      </span>

      {puedeEditar && ruta && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={cambiarImagen}
          />
          <Boton tamano="chico" cargando={cargando} onClick={() => { entrada.current?.click() }}>
            {imagenPropia === null ? 'Subir imagen' : 'Cambiar imagen'}
          </Boton>
          {imagenPropia !== null && (
            <Boton variante="sutil" tamano="chico" disabled={cargando} onClick={quitarImagen}>Quitar</Boton>
          )}
          <a
            href="/plantillas/guia-imagen-entidad.png"
            download="guia-imagen-wiwo.png"
            className="text-texto-tenue hover:text-texto text-xs underline underline-offset-2"
          >
            Descargar guía
          </a>
          {error !== null && <span role="alert" className="text-relleno-peligro text-xs">{error}</span>}
        </div>
      )}
    </div>
  )
}
