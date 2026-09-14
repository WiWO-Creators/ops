'use client'

import dynamic from 'next/dynamic'
import { useRef, useState, type ReactElement } from 'react'
import { Download, FileAudio, FileText } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoHtml } from '@/componentes/presentadores/ContenidoHtml'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { bloquesDeHtml } from '@/dominio/acta-bloques'
import { TEMAS, temaDeMarca, type CodigoDeMarca } from '@/dominio/marcas-acta'
import type { MetaDelActa } from '@/dominio/exportar-acta'
import { origenDeArchivo } from '@/definiciones/archivos'
import { formatoPeso, seVeComoImagen } from '@/dominio/actas'
import { nombrar } from '@/dominio/glosario'
import type { Acta, AdjuntoActa } from '@/datos/recursos'

/**
 * Un Meeting Paper: se lee, se corrige y se imprime.
 *
 * === LAS ACCIONES TIENEN PESOS DISTINTOS PORQUE NO VALEN LO MISMO ===
 *
 * Eran seis botones en fila —Volver, Corregir, Guardar, Descartar, Imprimir, Eliminar— todos del
 * mismo tamaño y del mismo tono, así que encontrar el que se quería costaba leerlos los seis. Ahora
 * el regreso es navegación y va solo arriba; de las acciones del acta queda a la vista la probable
 * como primaria —Corregir leyendo, Guardar editando—, su acompañante como secundaria, y Eliminar
 * vive en el menú de `⋯`: es destructiva y rarísima, y un botón rojo permanente en la cabecera de
 * algo que se abre para leer es ruido con riesgo.
 *
 * `Imprimir` ya no se dibuja deshabilitada mientras se corrige: un control apagado que aparece solo
 * para decir que no se puede usar ocupa el mismo lugar que uno que sí.
 *
 * El editor se carga con `next/dynamic` y `ssr: false`. Son ~100 KB de TipTap, y sin esto entran en
 * el chunk de `/espacios/[id]` —la pantalla más usada del panel— aunque nadie abra un acta. Con la
 * carga diferida, el peso lo paga quien pulsa "Corregir".
 *
 * En lectura el HTML se pinta dentro de `ContenidoHtml`, el iframe sin `allow-scripts`. Lo escribió un
 * modelo a partir de lo que se dijo en una reunión, así que es contenido que no controlamos aunque
 * la API ya lo haya saneado: las dos capas son a propósito.
 *
 * Imprimir usa el `print()` del propio iframe, que sale con el formato real del documento. Es un PDF
 * decente y cero dependencias, contra el `jsPDF` de MeetingMatico, que vuelca texto plano y pierde
 * todo el formato. Para que el padre pueda llamarlo, el visor va con `imprimible`: ver
 * `ContenidoHtml`, que explica por que esos dos permisos no dejan correr una linea de codigo ajeno.
 */

const EditorDeActa = dynamic(
  async () => (await import('./EditorDeActa')).EditorDeActa,
  { ssr: false, loading: () => <p className="text-texto-tenue text-sm">Cargando el editor…</p> }
)

interface PropsDetalle {
  acta: Acta
  proyectoId: number
  /** Editar lo puede cualquier miembro; borrar, solo el autor o quien administra. */
  puedeBorrar: boolean
  conIa: boolean
  onCambiada: (acta: Acta) => void
  onBorrada: () => void
  onVolver: () => void
}

export function DetalleActa ({
  acta,
  proyectoId,
  puedeBorrar,
  conIa,
  onCambiada,
  onBorrada,
  onVolver
}: PropsDetalle): ReactElement {
  const [editando, setEditando] = useState(false)
  const [html, setHtml] = useState(acta.content ?? '')
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportando, setExportando] = useState<'pdf' | 'docx' | null>(null)
  const [cambiandoMarca, setCambiandoMarca] = useState(false)
  const marco = useRef<HTMLIFrameElement>(null)

  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    const resultado = await escribirEnBff<Acta>(
      `projects/${proyectoId}/actas/${acta.id}`,
      'PATCH',
      { content: html }
    )

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setSucio(false)
    setEditando(false)
    onCambiada(resultado.datos)
  }

  /**
   * Cambia la marca que firma el acta.
   *
   * Se puede cambiar después de creada porque el acta se escribe antes de saber quién la firma:
   * una reunión que empezó siendo de WiWO termina facturándose por MGC, y hasta ahora eso obligaba
   * a rehacer el documento entero. La API ya aceptaba `brand` en la edición; lo que faltaba era
   * poder decirlo desde acá.
   */
  async function cambiarMarca (codigo: CodigoDeMarca): Promise<void> {
    if (codigo === acta.brand) return

    setCambiandoMarca(true)
    setError(null)

    const resultado = await escribirEnBff<Acta>(
      `projects/${proyectoId}/actas/${acta.id}`,
      'PATCH',
      { brand: codigo }
    )

    setCambiandoMarca(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    onCambiada(resultado.datos)
  }

  /**
   * Baja el acta como PDF o como Word.
   *
   * Los dos generadores se cargan al pulsar y no con la pantalla: entre `pdfmake` y `docx` son
   * cientos de kilobytes que nadie necesita para leer un acta, y esta pantalla vive dentro de la
   * más usada del panel.
   */
  async function exportar (formato: 'pdf' | 'docx'): Promise<void> {
    setExportando(formato)
    setError(null)

    try {
      const bloques = bloquesDeHtml(acta.content ?? '')
      const tema = temaDeMarca(acta.brand)
      const meta: MetaDelActa = {
        titulo: acta.title,
        cliente: acta.client,
        fecha: acta.meeting_date,
        lugar: acta.place,
        autor: acta.author?.full_name ?? ''
      }

      if (formato === 'pdf') {
        const { descargarPdf } = await import('@/dominio/exportar-pdf')
        await descargarPdf(bloques, tema, meta)
      } else {
        const { descargarDocx } = await import('@/dominio/exportar-docx')
        await descargarDocx(bloques, tema, meta)
      }
    } catch {
      // El motivo real —una fuente que no bajó, memoria, un HTML raro— no le dice nada a nadie acá;
      // lo que importa es que el botón no se quede girando y que quede el camino de siempre.
      setError('No se pudo generar el archivo. Prueba con Imprimir, que usa el motor del navegador.')
    } finally {
      setExportando(null)
    }
  }

  async function borrar (): Promise<void> {
    setBorrando(true)

    const resultado = await escribirEnBff(`projects/${proyectoId}/actas/${acta.id}`, 'DELETE')

    setBorrando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    onBorrada()
  }

  /** Salir sin guardar pierde las correcciones, así que se pregunta antes. */
  function volver (): void {
    if (sucio && !confirm('Tienes cambios sin guardar en este Meeting Paper. ¿Salir igual?')) return

    onVolver()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* El regreso va solo y arriba de todo: es navegación, no una de las acciones del acta, y
          mezclado con ellas competía por la misma mirada. */}
      <Boton variante="sutil" tamano="chico" onClick={volver} className="-ml-3 self-start">
        ← Volver a los Meeting Papers
      </Boton>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <header className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-texto text-lg font-semibold">{acta.title}</h2>
            {acta.source === 'ia' && (
              <Insignia tono="acento" tamano="chico">Escrito con IA</Insignia>
            )}
          </div>
          <p className="text-texto-tenue text-sm">
            {acta.client === '' ? 'Sin cliente' : acta.client}
            {acta.meeting_date !== null && <> · <Fecha valor={acta.meeting_date} /></>}
            {acta.author !== null && <> · {acta.author.full_name}</>}
          </p>
          {acta.attendees.length > 0 && (
            <p className="text-texto-sutil text-xs">Asistentes: {acta.attendees.join(', ')}</p>
          )}

          {/* El estilo se cambia desde acá y no desde el formulario de creación porque el acta se
              escribe antes de saber quién la firma: una reunión que arrancó siendo de WiWO puede
              terminar facturándose por MGC, y rehacer el documento por eso no tiene sentido. */}
          {!editando && (
            <MenuContextual>
              <DisparadorMenu asChild>
                <Boton variante="sutil" tamano="chico" cargando={cambiandoMarca} className="-ml-3 self-start">
                  Estilo: {temaDeMarca(acta.brand).nombre}
                </Boton>
              </DisparadorMenu>
              <ContenidoMenu align="start">
                {Object.values(TEMAS).map((tema) => (
                  <ItemMenu key={tema.codigo} onSelect={() => { void cambiarMarca(tema.codigo) }}>
                    {tema.nombre}{tema.codigo === acta.brand ? ' ·' : ''}
                  </ItemMenu>
                ))}
              </ContenidoMenu>
            </MenuContextual>
          )}
        </header>

        {/* Una acción probable con peso de primaria, una de apoyo y lo destructivo guardado. Las seis
            en fila y con el mismo peso obligaban a leerlas todas para encontrar la que se quería. */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {editando
            ? (
              <>
                <Boton
                  variante="sutil"
                  tamano="chico"
                  onClick={() => {
                    setHtml(acta.content ?? '')
                    setSucio(false)
                    setEditando(false)
                  }}
                >
                  Descartar cambios
                </Boton>
                <Boton variante="primario" tamano="chico" cargando={guardando} onClick={() => { void guardar() }}>
                  Guardar
                </Boton>
              </>
              )
            : (
              <>
                {/* Los tres caminos de salida en un solo control: bajar el archivo es lo que se pide
                    casi siempre, e imprimir queda para quien quiere el diálogo del navegador. */}
                <MenuContextual>
                  <DisparadorMenu asChild>
                    <Boton variante="secundario" tamano="chico" cargando={exportando !== null}>
                      <Download size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                      Exportar
                    </Boton>
                  </DisparadorMenu>
                  <ContenidoMenu align="end">
                    <ItemMenu onSelect={() => { void exportar('pdf') }}>Descargar PDF</ItemMenu>
                    <ItemMenu onSelect={() => { void exportar('docx') }}>Descargar Word (.docx)</ItemMenu>
                    <ItemMenu onSelect={() => { marco.current?.contentWindow?.print() }}>Imprimir</ItemMenu>
                  </ContenidoMenu>
                </MenuContextual>
                <Boton variante="primario" tamano="chico" onClick={() => { setEditando(true) }}>
                  Corregir
                </Boton>
              </>
              )}

          {puedeBorrar && (
            <MenuContextual>
              <DisparadorMenu asChild>
                <Boton variante="sutil" tamano="chico" soloIcono aria-label="Más acciones del Meeting Paper">
                  <span aria-hidden="true">⋯</span>
                </Boton>
              </DisparadorMenu>
              <ContenidoMenu align="end">
                <ItemMenu peligroso onSelect={() => { setConfirmando(true) }}>Eliminar</ItemMenu>
              </ContenidoMenu>
            </MenuContextual>
          )}
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="bg-superficie-peligro text-texto-peligro rounded-chico px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {editando
        ? (
          <EditorDeActa
            htmlInicial={acta.content ?? ''}
            proyectoId={proyectoId}
            conIa={conIa}
            marca={acta.brand}
            onCambio={(siguiente) => {
              setHtml(siguiente)
              setSucio(true)
            }}
          />
          )
        : (
          <ContenidoHtml
            ref={marco}
            html={acta.content ?? ''}
            titulo={`Meeting Paper: ${acta.title}`}
            marca={acta.brand}
            // Sin esto "Imprimir" lanza `SecurityError` y no imprime: con el origen opaco del
            // `sandbox` vacio el padre no puede ni leer `contentWindow.print`.
            imprimible
            // Mas alto que el de un contrato del portal: un acta se lee entera de corrido, y
            // desplazar dentro de un iframe cada dos temas rompe la lectura.
            alto="h-[46rem]"
          />
          )}

      <AdjuntosDelActa acta={acta} />

      <Dialogo open={confirmando} onOpenChange={setConfirmando}>
        <ContenidoDialogo
          titulo="Eliminar Meeting Paper"
          descripcion={`"${acta.title}" deja de estar disponible para el equipo.`}
          ancho="chico"
        >
          <div className="flex justify-end gap-2">
            <Boton variante="sutil" onClick={() => { setConfirmando(false) }}>Cancelar</Boton>
            <Boton variante="peligro" cargando={borrando} onClick={() => { void borrar() }}>Eliminar</Boton>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </div>
  )
}

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
function AdjuntosDelActa ({ acta }: { acta: Acta }): ReactElement | null {
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
    file_name: adjunto.file_name,
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
