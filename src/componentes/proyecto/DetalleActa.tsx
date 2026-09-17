'use client'

import dynamic from 'next/dynamic'
import { useRef, useState, type ReactElement } from 'react'
import { Download, FileAudio, FileText, Languages } from 'lucide-react'
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
import { escribirEnBff, leerDelBff } from '@/componentes/datos/mutaciones'
import { bloquesDeHtml } from '@/dominio/acta-bloques'
import { conId, conIdioma, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'
import { TEMAS, temaDeMarca, type CodigoDeMarca } from '@/dominio/marcas-acta'
import { IDIOMAS, IDIOMAS_EN_ORDEN, type CodigoDeIdioma } from '@/dominio/idiomas-acta'
import type { MetaDelActa } from '@/dominio/exportar-acta'
import { origenDeArchivo } from '@/definiciones/archivos'
import { cuerpoDelActa, formatoPeso, seVeComoImagen } from '@/dominio/actas'
import { nombrar } from '@/dominio/glosario'
import type { Acta, AdjuntoActa, TraduccionActa } from '@/datos/recursos'

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
 * el chunk de `/proyectos/[id]` —la pantalla más usada del panel— aunque nadie abra un acta. Con la
 * carga diferida, el peso lo paga quien pulsa "Corregir".
 *
 * En lectura el HTML se pinta dentro de `ContenidoHtml`, el iframe sin `allow-scripts`. Lo escribió un
 * modelo a partir de lo que se dijo en una reunión, así que es contenido que no controlamos aunque
 * la API ya lo haya saneado: las dos capas son a propósito.
 *
 * === EL CLIENTE LEE LA MISMA PANTALLA ===
 *
 * Montado con `puedeEditar={false}` y `puedeBorrar={false}` —que es como lo monta el portal— quedan
 * el documento, sus datos y sus adjuntos, y se van Corregir, Eliminar y el selector de estilo. No hay
 * ninguna rama por sujeto: las tres son escrituras y las tres cuelgan de una capacidad. Las rutas de
 * esas escrituras tampoco se escriben acá, salen de `fuente`, asi que el mismo componente vale para
 * los dos contratos.
 *
 * Exportar e Imprimir se quedan en los dos. No escriben nada: arman el archivo en el navegador con
 * el HTML que la API ya mando, y quitarselos al cliente seria esconderle una copia de lo que esta
 * leyendo.
 *
 * Imprimir usa el `print()` del propio iframe, que sale con el formato real del documento. Es un PDF
 * decente y cero dependencias, contra el `jsPDF` de MeetingMatico, que vuelca texto plano y pierde
 * todo el formato. Para que el padre pueda llamarlo, el visor va con `imprimible`: ver
 * `ContenidoHtml`, que explica por que esos dos permisos no dejan correr una linea de codigo ajeno.
 *
 * === EL IDIOMA ES UN EJE MAS DEL DOCUMENTO, NO UNA OPCION DE LA DESCARGA ===
 *
 * El selector cambia lo que se ve en el visor, no solo lo que baja. Es a proposito y contra la
 * alternativa obvia —un "descargar en ingles" dentro del menu de Exportar—: si el idioma solo
 * existiera al exportar, nadie leeria la traduccion antes de mandarsela a un cliente, y lo que un
 * modelo escribio en chino sin que lo mirara nadie no es un documento que la empresa pueda firmar.
 * Viendola en pantalla se puede corregir con el mismo boton de siempre.
 *
 * Las tres salidas —PDF, Word e Imprimir— toman lo que se esta viendo. No hay forma de estar
 * leyendo el acta en chino y bajar el PDF en español por accidente.
 *
 * === QUIEN TRADUCE Y QUIEN SOLO LEE ===
 *
 * Elegir un idioma que YA existe es lectura y lo hace cualquiera, el cliente incluido: la traduccion
 * viaja por la ruta del Espacio y no por `/ia/*`, asi que sigue ahi con el kill-switch apagado.
 * PEDIR una traduccion nueva gasta, asi que exige `puedeEditar` y `conIa`, las dos condiciones que
 * ya gobiernan el resto de la IA en esta pantalla. Al cliente, un idioma que nadie pidio ni le
 * aparece.
 */

const EditorDeActa = dynamic(
  async () => (await import('./EditorDeActa')).EditorDeActa,
  { ssr: false, loading: () => <p className="text-texto-tenue text-sm">Cargando el editor…</p> }
)

/** El idioma en el que se esta leyendo el acta, junto a lo que ya se trajo de la API. */
interface EstadoDeIdioma {
  /** A que acta pertenece. Cambia el acta, el idioma vuelve al original: ver donde se usa. */
  actaId: number
  codigo: CodigoDeIdioma
  /** Las traducciones ya traidas en esta visita, por codigo. El español nunca esta: es `content`. */
  traducciones: Partial<Record<CodigoDeIdioma, TraduccionActa>>
  /** Si hay una lectura o una traduccion en vuelo, para el girador del selector. */
  cargando: boolean
}

interface PropsDetalle {
  acta: Acta
  /**
   * El Proyecto del que cuelga, para el editor.
   *
   * No se usa para armar rutas —de eso se ocupa `fuente`—: lo pide `EditorDeActa` para reescribir un
   * fragmento con IA, que es una ruta de `/ia/*` y no del Proyecto.
   */
  proyectoId: number
  /** De donde baja y a donde se escribe este acta. Ver `dominio/fuente-proyecto.ts`. */
  fuente: FuenteDeProyecto
  /** Corregir el texto y cambiar la marca. Cualquier miembro del equipo; el cliente, nunca. */
  puedeEditar?: boolean
  /** Eliminar. Solo el autor o quien administra, y la API lo vuelve a exigir igual. */
  puedeBorrar?: boolean
  /** Si la capa de IA responde. Solo decide lo que ofrece el editor, que ya exige `puedeEditar`. */
  conIa?: boolean
  onCambiada: (acta: Acta) => void
  onBorrada: () => void
  onVolver: () => void
}

export function DetalleActa ({
  acta,
  proyectoId,
  fuente,
  puedeEditar = false,
  puedeBorrar = false,
  conIa = false,
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
  /**
   * Todo lo del idioma en un estado, junto al id del acta al que pertenece.
   *
   * Va atado al `actaId` porque el listado navega por `?acta=` sin desmontar este componente: al
   * pasar de un acta a otra, el idioma tiene que volver al original. Compararlo durante el render
   * —y no reponerlo desde un `useEffect`— es lo que evita el ciclo de renders en cascada que ese
   * efecto provocaba: acá no hay un segundo render, el valor correcto ya sale del primero.
   *
   * `traducciones` es memoria de la pantalla y no un cache de verdad: ir del inglés al español y de
   * vuelta al inglés no vuelve a pegarle a la API, pero recargar la página empieza de cero, que es
   * lo correcto porque otra persona pudo haberla corregido mientras tanto.
   */
  const [estadoIdioma, setEstadoIdioma] = useState<EstadoDeIdioma>(
    () => ({ actaId: acta.id, codigo: 'es', traducciones: {}, cargando: false })
  )
  const vigente: EstadoDeIdioma = estadoIdioma.actaId === acta.id
    ? estadoIdioma
    : { actaId: acta.id, codigo: 'es', traducciones: {}, cargando: false }
  const idioma = vigente.codigo
  const traducciones = vigente.traducciones
  const cambiandoIdioma = vigente.cargando

  /** Fija el idioma visible y su traduccion, siempre atados al acta que se esta mirando. */
  function fijarIdioma (codigo: CodigoDeIdioma, traduccion?: TraduccionActa): void {
    setEstadoIdioma({
      actaId: acta.id,
      codigo,
      traducciones: traduccion === undefined
        ? vigente.traducciones
        : { ...vigente.traducciones, [codigo]: traduccion },
      cargando: false
    })
  }

  /** Enciende o apaga el girador del selector sin tocar el idioma ni lo ya traido. */
  function marcarCargando (cargando: boolean): void {
    setEstadoIdioma({ ...vigente, cargando })
  }

  const marco = useRef<HTMLIFrameElement>(null)
  // Las tres escrituras del acta van a la misma ruta: se arma una vez para que no se puedan
  // desalinear, y sale de la fuente para que el sujeto no se escriba dentro del dibujo.
  const ruta = conId(fuente.acta, acta.id)
  const rutaTraducciones = conId(fuente.actaTraduccion, acta.id)

  const infoIdioma = IDIOMAS[idioma]
  const traduccionActiva = idioma === 'es' ? null : traducciones[idioma] ?? null
  /** El documento que se esta viendo: el original en español, o la traduccion elegida. */
  const htmlActivo = traduccionActiva?.content ?? acta.content ?? ''
  const tituloActivo = traduccionActiva?.title ?? acta.title
  /** Pedir una traduccion nueva gasta: mismas dos condiciones que el resto de la IA de la pantalla. */
  const puedeTraducir = puedeEditar && conIa
  const yaTraducidos = acta.translations ?? []

  /**
   * Guarda las correcciones sobre lo que se esta viendo: el acta original o la traduccion activa.
   *
   * Son dos rutas y no una con un parametro porque son dos recursos: corregir el acta cambia el
   * documento del que salen todas las traducciones, y corregir una traduccion cambia solo esa. Si
   * las dos escribieran en el mismo lugar, arreglar una palabra del ingles pisaria el español.
   *
   * La traduccion corregida NO se vuelve a traducir: lo que se guarda es lo que la persona escribio.
   */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    if (traduccionActiva !== null) {
      const enIdioma = await escribirEnBff<TraduccionActa>(
        conIdioma(rutaTraducciones, idioma), 'PATCH', { content: html }
      )

      setGuardando(false)

      if (!enIdioma.ok) {
        setError(enIdioma.mensaje)

        return
      }

      fijarIdioma(idioma, enIdioma.datos)
      setSucio(false)
      setEditando(false)

      return
    }

    const resultado = await escribirEnBff<Acta>(ruta, 'PATCH', { content: html })

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
   * Cambia el idioma en el que se lee el acta, pidiendola si hace falta.
   *
   * Tres caminos, en este orden: el español no se pide —es `acta.content`—; un idioma ya traducido
   * se lee de la ruta del Espacio, que responde con la IA apagada; y uno que no existe todavia se le
   * pide al modelo, lo que exige `puedeTraducir` y tarda.
   *
   * Que exista se decide con `acta.translations` y no probando el GET a ver si da 404: el 404 es la
   * respuesta correcta a "no esta traducida", pero gastarlo para averiguar algo que la ficha ya dijo
   * deja un error en la consola del navegador cada vez que alguien abre el selector.
   */
  async function elegirIdioma (codigo: CodigoDeIdioma): Promise<void> {
    if (codigo === idioma) return

    setError(null)

    if (codigo === 'es' || traducciones[codigo] !== undefined) {
      fijarIdioma(codigo)

      return
    }

    if (!yaTraducidos.includes(codigo)) {
      if (!puedeTraducir) {
        setError(`Este Meeting Paper todavía no está traducido al ${IDIOMAS[codigo].nombre.toLowerCase()}.`)

        return
      }

      await traducir(codigo)

      return
    }

    marcarCargando(true)

    const resultado = await leerDelBff<TraduccionActa>(conIdioma(rutaTraducciones, codigo))

    if (!resultado.ok) {
      marcarCargando(false)
      setError(resultado.mensaje)

      return
    }

    fijarIdioma(codigo, resultado.datos)
  }

  /**
   * Le pide al modelo el acta en otro idioma y la deja a la vista.
   *
   * Es la llamada mas cara de esta pantalla despues de generar el acta, y por eso la API guarda el
   * resultado: la segunda vez que alguien elija ese idioma sale de la base, no del modelo. Vuelve a
   * pedirla solo quien usa "Volver a traducir", que es el camino para descartar una mala.
   *
   * `onCambiada` con la lista de idiomas actualizada: sin eso, el selector seguiria creyendo que el
   * idioma no existe y la proxima eleccion volveria a pagar una traduccion.
   */
  async function traducir (codigo: CodigoDeIdioma): Promise<void> {
    marcarCargando(true)
    setError(null)

    const resultado = await escribirEnBff<TraduccionActa>(
      `ia/proyectos/${proyectoId}/acta-traducir`, 'POST', { acta_id: acta.id, idioma: codigo }
    )

    if (!resultado.ok) {
      marcarCargando(false)
      setError(resultado.mensaje)

      return
    }

    fijarIdioma(codigo, resultado.datos)
    onCambiada({
      ...acta,
      translations: yaTraducidos.includes(codigo) ? yaTraducidos : [...yaTraducidos, codigo].sort()
    })
  }

  /**
   * Descarta la traduccion que se esta viendo y la pide de nuevo.
   *
   * Se pregunta antes solo cuando alguien la corrigio a mano —`updated_by` deja de ser `null`—,
   * porque eso es lo unico que se pierde de verdad: volver a traducir lo que escribio el modelo no
   * pierde trabajo de nadie.
   */
  async function volverATraducir (): Promise<void> {
    if (traduccionActiva === null) return

    const corregida = traduccionActiva.updated_by !== null && traduccionActiva.updated_by !== undefined

    if (corregida && !confirm(
      'Alguien corrigió esta traducción a mano. Si la pides de nuevo, esas correcciones se pierden. ¿Seguir?'
    )) return

    await traducir(idioma)
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

    const resultado = await escribirEnBff<Acta>(ruta, 'PATCH', { brand: codigo })

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
      // Lo que se esta viendo, no el original: estar leyendo el acta en chino y bajar el PDF en
      // español seria el peor desenlace posible de esta pantalla.
      const bloques = bloquesDeHtml(cuerpoDelActa(htmlActivo))
      const tema = temaDeMarca(acta.brand)
      const meta: MetaDelActa = {
        titulo: tituloActivo,
        cliente: acta.client,
        fecha: acta.meeting_date,
        lugar: acta.place,
        autor: acta.author?.full_name ?? '',
        idioma: infoIdioma
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
      setError(infoIdioma.necesitaCjk
        ? 'No se pudo generar el archivo: la tipografía china no cargó. Prueba con Imprimir, que usa las fuentes del navegador.'
        : 'No se pudo generar el archivo. Prueba con Imprimir, que usa el motor del navegador.')
    } finally {
      setExportando(null)
    }
  }

  async function borrar (): Promise<void> {
    setBorrando(true)

    const resultado = await escribirEnBff(ruta, 'DELETE')

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
            <h2 className="text-texto text-lg font-semibold" lang={infoIdioma.etiquetaHtml}>
              {tituloActivo}
            </h2>
            {acta.source === 'ia' && (
              <Insignia tono="acento" tamano="chico">Escrito con IA</Insignia>
            )}
            {/* Solo cuando NO es el original: una insignia "Español" en todas las actas de siempre
                seria ruido en la pantalla mas leida del panel. La que se ve dice que lo que hay
                debajo no es lo que el equipo escribio, que es justo lo que hay que saber. */}
            {traduccionActiva !== null && (
              <Insignia tono="neutro" tamano="chico">
                Traducido · {infoIdioma.propio}
              </Insignia>
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
          <div className="-ml-3 flex flex-wrap items-center gap-1">
            {puedeEditar && !editando && (
              <MenuContextual>
                <DisparadorMenu asChild>
                  <Boton variante="sutil" tamano="chico" cargando={cambiandoMarca}>
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

            {/* El idioma NO cuelga de `puedeEditar`: leer el acta en el idioma del cliente es
                lectura, y el cliente monta esta misma pantalla. Lo que si cuelga de los permisos es
                cada opcion —ver `elegirIdioma`—: al cliente solo le aparecen los idiomas que alguien
                del equipo ya pidio.

                Se esconde mientras se corrige, igual que el estilo: cambiar de idioma con el editor
                abierto tiraria lo que se esta escribiendo. */}
            {!editando && (
              <MenuContextual>
                <DisparadorMenu asChild>
                  <Boton variante="sutil" tamano="chico" cargando={cambiandoIdioma}>
                    <Languages size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                    {infoIdioma.propio}
                  </Boton>
                </DisparadorMenu>
                <ContenidoMenu align="start">
                  {IDIOMAS_EN_ORDEN
                    // Un idioma que no existe y que este sujeto no puede pedir no se dibuja: una
                    // opcion que solo sirve para mostrar un error no es una opcion.
                    .filter((opcion) => (
                      opcion.esOriginal || puedeTraducir || yaTraducidos.includes(opcion.codigo)
                    ))
                    .map((opcion) => (
                      <ItemMenu key={opcion.codigo} onSelect={() => { void elegirIdioma(opcion.codigo) }}>
                        {opcion.nombre}
                        {opcion.esOriginal || yaTraducidos.includes(opcion.codigo)
                          ? ''
                          : ' — traducir'}
                        {opcion.codigo === idioma ? ' ·' : ''}
                      </ItemMenu>
                    ))}
                  {traduccionActiva !== null && puedeTraducir && (
                    <ItemMenu onSelect={() => { void volverATraducir() }}>
                      Volver a traducir al {infoIdioma.nombre.toLowerCase()}
                    </ItemMenu>
                  )}
                </ContenidoMenu>
              </MenuContextual>
            )}
          </div>
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
                    setHtml(htmlActivo)
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
                {puedeEditar && (
                  <Boton
                    variante="primario"
                    tamano="chico"
                    onClick={() => {
                      // El editor arranca con lo que se esta viendo. Sin esto, abrir "Corregir"
                      // sobre la traduccion al chino cargaria el español y guardarlo lo escribiria
                      // encima de la traduccion.
                      setHtml(htmlActivo)
                      setEditando(true)
                    }}
                  >
                    Corregir
                  </Boton>
                )}
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
            htmlInicial={htmlActivo}
            proyectoId={proyectoId}
            // La reescritura con IA del editor (`acta-transformar`) devuelve español: su prompt lo
            // fija. Ofrecerla sobre una traduccion terminaria metiendo un parrafo en español dentro
            // de un acta en chino, asi que sobre una traduccion el editor queda sin IA y con lo que
            // de verdad se necesita ahi, que es corregir a mano una palabra que el modelo erro.
            conIa={conIa && traduccionActiva === null}
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
            // `cuerpoDelActa` y no `acta.content` a secas: el documento arranca con el identificador
            // del proyecto y, cuando la reunion no lo dijo, el modelo escribe "#No especificado". Es
            // un hueco de su formulario, no un dato, y el cliente lo lee como encabezado del acta.
            html={cuerpoDelActa(htmlActivo)}
            titulo={`Meeting Paper: ${tituloActivo}`}
            marca={acta.brand}
            // Decide el corte de linea, la fuente del sistema para los glifos que la de marca no
            // tiene y la voz del lector de pantalla. Ver `ContenidoHtml`.
            idioma={infoIdioma.etiquetaHtml}
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
