import type { ReactElement } from 'react'
import { Download, FileAudio, FileText } from 'lucide-react'
import { origenDeArchivo } from '@/definiciones/archivos'
import { formatoPeso, seVeComoImagen } from '@/dominio/actas'
import { nombrar } from '@/dominio/glosario'
import type { Acta, AdjuntoActa } from '@/datos/recursos'

/**
 * Los archivos con los que se escribió el acta: el audio de la reunión, las fotos de la pizarra, el
 * documento que alguien ya había redactado.
 *
 * === POR QUÉ EXISTE ESTE BLOQUE ===
 *
 * Hasta ahora no existía porque no había nada que listar: los tres eran la fuente de entrada del
 * modelo y morían con la petición. Lo que quedaba del audio de una reunión de dos horas era el texto
 * que el modelo escribió a partir de él. Ahora quedan guardados y este bloque es por donde se
 * vuelve a ellos.
 *
 * === POR QUÉ VA DEBAJO DEL DOCUMENTO Y NO EN LA CABECERA ===
 *
 * El acta es lo que se viene a leer; los adjuntos son la prueba a la que se recurre cuando algo del
 * acta se discute. Arriba competirían con el documento por la primera mirada, y cada uno de ellos es
 * un clic que descarga decenas de megas.
 *
 * === EL TÍTULO Y EL BOTÓN VAN BAJO LA IMAGEN, NO ENCIMA NI AL LADO ===
 *
 * Es un `figure` con su `figcaption`, que es exactamente la relación que hay: el texto describe a la
 * imagen que tiene arriba. Puestos al lado, con miniaturas de alturas distintas, el título de una
 * foto queda a la altura de la de al lado y deja de estar claro cuál nombra. Debajo y dentro de la
 * misma tarjeta, la pertenencia no se puede leer mal.
 *
 * La miniatura va con `object-contain` y no `object-cover`: una foto de pizarra recortada por el
 * centro pierde justo las esquinas, que es donde está lo que se anotó al final.
 */
export function AdjuntosDelActa ({ acta }: { acta: Acta }): ReactElement | null {
  const adjuntos = acta.attachments ?? []

  if (adjuntos.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-texto text-sm font-semibold">
          Archivos de la reunión
        </h3>
        <p className="text-texto-sutil text-xs">
          {adjuntos.length === 1 ? '1 archivo' : `${adjuntos.length} archivos`} · el primero es el que
          leyó el asistente
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {adjuntos.map((adjunto) => (
          <li key={adjunto.id}>
            <TarjetaDeAdjunto adjunto={adjunto} proyecto={acta.project_name ?? ''} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Un adjunto: su vista previa, su nombre, de qué Proyecto es y su botón de descarga.
 *
 * La descarga va por el BFF y no por `/api/v1`: el token vive en una cookie que solo lee el proxy, y
 * un `<a>` contra la API devolvería `401`. `origenDeArchivo()` hace esa traducción y es la misma que
 * usan las otras dos pantallas de archivos del panel, así que no hay una segunda regla que mantener.
 *
 * Un adjunto sin ruta descargable —la API no emitió `url`— se muestra igual, con su nombre y sin
 * botón: esconder la fila escondería que el archivo existe, que es peor que decir que hoy no se
 * puede bajar.
 */
function TarjetaDeAdjunto ({ adjunto, proyecto }: { adjunto: AdjuntoActa, proyecto: string }): ReactElement {
  const origen = origenDeArchivo({
    // El contrato del contacto no publica el nombre en disco, y este de acá no lo usa para nada
    // más que satisfacer la forma: quien nombra el archivo es `name`, que viaja en los dos.
    file_name: adjunto.file_name ?? adjunto.name,
    original_file_name: adjunto.name,
    subject: null,
    url: adjunto.url
  })
  const ruta = origen.tipo === 'descargable' ? origen.ruta : null
  const esImagen = seVeComoImagen(adjunto.filetype, adjunto.name)

  return (
    <figure className="border-linea bg-superficie-elevada rounded-tarjeta flex h-full flex-col overflow-hidden border">
      <div className="bg-superficie-hundida flex h-40 items-center justify-center">
        {esImagen && ruta !== null
          ? (
            // `next/image` no sirve acá: optimiza pidiendo el binario desde el servidor de Next, y
            // esta ruta la autoriza una cookie del navegador. Mismo motivo que en `Avatar`.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ruta}
              alt={`Adjunto del Meeting Paper: ${adjunto.name}`}
              loading="lazy"
              className="max-h-full max-w-full object-contain"
            />
            )
          : <IconoDeAdjunto adjunto={adjunto} />}
      </div>

      <figcaption className="flex min-w-0 flex-1 flex-col gap-2 p-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* `break-all`: un nombre sin espacios desborda la tarjeta a 400 px. */}
          <span className="text-texto text-sm font-medium break-all">{adjunto.name}</span>
          {proyecto !== '' && (
            <span className="text-texto-tenue text-xs break-words">
              {nombrar('espacio')}: {proyecto}
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          <span className="text-texto-sutil text-xs">{formatoPeso(adjunto.size)}</span>

          {ruta === null
            ? <span className="text-texto-sutil text-xs">Sin archivo para descargar</span>
            : (
              <a
                href={ruta}
                download={adjunto.name}
                className="text-texto-tenue hover:bg-hover hover:text-acento rounded-control border-linea inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold"
              >
                <Download className="size-3.5" aria-hidden="true" />
                Descargar
                <span className="sr-only"> {adjunto.name}</span>
              </a>
              )}
        </div>
      </figcaption>
    </figure>
  )
}

/**
 * Lo que se dibuja cuando no hay miniatura: un audio, un PDF o un `.heic`.
 *
 * El `.heic` es el caso que obliga a distinguir entre "es una imagen" y "el navegador la pinta":
 * se acepta al subir porque es lo que sale de un iPhone sin convertir, pero ningún navegador de
 * escritorio la dibuja, y una miniatura rota se lee como un archivo corrupto. Ver `seVeComoImagen`.
 */
function IconoDeAdjunto ({ adjunto }: { adjunto: AdjuntoActa }): ReactElement {
  const esAudio = adjunto.filetype.startsWith('audio/')
  const Icono = esAudio ? FileAudio : FileText

  return (
    <div className="text-texto-sutil flex flex-col items-center gap-1.5">
      <Icono className="size-8" aria-hidden="true" />
      <span className="text-xs">{esAudio ? 'Audio de la reunión' : 'Documento'}</span>
    </div>
  )
}
