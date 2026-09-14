'use client'

import { useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import {
  CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla
} from '@/componentes/datos/Tabla'
import { Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import {
  ALCANCES, borradorDeEscalon, capacidadesDelPiso, cuerpoDeEscalon, motivoParaRechazarEscalon,
  etiquetaDeCapacidad, etiquetaDeFeature, pisoConCapacidad
} from '@/dominio/accesos'
import { CabeceraDePanel, DialogoConfirmar, MensajeDeError } from './piezas'
import type { AlcanceDeEscalon, CatalogoDeAccesos, Escalon } from '@/datos/accesos'
import type { BorradorDeEscalon } from '@/dominio/accesos'

interface PropsPanelEscalones {
  catalogo: CatalogoDeAccesos
  /** Vuelve a pedir el catálogo entero después de escribir. */
  recargar: () => void
}

/**
 * Los escalones de la escalera de permisos: la escalera misma, no quién está en ella.
 *
 * Cada fila es un escalón de `tblwiwo_escalones`. Lo que decide la herencia es el **orden**: un
 * escalón recibe el piso de todos los que están debajo, así que dos escalones con el mismo orden
 * dejarían la escalera sin un "debajo" definido. Por eso el orden duplicado se rechaza acá antes de
 * salir, además del 422 de la API.
 *
 * Los tres de sistema —`usuario`, `admin`, `superadmin`— solo dejan cambiar el nombre y no se borran:
 * hay código del backend que los nombra por su clave. Se ven marcados para que quien administra no
 * descubra la restricción recién al apretar Guardar.
 */
export function PanelEscalones ({ catalogo, recargar }: PropsPanelEscalones) {
  /** `null` con el diálogo cerrado; `{ escalon: null }` al crear uno nuevo. */
  const [editando, setEditando] = useState<{ escalon: Escalon | null } | null>(null)
  const [borrando, setBorrando] = useState<Escalon | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null)

  const escalones = [...catalogo.escalones].sort((uno, otro) => uno.orden - otro.orden)
  const siguienteOrden = escalones.reduce((mayor, escalon) => Math.max(mayor, escalon.orden), 0) + 1

  /** Borra el escalón elegido. La API responde 409 si alguna persona o rol lo usa. */
  async function borrar (): Promise<void> {
    if (borrando === null) return

    setEnCurso(true)
    setErrorBorrado(null)

    const resultado = await escribirEnBff(`accesos/escalones/${borrando.clave}`, 'DELETE')

    setEnCurso(false)

    if (!resultado.ok) {
      setErrorBorrado(resultado.mensaje)

      return
    }

    setBorrando(null)
    recargar()
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Escalones"
        descripcion="La escalera de permisos. El orden es la herencia: cada escalón suma el piso de todos los que están debajo."
        accion={
          <Boton variante="primario" onClick={() => { setEditando({ escalon: null }) }}>
            Nuevo escalón
          </Boton>
        }
      />

      {escalones.length === 0
        ? (
          <Vacio
            titulo="No hay escalones"
            descripcion="La instalación todavía no sembró la tabla de escalones. Hasta que exista al menos uno, el piso lo decide solo la matriz de permisos de cada persona."
          />
          )
        : (
          <div className="overflow-x-auto">
            <Tabla>
              <EncabezadoTabla>
                <tr>
                  <CeldaEncabezado>Escalón</CeldaEncabezado>
                  <CeldaEncabezado numerica angosta>Orden</CeldaEncabezado>
                  <CeldaEncabezado>Alcance</CeldaEncabezado>
                  <CeldaEncabezado>Marcas</CeldaEncabezado>
                  <CeldaEncabezado numerica angosta>Piso</CeldaEncabezado>
                  <CeldaEncabezado numerica angosta>Personas</CeldaEncabezado>
                  <CeldaEncabezado angosta>Acciones</CeldaEncabezado>
                </tr>
              </EncabezadoTabla>
              <CuerpoTabla>
                {escalones.map((escalon) => (
                  <FilaTabla key={escalon.clave}>
                    <CeldaTabla>
                      <span className="text-texto flex items-center gap-2">
                        {escalon.nombre}
                        {escalon.sistema && <Insignia tono="contorno" tamano="chico">De sistema</Insignia>}
                      </span>
                      <span className="text-texto-tenue block font-mono text-xs">{escalon.clave}</span>
                    </CeldaTabla>

                    <CeldaTabla numerica>{escalon.orden}</CeldaTabla>

                    <CeldaTabla>{ALCANCES[escalon.alcance]?.etiqueta ?? escalon.alcance}</CeldaTabla>

                    <CeldaTabla>
                      <span className="flex flex-wrap gap-1">
                        {escalon.jefatura && <Insignia tono="acento" tamano="chico">Jefatura</Insignia>}
                        {escalon.asignable
                          ? <Insignia tono="neutro" tamano="chico">Asignable</Insignia>
                          : <Insignia tono="contorno" tamano="chico">No asignable</Insignia>}
                      </span>
                    </CeldaTabla>

                    <CeldaTabla numerica>{capacidadesDelPiso(escalon.piso)}</CeldaTabla>

                    <CeldaTabla numerica>{escalon.personas}</CeldaTabla>

                    <CeldaTabla angosta>
                      <span className="flex gap-1">
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          onClick={() => { setEditando({ escalon }) }}
                        >
                          Editar
                        </Boton>
                        {!escalon.sistema && (
                          <Boton
                            variante="sutil"
                            tamano="chico"
                            onClick={() => { setErrorBorrado(null); setBorrando(escalon) }}
                          >
                            Borrar
                          </Boton>
                        )}
                      </span>
                    </CeldaTabla>
                  </FilaTabla>
                ))}
              </CuerpoTabla>
            </Tabla>
          </div>
          )}

      {editando !== null && (
        <DialogoDeEscalon
          escalon={editando.escalon}
          escalones={escalones}
          features={catalogo.features}
          alcances={catalogo.alcances}
          ordenSugerido={siguienteOrden}
          cerrar={() => { setEditando(null) }}
          alGuardar={() => { setEditando(null); recargar() }}
        />
      )}

      <DialogoConfirmar
        abierto={borrando !== null}
        titulo={`Borrar «${borrando?.nombre ?? ''}»`}
        descripcion="Quien lo tenga puesto vuelve al escalón de su rol. No se puede borrar si alguna persona o algún rol lo usa: la API lo rechaza y te dice cuántos son."
        etiquetaConfirmar="Borrar el escalón"
        peligroso
        enCurso={enCurso}
        error={errorBorrado}
        onConfirmar={() => { void borrar() }}
        onCerrar={() => { setBorrando(null) }}
      />
    </div>
  )
}

interface PropsDialogoEscalon {
  /** El escalón a editar, o `null` para crear uno. */
  escalon: Escalon | null
  escalones: Escalon[]
  features: Record<string, string[]>
  alcances: AlcanceDeEscalon[]
  ordenSugerido: number
  cerrar: () => void
  alGuardar: () => void
}

/**
 * Alta y edición de un escalón.
 *
 * La clave no se edita nunca: es la que guardan `tblwiwo_nivel_persona` y el mapa de roles, así que
 * cambiarla dejaría huérfanas a las personas que la tienen puesta. Al crear se pide; al editar se
 * muestra apagada para que se vea cuál es.
 */
function DialogoDeEscalon ({
  escalon, escalones, features, alcances, ordenSugerido, cerrar, alGuardar
}: PropsDialogoEscalon) {
  const [borrador, setBorrador] = useState<BorradorDeEscalon>(
    () => borradorDeEscalon(escalon ?? undefined, ordenSugerido)
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const esSistema = escalon?.sistema ?? false
  const claveOriginal = escalon?.clave ?? null
  const motivo = motivoParaRechazarEscalon(borrador, escalones, claveOriginal, esSistema)

  /** Anota un campo del borrador y borra el error anterior: ya no describe lo que hay en pantalla. */
  function anotar (cambio: Partial<BorradorDeEscalon>): void {
    setBorrador((previo) => ({ ...previo, ...cambio }))
    setError(null)
  }

  /** Manda el alta o la edición. El fallo se muestra en el diálogo, que no se desmonta. */
  async function guardar (): Promise<void> {
    if (motivo !== null) {
      setError(motivo)

      return
    }

    setGuardando(true)
    setError(null)

    const cuerpo = cuerpoDeEscalon(borrador, claveOriginal, esSistema)
    const resultado = claveOriginal === null
      ? await escribirEnBff('accesos/escalones', 'POST', cuerpo)
      : await escribirEnBff(`accesos/escalones/${claveOriginal}`, 'PUT', cuerpo)

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    alGuardar()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) cerrar() }}>
      <ContenidoDialogo
        titulo={claveOriginal === null ? 'Nuevo escalón' : `Escalón «${escalon?.nombre ?? ''}»`}
        descripcion={
          esSistema
            ? 'Es un escalón de sistema: solo se le puede cambiar el nombre. Hay código del backend que lo nombra por su clave.'
            : 'El orden decide la herencia del piso. El piso es lo que este escalón otorga por sí mismo, sin contar lo que hereda.'
        }
        ancho="grande"
      >
        <form
          onSubmit={(evento) => { evento.preventDefault(); void guardar() }}
          className="flex flex-col gap-5"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo etiqueta="Nombre" requerido>
              {(props) => (
                <Entrada
                  {...props}
                  value={borrador.nombre}
                  maxLength={80}
                  disabled={guardando}
                  onChange={(evento) => { anotar({ nombre: evento.target.value }) }}
                />
              )}
            </Campo>

            <Campo
              etiqueta="Clave"
              ayuda={
                claveOriginal === null
                  ? 'Minúsculas y guion bajo. No se puede cambiar después.'
                  : 'La clave no se cambia nunca: la guardan el override por persona y el mapa de roles.'
              }
              requerido={claveOriginal === null}
            >
              {(props) => (
                <Entrada
                  {...props}
                  value={claveOriginal ?? borrador.clave}
                  maxLength={30}
                  disabled={guardando || claveOriginal !== null}
                  onChange={(evento) => { anotar({ clave: evento.target.value }) }}
                />
              )}
            </Campo>
          </div>

          {!esSistema && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Campo etiqueta="Orden" ayuda="De menor a mayor. No puede repetirse." requerido>
                  {(props) => (
                    <Entrada
                      {...props}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={borrador.orden}
                      disabled={guardando}
                      onChange={(evento) => { anotar({ orden: evento.target.value }) }}
                    />
                  )}
                </Campo>

                <Campo etiqueta="Alcance" ayuda={ALCANCES[borrador.alcance]?.ayuda}>
                  {(props) => (
                    <Selector
                      value={borrador.alcance}
                      disabled={guardando}
                      onValueChange={(valor) => { anotar({ alcance: valor as AlcanceDeEscalon }) }}
                    >
                      <DisparadorSelector marcador="Elige un alcance" id={props.id} />
                      <ContenidoSelector>
                        {alcances.map((alcance) => (
                          <Opcion key={alcance} value={alcance}>
                            {ALCANCES[alcance]?.etiqueta ?? alcance}
                          </Opcion>
                        ))}
                      </ContenidoSelector>
                    </Selector>
                  )}
                </Campo>
              </div>

              <div className="flex flex-col gap-2">
                <Casilla
                  etiqueta="Cuenta como jefatura"
                  ayuda="Aparece en los resúmenes de equipo como quien conduce."
                  marcada={borrador.jefatura}
                  deshabilitada={guardando}
                  onCambiar={(marcada) => { anotar({ jefatura: marcada }) }}
                />
                <Casilla
                  etiqueta="Se puede asignar a una persona"
                  ayuda="Si se apaga, este escalón solo llega por el rol y nadie lo puede poner a mano."
                  marcada={borrador.asignable}
                  deshabilitada={guardando}
                  onCambiar={(marcada) => { anotar({ asignable: marcada }) }}
                />
              </div>

              <PisoEditable
                piso={borrador.piso}
                features={features}
                deshabilitado={guardando}
                onCambiar={(piso) => { anotar({ piso }) }}
              />
            </>
          )}

          {error !== null && <MensajeDeError>{error}</MensajeDeError>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton variante="primario" type="submit" cargando={guardando} disabled={motivo !== null}>
              Guardar
            </Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}

/**
 * Las casillas del piso, agrupadas por feature.
 *
 * Las features y sus capacidades salen del catálogo de la API y no de una lista escrita acá: una
 * capacidad inventada la rechaza el 422, y una que el backend agregue aparece sola.
 */
function PisoEditable ({
  piso, features, deshabilitado, onCambiar
}: {
  piso: Record<string, string[]>
  features: Record<string, string[]>
  deshabilitado: boolean
  onCambiar: (piso: Record<string, string[]>) => void
}) {
  const nombres = Object.keys(features)

  if (nombres.length === 0) {
    return (
      <p className="text-texto-aviso text-sm">
        La API no publicó ninguna feature en el catálogo de capacidades, así que no hay piso que
        repartir. El escalón se puede crear igual: sumará solo su alcance.
      </p>
    )
  }

  return (
    <fieldset className="border-linea rounded-tarjeta flex flex-col gap-3 border p-4">
      <legend className="text-texto px-1 text-sm font-medium">Piso</legend>
      <p className="text-texto-tenue text-sm">
        Lo que este escalón otorga por sí mismo. Lo que herede de los escalones de abajo no se marca
        acá: lo suma la API por el orden.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {nombres.map((feature) => (
          <div key={feature} className="flex flex-col gap-1.5">
            <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">
              {etiquetaDeFeature(feature)}
            </span>
            {(features[feature] ?? []).map((capacidad) => (
              <label key={capacidad} className="text-texto flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className={CLASES_CASILLA}
                  checked={piso[feature]?.includes(capacidad) ?? false}
                  disabled={deshabilitado}
                  onChange={(evento) => {
                    onCambiar(pisoConCapacidad(piso, feature, capacidad, evento.target.checked))
                  }}
                />
                {etiquetaDeCapacidad(capacidad)}
              </label>
            ))}
          </div>
        ))}
      </div>
    </fieldset>
  )
}

/** Una casilla con su ayuda debajo. Nativa: el `<input type="checkbox">` ya trae foco y teclado. */
function Casilla ({
  etiqueta, ayuda, marcada, deshabilitada, onCambiar
}: {
  etiqueta: string
  ayuda: string
  marcada: boolean
  deshabilitada: boolean
  onCambiar: (marcada: boolean) => void
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-texto flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className={CLASES_CASILLA}
          checked={marcada}
          disabled={deshabilitada}
          onChange={(evento) => { onCambiar(evento.target.checked) }}
        />
        {etiqueta}
      </span>
      <span className="text-texto-tenue pl-6 text-xs">{ayuda}</span>
    </label>
  )
}
