'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, LoaderCircle } from 'lucide-react'
import { escribirEnBff, subirArchivoEnBff } from '@/componentes/datos/mutaciones'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual,
  SeparadorMenu
} from '@/componentes/superposiciones/MenuContextual'
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
  tamano?: 'chico' | 'grande' | 'destacada'
  className?: string
}

/**
 * Muestra la marca de un cliente o proyecto y, cuando corresponde, permite reemplazarla o quitarla.
 *
 * **Las acciones viven en la propia imagen**, no al lado: antes la cabecera arrastraba dos botones y
 * un enlace entre el avatar y el titulo, que es el lugar mas caro de la pantalla ocupado por lo que
 * se usa una vez en la vida de un proyecto. Ahora la imagen es el control: al pasar por encima —o al
 * llegar con el teclado— aparece la camara, y el menu ofrece subir, quitar y la guia de formato.
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
      setError('Elige una imagen JPG, PNG o WebP.')
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

  const tamanos = {
    chico: 'size-8 text-xs',
    grande: 'size-12 text-base',
    destacada: 'size-16 text-seccion sm:size-20',
  }[tamano]
  const marco = cn(
    'border-linea bg-superficie-hundida relative block overflow-hidden rounded-control border',
    tamanos
  )

  /** La imagen, o las iniciales sobre su color. Es lo unico que ve quien no puede editar. */
  const retrato = (
    <>
      {muestraImagen
        ? (
          // Las imágenes llegan desde `uploads/`, sin tamaño fijo para optimizar con `next/image`.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagen} alt={nombre} className="size-full object-cover" onError={() => setImagenFallida(imagen)} />
          )
        : (
          <span
            className="flex size-full items-center justify-center font-semibold"
            style={{ backgroundColor: coloresAvatar(nombre).fondo, color: coloresAvatar(nombre).texto }}
          >
            {iniciales(nombre, 2)}
          </span>
          )}
    </>
  )

  if (!puedeEditar || ruta === undefined) {
    return (
      <span className={cn('flex shrink-0 items-center', className)}>
        <span className={marco} title={nombre}>{retrato}</span>
      </span>
    )
  }

  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={cambiarImagen}
      />

      <MenuContextual>
        <DisparadorMenu asChild>
          <button
            type="button"
            disabled={cargando}
            aria-label={`Imagen de ${nombre}. Cambiar imagen.`}
            className={cn(marco, 'group cursor-pointer disabled:cursor-progress')}
          >
            {retrato}

            {/* La capa oscura solo aparece cuando hay intencion: puntero encima, foco de teclado o
                menu abierto. Mientras sube se queda fija, porque ahi si esta pasando algo. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-0 flex items-center justify-center bg-black/45 text-white',
                'transition-opacity duration-150',
                cargando
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:opacity-100'
              )}
            >
              {cargando
                ? <LoaderCircle className="size-4 animate-spin" strokeWidth={2} />
                : <Camera className="size-4" strokeWidth={2} />}
            </span>
          </button>
        </DisparadorMenu>

        <ContenidoMenu align="start">
          <ItemMenu onSelect={() => { entrada.current?.click() }}>
            {imagenPropia === null ? 'Subir imagen' : 'Cambiar imagen'}
          </ItemMenu>
          {imagenPropia !== null && (
            <ItemMenu peligroso onSelect={() => { void quitarImagen() }}>Quitar imagen</ItemMenu>
          )}
          <SeparadorMenu />
          {/* La guia es una descarga, no una accion sobre la entidad: va como enlace de verdad para
              conservar el menu contextual del navegador y el "abrir en pestaña nueva". */}
          <ItemMenu asChild>
            <a href="/plantillas/guia-imagen-entidad.png" download="guia-imagen-wiwo.png">
              Descargar guía de formato
            </a>
          </ItemMenu>
        </ContenidoMenu>
      </MenuContextual>

      {error !== null && <span role="alert" className="text-texto-peligro text-xs">{error}</span>}
    </div>
  )
}
