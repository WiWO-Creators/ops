'use client'

import { Building2, Check, ChevronDown, ChevronUp, Copy, MonitorPlay, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useState, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Vacio } from '@/componentes/estado/Estados'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { cn } from '@/lib/clases'
import { urlDePantallaDeArea } from '@/lib/enlace-publico'
import {
  CLASES_CONFIGURABLES, ESCENAS, SEGUNDOS_MAXIMO, SEGUNDOS_MINIMO, alternar, durar,
  duracionDeLaVuelta, iguales, mover, textoParaAlcance
} from '@/dominio/pantallas-panel'
import type { EscenaConfigurada, PantallaDeAreaEnPanel } from '@/datos/recursos'

interface Props {
  inicial: PantallaDeAreaEnPanel[]
  /**
   * La pantalla de toda la compañía, que llega por su propia ruta y no en el inventario.
   *
   * `null` solo si la API falló al pedirla: la global **siempre existe como fila**, aunque nadie haya
   * generado su código todavía, igual que un área sin pantalla. Viaja aparte y no mezclada en
   * `inicial` porque su `area_id` es `null` y se gestiona en otra ruta, y meterla en el mismo arreglo
   * obligaría a preguntar por el tipo en cada operación.
   */
  global: PantallaDeAreaEnPanel | null
}

/**
 * La ruta de la API que gestiona una pantalla.
 *
 * Las dos son el mismo recurso con los mismos cuatro verbos —`GET`, `POST`, `PUT`, `DELETE`— y el
 * mismo cuerpo; lo único que cambia es de quién es la pantalla. Se resuelve en una función para que el
 * resto del componente no tenga que saber que existen dos.
 *
 * @param fila la fila del inventario, de un área o la global
 * @returns la ruta sin la base del BFF ni barra inicial, como la espera `escribirEnBff`
 */
function rutaDePantalla (fila: PantallaDeAreaEnPanel): string {
  return fila.global ? 'accesos/pantallas/global' : `accesos/areas/${fila.area_id}/pantalla`
}

/**
 * La identidad de una fila, para React y para reemplazarla tras una escritura.
 *
 * No sirve `area_id`: la global lo tiene en `null`, y `null` como clave de lista es un error que React
 * no siempre denuncia. `'global'` no puede chocar con ningún id de área.
 */
function claveDePantalla (fila: PantallaDeAreaEnPanel): string {
  return fila.global ? 'global' : String(fila.area_id)
}

/**
 * El inventario de pantallas: un área por fila, con su código y lo que muestra.
 *
 * === EL CÓDIGO SE VE SIEMPRE ===
 *
 * Es la diferencia con el enlace público de una Tarea, que se muestra una vez y no se puede releer.
 * Acá se puede: la API lo guarda en claro a propósito, porque con cinco caracteres un hash no
 * defendería nada y sí impediría contestar "¿cuál era el código de Marketing?". Ver la migración 0610.
 *
 * Y tiene que verse siempre porque el caso real es alguien de pie frente a un televisor, tecleando
 * con un mando a distancia mientras otro le dicta el código por teléfono. Un botón de copiar no sirve
 * ahí; un código grande y legible, sí.
 */
export function PantallasDeArea ({ inicial, global: globalInicial }: Props): ReactElement {
  const [filas, setFilas] = useState(inicial)
  const [global, setGlobal] = useState(globalInicial)
  const [error, setError] = useState<string | null>(null)

  const reemplazar = useCallback((pantalla: PantallaDeAreaEnPanel): void => {
    if (pantalla.global) {
      setGlobal(pantalla)

      return
    }

    setFilas((previas) => previas.map((fila) => fila.area_id === pantalla.area_id ? pantalla : fila))
  }, [])

  if (filas.length === 0 && global === null) {
    return (
      <Vacio
        titulo="No hay áreas"
        descripcion="Las áreas se crean en Accesos. Cada una puede tener su propia pantalla."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {error !== null && (
        <p className="border-linea bg-superficie-peligro text-texto-peligro rounded-lg border px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {/*
        * La global va primero y en una lista aparte, no como una fila más del inventario.
        *
        * Es de otra cosa: las de abajo son de un área y esta es de la empresa entera, convive con
        * ellas y no las reemplaza. Mezclada en la misma lista, alfabéticamente perdida entre
        * "Contenido" y "Diseño", nadie entendería que abarca a las dos.
        */}
      {global !== null && (
        <ul className="flex flex-col gap-2">
          <FilaDePantalla fila={global} onCambio={reemplazar} onError={setError} />
        </ul>
      )}

      <ul className="flex flex-col gap-2">
        {filas.map((fila) => (
          <FilaDePantalla
            key={claveDePantalla(fila)}
            fila={fila}
            onCambio={reemplazar}
            onError={setError}
          />
        ))}
      </ul>
    </div>
  )
}

function FilaDePantalla ({ fila, onCambio, onError }: {
  fila: PantallaDeAreaEnPanel
  onCambio: (pantalla: PantallaDeAreaEnPanel) => void
  onError: (mensaje: string | null) => void
}): ReactElement {
  const [abierta, setAbierta] = useState(false)
  const [trabajando, setTrabajando] = useState(false)
  const [copiado, setCopiado] = useState(false)

  /**
   * Manda una escritura y devuelve si salió bien, aparte de lo que haya devuelto.
   *
   * Las dos cosas por separado porque el `DELETE` contesta 204 **sin cuerpo**: mirar solo los datos
   * no distinguiría un borrado correcto de un error.
   */
  const escribir = useCallback(async (
    metodo: 'POST' | 'PUT' | 'DELETE',
    cuerpo?: unknown
  ): Promise<{ ok: boolean, pantalla: PantallaDeAreaEnPanel | null }> => {
    setTrabajando(true)
    onError(null)

    const resultado = await escribirEnBff<PantallaDeAreaEnPanel>(rutaDePantalla(fila), metodo, cuerpo)

    setTrabajando(false)

    if (!resultado.ok) {
      onError(resultado.mensaje)

      return { ok: false, pantalla: null }
    }

    return { ok: true, pantalla: resultado.datos ?? null }
  }, [fila, onError])

  const generar = useCallback(async (): Promise<void> => {
    const { pantalla } = await escribir('POST')

    if (pantalla !== null) {
      onCambio(pantalla)
      setAbierta(true)
    }
  }, [escribir, onCambio])

  const darDeBaja = useCallback(async (): Promise<void> => {
    const { ok } = await escribir('DELETE')

    if (!ok) return

    // El 204 no trae cuerpo, así que la fila se reconstruye acá con lo que devolvería la API si se
    // volviera a preguntar: sin código y sin título, pero con las escenas, que es lo que la pantalla
    // de configuración necesita para poder dibujar los interruptores de la próxima.
    // `global` se conserva: es lo que decide la ruta de la próxima escritura, y una fila dada de baja
    // que perdiera esa marca dejaría de poder volver a crearse.
    onCambio({ ...fila, shared: false, code: null, title: null, created_at: null, last_seen_at: null })
    setAbierta(false)
  }, [escribir, fila, onCambio])

  const copiar = useCallback(async (): Promise<void> => {
    const url = urlDePantallaDeArea(window.location.origin, fila.code ?? '')

    if (url === null) return

    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
    } catch {
      onError('No pudimos copiar. Selecciona la dirección y cópiala a mano.')
    }
  }, [fila.code, onError])

  return (
    <li className="border-linea bg-superficie-elevada flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* La global lleva otro icono: es lo único que se ve de lejos al recorrer la lista. */}
          {fila.global
            ? <Building2 className="text-acento size-5 shrink-0" aria-hidden />
            : <MonitorPlay className="text-texto-tenue size-5 shrink-0" aria-hidden />}
          <div className="flex min-w-0 flex-col">
            <p className="text-texto truncate font-medium">
              {fila.area_name}
              {fila.global && (
                <span className="text-texto-tenue ml-2 text-sm font-normal">Toda la compañía</span>
              )}
            </p>
            <Estado fila={fila} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {fila.code !== null && (
            <code className="border-linea bg-superficie text-texto rounded-md border px-3 py-1.5 font-mono text-lg tracking-[0.25em]">
              {fila.code}
            </code>
          )}

          {fila.shared
            ? (
              <>
                <Boton variante="secundario" tamano="chico" onClick={() => { void copiar() }}>
                  {copiado ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  {copiado ? 'Copiada' : 'Copiar URL'}
                </Boton>
                <Boton
                  variante="secundario"
                  tamano="chico"
                  onClick={() => { setAbierta(!abierta) }}
                  aria-expanded={abierta}
                >
                  {abierta ? 'Cerrar' : 'Qué se ve'}
                </Boton>
                <Boton
                  variante="sutil"
                  tamano="chico"
                  soloIcono
                  aria-label={`Generar un código nuevo para ${fila.area_name}`}
                  title="Genera un código nuevo. El anterior deja de servir en el acto."
                  cargando={trabajando}
                  onClick={() => { void generar() }}
                >
                  <RefreshCw className="size-4" aria-hidden />
                </Boton>
                <Boton
                  variante="sutil"
                  tamano="chico"
                  soloIcono
                  aria-label={`Dar de baja la pantalla de ${fila.area_name}`}
                  cargando={trabajando}
                  onClick={() => { void darDeBaja() }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Boton>
              </>
              )
            : (
              <Boton variante="secundario" tamano="chico" cargando={trabajando} onClick={() => { void generar() }}>
                Crear pantalla
              </Boton>
              )}
        </div>
      </div>

      {fila.shared && abierta && (
        <Configuracion
          fila={fila}
          guardar={async (cuerpo) => {
            const { ok, pantalla } = await escribir('PUT', cuerpo)

            if (pantalla !== null) onCambio(pantalla)

            return ok
          }}
        />
      )}
    </li>
  )
}

/**
 * El editor: qué escenas se ven, en qué orden, cuánto dura cada una y con qué título.
 *
 * El estado vive acá y no arriba a propósito: se edita en borrador y solo viaja al pulsar Guardar. Un
 * `PUT` por cada clic en un interruptor haría que una configuración a medias —dos escenas apagadas
 * antes de encender la tercera— llegue a un televisor que está encendido en ese momento.
 */
function Configuracion ({ fila, guardar }: {
  fila: PantallaDeAreaEnPanel
  guardar: (cuerpo: { titulo: string | null, escenas: EscenaConfigurada[] }) => Promise<boolean>
}): ReactElement {
  const [escenas, setEscenas] = useState<EscenaConfigurada[]>(fila.scenes)
  const [titulo, setTitulo] = useState(fila.title ?? '')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const sinCambios = iguales(escenas, fila.scenes) && titulo.trim() === (fila.title ?? '')
  const vuelta = duracionDeLaVuelta(escenas)

  const aplicar = useCallback(async (): Promise<void> => {
    setGuardando(true)
    setGuardado(false)

    const ok = await guardar({ titulo: titulo.trim() === '' ? null : titulo.trim(), escenas })

    setGuardando(false)
    setGuardado(ok)
  }, [escenas, guardar, titulo])

  return (
    <div className="border-linea flex flex-col gap-4 border-t pt-4">
      <label className="flex flex-col gap-1">
        <span className="text-texto-tenue text-sm">Título en la pantalla</span>
        <Entrada
          value={titulo}
          onChange={(evento) => { setTitulo(evento.target.value); setGuardado(false) }}
          placeholder={fila.area_name}
          maxLength={191}
        />
        <span className="text-texto-sutil text-xs">
          En blanco se muestra el nombre {fila.global ? 'de la compañía' : 'del área'}.
        </span>
      </label>

      <ul className="flex flex-col gap-2">
        {CLASES_CONFIGURABLES.map((clase) => {
          const puesta = escenas.find((escena) => escena.clase === clase) ?? null
          const posicion = escenas.findIndex((escena) => escena.clase === clase)

          return (
            <li
              key={clase}
              className={cn(
                'border-linea flex flex-wrap items-center gap-3 rounded-md border p-3',
                puesta === null && 'opacity-55'
              )}
            >
              <label className="flex min-w-0 flex-1 items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0"
                  checked={puesta !== null}
                  // La última encendida no se puede apagar: la API lo rechaza, y un interruptor que
                  // se apaga y vuelve solo es peor que uno que no se deja apagar.
                  disabled={puesta !== null && escenas.length <= 1}
                  onChange={() => { setEscenas(alternar(escenas, clase)); setGuardado(false) }}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-texto text-sm font-medium">
                    {textoParaAlcance(ESCENAS[clase].nombre, fila.global)}
                  </span>
                  <span className="text-texto-tenue text-xs">
                    {textoParaAlcance(ESCENAS[clase].descripcion, fila.global)}
                  </span>
                </span>
              </label>

              {puesta !== null && (
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex items-center gap-2">
                    <span className="text-texto-tenue text-xs">seg.</span>
                    <Entrada
                      type="number"
                      className="w-20"
                      min={SEGUNDOS_MINIMO}
                      max={SEGUNDOS_MAXIMO}
                      value={puesta.segundos}
                      onChange={(evento) => {
                        setEscenas(durar(escenas, clase, Number(evento.target.value)))
                        setGuardado(false)
                      }}
                    />
                  </label>

                  <Boton
                    variante="sutil"
                    tamano="chico"
                    soloIcono
                    aria-label={`Subir ${textoParaAlcance(ESCENAS[clase].nombre, fila.global)}`}
                    disabled={posicion <= 0}
                    onClick={() => { setEscenas(mover(escenas, clase, -1)); setGuardado(false) }}
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </Boton>
                  <Boton
                    variante="sutil"
                    tamano="chico"
                    soloIcono
                    aria-label={`Bajar ${textoParaAlcance(ESCENAS[clase].nombre, fila.global)}`}
                    disabled={posicion >= escenas.length - 1}
                    onClick={() => { setEscenas(mover(escenas, clase, 1)); setGuardado(false) }}
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </Boton>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-texto-tenue text-sm">
          Una vuelta entera dura <strong className="text-texto">{vuelta} s</strong>
          {vuelta > 150 && (
            <span className="text-texto-aviso">
              {' '}— quien pase por delante puede no llegar a ver todo.
            </span>
          )}
        </p>

        <div className="flex items-center gap-3">
          {guardado && <span className="text-texto-exito text-sm">Guardado</span>}
          <Boton
            variante="primario"
            tamano="chico"
            disabled={sinCambios}
            cargando={guardando}
            onClick={() => { void aplicar() }}
          >
            Guardar
          </Boton>
        </div>
      </div>
    </div>
  )
}

/**
 * La línea de estado de una fila.
 *
 * `last_seen_at` es lo más útil de toda la pantalla y por eso va acá y no escondido: si dice "hace
 * tres días", el televisor está apagado, desenchufado o sin red, y no hay ninguna otra forma de
 * saberlo desde Ops.
 */
function Estado ({ fila }: { fila: PantallaDeAreaEnPanel }): ReactElement {
  if (!fila.shared) {
    return <p className="text-texto-sutil text-sm">Sin pantalla</p>
  }


  return (
    <p className="text-texto-tenue flex flex-wrap gap-x-2 text-sm">
      <span>{fila.scenes.length} {fila.scenes.length === 1 ? 'escena' : 'escenas'}</span>
      <span aria-hidden>·</span>
      <span>
        {fila.last_seen_at === null
          ? 'todavía no se abrió'
          : <>vista por última vez <Fecha valor={fila.last_seen_at} conHora /></>}
      </span>
    </p>
  )
}
