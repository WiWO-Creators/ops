'use client'

import dynamic from 'next/dynamic'
import { useRef, useState, type ReactElement } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { ContenidoHtml } from '@/componentes/presentadores/ContenidoHtml'
import { conId, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'
import { cuerpoDelActa } from '@/dominio/actas'
import { AccionesDelActa } from './acta/AccionesDelActa'
import { AdjuntosDelActa } from './acta/AdjuntosDelActa'
import { CabeceraDelActa } from './acta/CabeceraDelActa'
import { ConfirmacionDelActa } from './acta/ConfirmacionDelActa'
import { DialogoDeRenombre } from './acta/DialogoDeRenombre'
import { OriginalDelActa } from './acta/OriginalDelActa'
import { TareasPropuestas } from './acta/TareasPropuestas'
import { useEdicionDelActa } from './acta/useEdicionDelActa'
import { useEscriturasDelActa } from './acta/useEscriturasDelActa'
import { useExportacionDelActa } from './acta/useExportacionDelActa'
import { useIdiomaDelActa } from './acta/useIdiomaDelActa'
import type { Acta } from '@/datos/recursos'
import { EVENTO_ABRIR_ORBE } from '@/dominio/pantalla'

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
 */

const EditorDeActa = dynamic(
  async () => (await import('./EditorDeActa')).EditorDeActa,
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
  puedeCrearTareas = false,
  destacarTareas = false,
  esSuperadmin = false,
  onCambiada,
  onBorrada,
  onVolver
}: PropsDetalle): ReactElement {
  const [confirmando, setConfirmando] = useState(false)
  const [confirmandoSalida, setConfirmandoSalida] = useState(false)
  const [renombrando, setRenombrando] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setError
  })
  const { idioma, infoIdioma, traduccionActiva, htmlActivo, tituloActivo } = lectura
  const edicion = useEdicionDelActa({ htmlActivo, escribirEnLoVisible: lectura.escribirEnLoVisible, setError })
  const escrituras = useEscriturasDelActa({
    acta,
    ruta,
    escribirEnLoVisible: lectura.escribirEnLoVisible,
    onCambiada,
    onBorrada,
    setError
  })
  const { exportando, exportar } = useExportacionDelActa({ acta, htmlActivo, tituloActivo, infoIdioma, setError })

  /**
   * Renombrar se esconde mientras se corrige, igual que el estilo y el idioma.
   *
   * No es que el renombre pise lo que se escribe —son dos campos distintos y dos peticiones
   * distintas—: es que el editor abierto tiene sus propias dos acciones, Guardar y Descartar, y
   * meter una tercera escritura del mismo documento entre medio es la forma de guardar una y creer
   * que se guardaron las dos.
   */
  const puedeRenombrar = puedeEditar && !edicion.editando

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
          editando={edicion.editando}
          puedeEditar={puedeEditar}
          puedeTraducir={puedeTraducir}
          cambiandoMarca={escrituras.cambiandoMarca}
          cambiandoIdioma={lectura.cambiandoIdioma}
          onCambiarMarca={(codigo) => { void escrituras.cambiarMarca(codigo) }}
          onElegirIdioma={(codigo) => { void lectura.elegirIdioma(codigo) }}
          onVolverATraducir={lectura.volverATraducir}
        />

        <AccionesDelActa
          editando={edicion.editando}
          guardando={edicion.guardando}
          exportando={exportando}
          puedeEditar={puedeEditar}
          puedeRenombrar={puedeRenombrar}
          puedeBorrar={puedeBorrar}
          puedePreguntar={conIa}
          onPreguntar={() => { window.dispatchEvent(new Event(EVENTO_ABRIR_ORBE)) }}
          onDescartar={edicion.descartar}
          onGuardar={() => { void edicion.guardar() }}
          onExportar={(formato) => { void exportar(formato) }}
          onImprimir={() => { marco.current?.contentWindow?.print() }}
          onCorregir={edicion.corregir}
          onRenombrar={() => { setRenombrando(true) }}
          onEliminar={() => { setConfirmando(true) }}
        />
      </div>

      {error !== null && (
        <AvisoEnLinea variante="error" mensaje={error} className="bg-superficie-peligro rounded-chico px-3 py-2 text-sm" />
      )}

      {edicion.editando && conIa && traduccionActiva !== null && (
        <p className="text-texto-tenue text-xs">
          La reescritura con IA solo está disponible en el idioma original del acta.
        </p>
      )}

      {edicion.editando
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
            onCambio={edicion.cambiar}
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

      {/* Montado solo mientras está abierto: cerrarlo desmonta el borrador, así que cancelar o
          pulsar `Escape` descarta lo tecleado sin una línea que lo limpie. */}
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
