'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoHtml } from '@/componentes/presentadores/ContenidoHtml'
import { conId, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'
import { cuerpoDelActa } from '@/dominio/actas'
import { GLOSARIO } from '@/dominio/glosario'
import { AccionesDelActa } from './acta/AccionesDelActa'
import { AdjuntosDelActa } from './acta/AdjuntosDelActa'
import { CabeceraDelActa } from './acta/CabeceraDelActa'
import { ComentariosDelActa } from './acta/ComentariosDelActa'
import { ConfirmacionDelActa } from './acta/ConfirmacionDelActa'
import { DialogoDeRenombre } from './acta/DialogoDeRenombre'
import { HistorialDelActa } from './acta/HistorialDelActa'
import { OriginalDelActa } from './acta/OriginalDelActa'
import { ReproduccionDelActa } from './acta/ReproduccionDelActa'
import { TareasPropuestas } from './acta/TareasPropuestas'
import { useReproduccionDelActa } from './acta/useReproduccionDelActa'
import { useComentariosEnElActa } from './acta/useComentariosEnElActa'
import { useEdicionDelActa } from './acta/useEdicionDelActa'
import { useEscriturasDelActa } from './acta/useEscriturasDelActa'
import { useExportacionDelActa } from './acta/useExportacionDelActa'
import { useHilosDelActa } from './acta/useHilosDelActa'
import { useIdiomaDelActa } from './acta/useIdiomaDelActa'
import type { Acta } from '@/datos/recursos'
import { EVENTO_ABRIR_ORBE } from '@/dominio/pantalla'
import { hayCambioAjeno, textoDeCambioAjeno } from '@/dominio/acta-concurrencia'
import { EVENTO_ORBE_ESCRITURA, escrituraAlcanzaAlActa } from '@/dominio/orbe-escritura'
import { useAviso } from '@/componentes/estado/useAviso'
import { useConfigEnVivo } from '@/componentes/en-vivo/ProveedorEnVivo'
import type { MotivoDeFin } from '@/componentes/en-vivo/useDocumentoColaborativo'
import { ESPERA_TRAS_CERRAR_MS } from '@/dominio/acta-colaborativa'
import type { Yo } from '@/datos/tipos'

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
 * Renombrar acompaña a Eliminar en ese mismo `⋯` y por el motivo de al lado: el título lo escribe el
 * modelo y casi siempre queda bien, así que corregirlo es raro, y el `h2` que lo muestra es el
 * encabezado del documento —también para el cliente, que no puede tocarlo—. Ver `DialogoDeRenombre`.
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
 *
 * === LO QUE LA REUNION ACORDO VA DEBAJO DEL DOCUMENTO ===
 *
 * `TareasPropuestas` es lo que el modelo leyo como compromisos dentro del acta, todavia sin crear.
 * Va despues del visor y antes de los adjuntos, por el mismo motivo que los adjuntos van abajo: el
 * acta es lo que se viene a leer, y las tareas son lo que se hace DESPUES de haberla leido.
 *
 * Su permiso no es ninguno de los dos de esta pantalla: lo que produce son Procesos, asi que cuelga
 * de `puedeCrearTareas`, y su ruta sale de `fuente` como todo lo demas. Con la ruta en `null` —el
 * portal— la seccion ni se monta.
 *
 * === EL ACTA PUEDE CAMBIAR MIENTRAS SE LEE O SE CORRIGE ===
 *
 * El Orbe edita Meeting Papers desde el chat, y otra persona tambien puede hacerlo. Cuando el Orbe
 * termina una escritura avisa a la ventana (`EVENTO_ORBE_ESCRITURA`) y este componente le pide a
 * quien lo monta que revalide el acta, sin pasar por «cargando». Leyendo, la pantalla se actualiza
 * sola. Corrigiendo, el editor NO se toca —lleva lo escrito y su propia copia del documento— y se
 * avisa con la accion de recargar. El guardado manda la version con la que se abrio el editor
 * (`revision`): si el acta cambio entremedio, la API contesta 409 y no se pisa nada.
 *
 * === LA EDICION DEL ORBE SE VE, NO SOLO SE APLICA ===
 *
 * Leyendo, cuando el Orbe termina de editar el acta abierta, el cuerpo nuevo no reemplaza al viejo de
 * golpe: se reproduce la edicion sobre el visor con un cursor que lleva su nombre (ver
 * `useReproduccionDelActa` y `ReproduccionDelActa`). Con el editor abierto no se anima nada: ahi
 * manda el aviso de cambio ajeno de arriba.
 *
 * === EDICION CONJUNTA ===
 *
 * Con «Ops en vivo» encendido para actas (`useConfigEnVivo().actas`), una persona del equipo y el
 * acta original (no una traducción), «Corregir» abre `EdicionConjuntaDelActa` en vez del editor de
 * siempre: varias personas escriben a la vez y el servicio guarda solo, así que no hay Guardar ni
 * Descartar sino «Cerrar edición». Si la conexión no abre o no vuelve, se sigue con el editor de
 * siempre con lo último que se vio. Con la opción apagada, nada de esto existe.
 *
 * === COMENTARIOS EN LINEA ===
 *
 * Con `useConfigEnVivo().comentarios` encendido, una persona que puede corregir y el acta original,
 * aparece «Comentarios» (`ComentariosDelActa`, un panel lateral de hilos) y los dos editores ofrecen
 * «Comentar» sobre una selección. Funciona igual en la edición conjunta y en la de siempre: el hilo
 * vive en el board y se ata al texto por una marca (`span[data-hilo]`) que es parte del propio
 * contenido del acta. Sin la opción, no se pide ni se dibuja nada.
 */

const EditorDeActa = dynamic(
  async () => (await import('./EditorDeActa')).EditorDeActa,
  { ssr: false, loading: () => <p className="text-texto-tenue text-sm">Cargando el editor…</p> }
)

// Carga aparte por lo mismo, y con más razón: trae Yjs y el cliente del servicio de edición conjunta.
const EdicionConjuntaDelActa = dynamic(
  async () => (await import('./acta/EdicionConjuntaDelActa')).EdicionConjuntaDelActa,
  { ssr: false, loading: () => <p className="text-texto-tenue text-sm">Cargando el editor…</p> }
)

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
  /** Marcar o quitar «privado». Solo superadmins; con el acta privada, el resto del equipo ni la ve. */
  puedeMarcarPrivada?: boolean
  /** Si la capa de IA responde. Decide lo que ofrece el editor y si se puede volver a proponer tareas. */
  conIa?: boolean
  /**
   * Crear Procesos desde las tareas propuestas. Es la capacidad `create` sobre Tareas, que no es la
   * misma que `puedeEditar`: se puede corregir un acta sin poder crear trabajo en el Espacio.
   */
  puedeCrearTareas?: boolean
  /** El acta se acaba de generar: sus tareas propuestas se abren y se traen a la vista. */
  destacarTareas?: boolean
  /** Quien mira es superadmin: ve el original de la reunión. La API lo vuelve a exigir con un 403. */
  esSuperadmin?: boolean
  /**
   * Quien mira: sin esto no hay edición conjunta, porque su cursor necesita nombre y color.
   * `is_admin` (si viene) decide si el panel de comentarios ofrece borrar los ajenos.
   */
  yo?: Pick<Yo, 'id' | 'full_name' | 'profile_image_url'> & Partial<Pick<Yo, 'is_admin'>>
  /** Vuelve a pedir el acta en silencio (ver `useRecurso.revalidar`): el Orbe u otra persona la cambió. */
  onRevalidar: () => void
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
  puedeMarcarPrivada = false,
  conIa = false,
  puedeCrearTareas = false,
  destacarTareas = false,
  esSuperadmin = false,
  yo,
  onRevalidar,
  onCambiada,
  onBorrada,
  onVolver
}: PropsDetalle): ReactElement {
  const [confirmando, setConfirmando] = useState(false)
  const [confirmandoSalida, setConfirmandoSalida] = useState(false)
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)
  const [renombrando, setRenombrando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** La API rechazó el último guardado con 409: el acta cambió desde que se abrió el editor. */
  const [conflicto, setConflicto] = useState(false)
  /** Se está corrigiendo en conjunto (sin Guardar: guarda el servicio). Excluye a `edicion.editando`. */
  const [conjunta, setConjunta] = useState(false)
  const revalidacionTrasCerrar = useRef<number | null>(null)
  const aviso = useAviso()
  const enVivo = useConfigEnVivo()

  const marco = useRef<HTMLIFrameElement>(null)
  // Las tres escrituras del acta van a la misma ruta: se arma una vez para que no se puedan
  // desalinear, y sale de la fuente para que el sujeto no se escriba dentro del dibujo.
  const ruta = conId(fuente.acta, acta.id)
  /** Pedir una traduccion nueva gasta: mismas dos condiciones que el resto de la IA de la pantalla. */
  const puedeTraducir = puedeEditar && conIa

  const lectura = useIdiomaDelActa({
    acta,
    proyectoId,
    ruta,
    rutaTraducciones: conId(fuente.actaTraduccion, acta.id),
    puedeTraducir,
    onCambiada,
    onConflicto: () => {
      setConflicto(true)
      aviso.advertencia(`No se guardó: el ${GLOSARIO.acta.singular} cambió mientras lo corregías.`)
    },
    setError
  })
  const { idioma, infoIdioma, traduccionActiva, htmlActivo, tituloActivo } = lectura
  const edicion = useEdicionDelActa({
    htmlActivo,
    revisionActual: acta.date_updated ?? null,
    escribirEnLoVisible: lectura.escribirEnLoVisible,
    setError
  })
  const cambioAjeno = hayCambioAjeno({
    editando: edicion.editando,
    esTraduccion: traduccionActiva !== null,
    conflicto,
    revisionBase: edicion.revisionBase,
    revisionActual: acta.date_updated ?? null
  })

  // El Orbe terminó una escritura: se revalida el acta. Con el editor abierto igual se pide —así se
  // detecta el cambio—, pero el editor lleva su propia copia (`htmlBase`) y no se reemplaza.
  useEffect(() => {
    const alEscribirElOrbe = (evento: Event): void => {
      if (escrituraAlcanzaAlActa((evento as CustomEvent<unknown>).detail, acta.id)) onRevalidar()
    }

    window.addEventListener(EVENTO_ORBE_ESCRITURA, alEscribirElOrbe)

    return () => { window.removeEventListener(EVENTO_ORBE_ESCRITURA, alEscribirElOrbe) }
  }, [acta.id, onRevalidar])
  const escrituras = useEscriturasDelActa({
    acta,
    ruta,
    escribirEnLoVisible: lectura.escribirEnLoVisible,
    onCambiada,
    onBorrada,
    setError
  })
  const { exportando, exportar } = useExportacionDelActa({ acta, htmlActivo, tituloActivo, infoIdioma, setError })
  // `cuerpoDelActa` y no `acta.content` a secas: el documento arranca con el identificador del
  // proyecto y, cuando la reunion no lo dijo, el modelo escribe "#No especificado". Es un hueco de su
  // formulario, no un dato, y el cliente lo lee como encabezado del acta.
  const cuerpo = cuerpoDelActa(htmlActivo)
  /** Hay un editor abierto, del tipo que sea. */
  const corrigiendo = edicion.editando || conjunta
  /** «Corregir» abre la edición conjunta: solo el original (las traducciones siguen el flujo de siempre). */
  const corrigeEnConjunto = enVivo.actas && puedeEditar && traduccionActiva === null && yo !== undefined
  const reproduccion = useReproduccionDelActa({ actaId: acta.id, html: cuerpo, vista: idioma, editando: corrigiendo })
  /** Los comentarios en línea cuelgan del texto original: una traducción es otro documento. */
  const conComentarios = enVivo.comentarios && puedeEditar && traduccionActiva === null
  const hilos = useHilosDelActa({ ruta, actaId: acta.id, activo: conComentarios })
  const comentarios = useComentariosEnElActa(conComentarios)
  const hilosSinResolver = hilos.fase === 'listo' ? hilos.hilos.filter((hilo) => !hilo.resolved).length : null

  // La revalidación pendiente tras cerrar la edición no sobrevive a la pantalla.
  useEffect(() => () => {
    if (revalidacionTrasCerrar.current !== null) window.clearTimeout(revalidacionTrasCerrar.current)
  }, [])

  /**
   * Renombrar se esconde mientras se corrige, igual que el estilo y el idioma.
   *
   * No es que el renombre pise lo que se escribe —son dos campos distintos y dos peticiones
   * distintas—: es que el editor abierto tiene sus propias dos acciones, Guardar y Descartar, y
   * meter una tercera escritura del mismo documento entre medio es la forma de guardar una y creer
   * que se guardaron las dos.
   */
  const puedeRenombrar = puedeEditar && !corrigiendo

  /**
   * Abre el editor sobre la versión que se está viendo; un conflicto anterior ya no aplica. Con la
   * edición conjunta disponible abre esa; si no, el editor de siempre.
   */
  function corregir (): void {
    setConflicto(false)

    if (corrigeEnConjunto) setConjunta(true)
    else edicion.corregir()
  }

  /**
   * Cierra la edición conjunta y trae el acta como quedó. El servicio guarda unos segundos después
   * de la última tecla, así que se vuelve a pedir una vez más pasado ese tiempo.
   */
  function cerrarConjunta (): void {
    setConjunta(false)
    onRevalidar()

    if (revalidacionTrasCerrar.current !== null) window.clearTimeout(revalidacionTrasCerrar.current)
    revalidacionTrasCerrar.current = window.setTimeout(onRevalidar, ESPERA_TRAS_CERRAR_MS)
  }

  /** La edición conjunta no se sostuvo: sigue el editor de siempre, con lo último que se vio. */
  function seguirSinConexion (ultimoHtml: string | null, ultimaRevision: string | null, motivo: MotivoDeFin | null): void {
    setConjunta(false)
    edicion.continuarSinConexion(ultimoHtml, ultimaRevision)

    if (motivo === 'cambios_sin_enviar') {
      aviso.advertencia('Se cortó la conexión con lo último que escribiste. Tu texto sigue en el editor; guarda para no perderlo.')
    } else if (motivo === 'no_guardado') {
      aviso.advertencia('No se pudieron guardar los cambios de la edición conjunta. Tu texto sigue en el editor; guarda para no perderlo.')
    } else {
      aviso.info('No se pudo mantener la edición conjunta; sigues corrigiendo como siempre.')
    }

    onRevalidar()
  }

  /**
   * Cierra el editor y trae la versión nueva. Es la decisión explícita de la persona de dejar lo que
   * escribió: por eso el aviso lo dice y esto no pregunta de nuevo.
   */
  function recargarVersionNueva (): void {
    setConflicto(false)
    edicion.descartar()
    onRevalidar()
  }

  /** Descartar con correcciones sin guardar (incluidas las de la IA) pierde trabajo: se pregunta antes. */
  function descartar (): void {
    if (edicion.sucio) {
      setConfirmandoDescarte(true)

      return
    }

    edicion.descartar()
  }

  /** Salir sin guardar pierde las correcciones, así que se pregunta antes. */
  function volver (): void {
    if (edicion.sucio) {
      setConfirmandoSalida(true)

      return
    }

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
        <CabeceraDelActa
          acta={acta}
          tituloActivo={tituloActivo}
          infoIdioma={infoIdioma}
          idioma={idioma}
          esTraduccion={traduccionActiva !== null}
          yaTraducidos={lectura.yaTraducidos}
          editando={corrigiendo}
          puedeEditar={puedeEditar}
          puedeTraducir={puedeTraducir}
          puedeMarcarPrivada={puedeMarcarPrivada}
          cambiandoMarca={escrituras.cambiandoMarca}
          cambiandoPrivacidad={escrituras.cambiandoPrivacidad}
          cambiandoIdioma={lectura.cambiandoIdioma}
          onCambiarMarca={(codigo) => { void escrituras.cambiarMarca(codigo) }}
          onCambiarPrivacidad={() => { void escrituras.cambiarPrivacidad() }}
          onElegirIdioma={(codigo) => { void lectura.elegirIdioma(codigo) }}
          onVolverATraducir={lectura.volverATraducir}
        />

        <AccionesDelActa
          editando={edicion.editando}
          conjunta={conjunta}
          guardando={edicion.guardando}
          exportando={exportando}
          puedeEditar={puedeEditar}
          puedeRenombrar={puedeRenombrar}
          puedeBorrar={puedeBorrar && !conjunta}
          puedeVerHistorial={puedeEditar && traduccionActiva === null && !corrigiendo}
          onHistorial={() => { setVerHistorial(true) }}
          comentarios={conComentarios ? { abiertos: hilosSinResolver, onAbrir: comentarios.abrir } : undefined}
          puedePreguntar={conIa}
          onPreguntar={() => { window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_ORBE, { detail: { actaId: acta.id } })) }}
          onDescartar={descartar}
          onGuardar={() => { void edicion.guardar() }}
          onExportar={(formato) => { void exportar(formato) }}
          onImprimir={() => { marco.current?.contentWindow?.print() }}
          onCorregir={corregir}
          onRenombrar={() => { setRenombrando(true) }}
          onEliminar={() => { setConfirmando(true) }}
        />
      </div>

      {error !== null && !conflicto && (
        <AvisoEnLinea variante="error" mensaje={error} className="bg-superficie-peligro rounded-chico px-3 py-2 text-sm" />
      )}

      {cambioAjeno && (
        <div
          role="alert"
          className="border-texto-aviso/35 bg-superficie-aviso rounded-chico flex flex-col gap-2 border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-texto text-sm">{textoDeCambioAjeno(conflicto)}</p>
          <Boton variante="secundario" tamano="chico" onClick={recargarVersionNueva} className="shrink-0 self-start">
            Recargar
          </Boton>
        </div>
      )}

      {edicion.editando && conIa && traduccionActiva !== null && (
        <p className="text-texto-tenue text-xs">
          La reescritura con IA solo está disponible en el idioma original del acta.
        </p>
      )}

      {conjunta && yo !== undefined && (
        <EdicionConjuntaDelActa
          actaId={acta.id}
          proyectoId={proyectoId}
          marca={acta.brand}
          // Igual que en el editor de siempre: la IA solo trabaja sobre el idioma original.
          conIa={conIa && traduccionActiva === null}
          yo={yo}
          onGuardado={onRevalidar}
          onCerrar={cerrarConjunta}
          onSinConexion={seguirSinConexion}
          comentarios={comentarios.paraElEditor}
        />
      )}

      {!conjunta && (edicion.editando
        ? (
          <EditorDeActa
            // La copia con la que se abrió el editor, no `htmlActivo`: si el acta se recarga
            // mientras se corrige, el editor reemplaza su contenido cuando cambia `htmlInicial` y
            // se llevaría lo que la persona lleva escrito.
            htmlInicial={edicion.htmlBase}
            proyectoId={proyectoId}
            // La reescritura con IA del editor (`acta-transformar`) devuelve español: su prompt lo
            // fija. Ofrecerla sobre una traduccion terminaria metiendo un parrafo en español dentro
            // de un acta en chino, asi que sobre una traduccion el editor queda sin IA y con lo que
            // de verdad se necesita ahi, que es corregir a mano una palabra que el modelo erro.
            conIa={conIa && traduccionActiva === null}
            marca={acta.brand}
            actaId={acta.id}
            onReescrituraIa={edicion.marcarIa}
            onCambio={edicion.cambiar}
            comentarios={comentarios.paraElEditor}
          />
          )
        : (
          <div className="relative">
            <ContenidoHtml
              ref={marco}
              html={cuerpo}
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
            {reproduccion.guion !== null && (
              <ReproduccionDelActa
                guion={reproduccion.guion}
                marca={acta.brand}
                idioma={infoIdioma.etiquetaHtml}
                onTerminar={reproduccion.terminar}
              />
            )}
          </div>
          ))}

      {/* El resumen de lo que hizo el Orbe, para quien no ve la animación. El foco no se mueve. */}
      <p role="status" aria-live="polite" className="sr-only">{reproduccion.resumen}</p>

      {esSuperadmin && (
        <OriginalDelActa ruta={`${conId(fuente.acta, acta.id)}/fuente`} marca={acta.brand} />
      )}

      {fuente.actaTareas !== null && (
        <TareasPropuestas
          ruta={conId(fuente.actaTareas, acta.id)}
          rutaLookups={fuente.lookups}
          proyectoId={proyectoId}
          actaId={acta.id}
          puedeCrear={puedeCrearTareas}
          conIa={conIa}
          destacar={destacarTareas}
        />
      )}

      <AdjuntosDelActa acta={acta} />

      {/* Su contenido solo existe con el panel abierto: reabrirlo vuelve a pedir la lista y arranca
          sin filtro ni cambio elegido. Restaurar se oculta con el editor abierto, donde además el
          botón «Historial» ni se dibuja: restaurar pisaría lo que se está escribiendo. */}
      <HistorialDelActa
        abierto={verHistorial}
        ruta={ruta}
        revision={acta.date_updated}
        puedeRestaurar={puedeEditar && !corrigiendo}
        onRestaurada={(restaurada) => { onCambiada(restaurada); onRevalidar() }}
        onCambioAjeno={onRevalidar}
        onCerrar={() => { setVerHistorial(false) }}
      />

      {conComentarios && (
        <ComentariosDelActa
          ruta={ruta}
          hilos={hilos}
          estado={comentarios}
          html={cuerpo}
          esAdmin={yo?.is_admin === true}
          marcaSinGuardar={edicion.editando}
        />
      )}

      {renombrando && (
        <DialogoDeRenombre
          titulo={tituloActivo}
          esTraduccion={traduccionActiva !== null}
          onGuardar={escrituras.renombrar}
          onCerrar={() => { setRenombrando(false) }}
        />
      )}

      <ConfirmacionDelActa
        abierto={confirmando}
        onCambiar={setConfirmando}
        titulo="Eliminar Meeting Paper"
        descripcion={`"${acta.title}" deja de estar disponible para el equipo.`}
        etiquetaCancelar="Cancelar"
        etiquetaConfirmar="Eliminar"
        cargando={escrituras.borrando}
        onConfirmar={() => { void escrituras.borrar() }}
      />

      <ConfirmacionDelActa
        abierto={lectura.confirmandoRetraduccion}
        onCambiar={lectura.setConfirmandoRetraduccion}
        titulo="Volver a traducir"
        descripcion="Alguien corrigió esta traducción a mano. Si la pides de nuevo, esas correcciones se pierden."
        etiquetaCancelar="Cancelar"
        etiquetaConfirmar="Volver a traducir"
        cargando={lectura.cambiandoIdioma}
        onConfirmar={() => { lectura.setConfirmandoRetraduccion(false); void lectura.traducir(idioma) }}
      />

      <ConfirmacionDelActa
        abierto={confirmandoDescarte}
        onCambiar={setConfirmandoDescarte}
        titulo="Descartar los cambios"
        descripcion="Los cambios que hiciste en este Meeting Paper, también los de la IA, no se guardarán."
        etiquetaCancelar="Seguir editando"
        etiquetaConfirmar="Descartar cambios"
        onConfirmar={() => { setConfirmandoDescarte(false); edicion.descartar() }}
      />

      <ConfirmacionDelActa
        abierto={confirmandoSalida}
        onCambiar={setConfirmandoSalida}
        titulo="Salir sin guardar"
        descripcion="Tienes cambios sin guardar en este Meeting Paper. Si sales ahora, se pierden."
        etiquetaCancelar="Seguir editando"
        etiquetaConfirmar="Salir sin guardar"
        onConfirmar={() => { setConfirmandoSalida(false); onVolver() }}
      />
    </div>
  )
}
