'use client'

import { useMemo, useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { ESCALONES } from '@/dominio/escalon'
import {
  cuerpoDeLote, nodosDesdePersonas, omitidasDelLote, type AccionDeLote
} from '@/dominio/organizacion'
import { MensajeDeError, SIN_VALOR } from './piezas'
import { SelectorDePersona } from '@/componentes/formularios/SelectorDePersona'
import type { CatalogoDeAccesos, PersonaDeAccesos } from '@/datos/accesos'

interface PropsBarraDeLote {
  elegidas: PersonaDeAccesos[]
  limpiar: () => void
  catalogo: CatalogoDeAccesos
  /** El listado completo, para ofrecer jefes y descartar ciclos. */
  personas: PersonaDeAccesos[]
  actorId: number
  /** Se llama al terminar un lote que escribió al menos a una persona. */
  onAplicado: () => void
}

/** Cada acción, con cómo se nombra en el botón y en el diálogo. */
const ACCIONES: ReadonlyArray<{ clave: AccionDeLote, boton: string, titulo: string }> = [
  { clave: 'area', boton: 'Asignar área', titulo: 'Asignar un área' },
  { clave: 'jefe', boton: 'Poner a cargo de', titulo: 'Poner a cargo de alguien' },
  { clave: 'escalon', boton: 'Cambiar escalón', titulo: 'Cambiar el escalón' },
  { clave: 'cargo', boton: 'Asignar cargo', titulo: 'Asignar un cargo' }
]

/**
 * Acciones sobre varias personas a la vez: área, jefe, escalón o cargo.
 *
 * Es lo que faltaba para cargar el organigrama: repartir 30 personas en un área eran 30 paneles. Cada
 * acción abre un diálogo con su control, y antes de aplicar dice a quién se va a saltar y por qué
 * —uno mismo en el escalón, un ciclo en el jefe—, que son los casos que la API rechazaría.
 *
 * Las escrituras van **en serie**: la API escribe una persona por petición, y varias a la vez sobre la
 * misma tabla es la forma de que dos se pisen. Si una falla se sigue con las demás y al final se
 * dice cuántas entraron y cuáles no: un lote a medias es mejor que uno que se corta en la primera.
 */
export function BarraDeLote ({ elegidas, limpiar, catalogo, personas, actorId, onAplicado }: PropsBarraDeLote) {
  const [accion, setAccion] = useState<AccionDeLote | null>(null)

  return (
    <div className="bg-acento-suave rounded-tarjeta flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="text-texto text-sm font-medium">
        {elegidas.length} {elegidas.length === 1 ? 'persona elegida' : 'personas elegidas'}
      </span>
      {ACCIONES.map((una) => (
        <Boton key={una.clave} variante="secundario" tamano="chico" onClick={() => { setAccion(una.clave) }}>
          {una.boton}
        </Boton>
      ))}
      <Boton variante="sutil" tamano="chico" className="ms-auto" onClick={limpiar}>Quitar la selección</Boton>

      {accion !== null && (
        <DialogoDeLote
          accion={accion}
          elegidas={elegidas}
          catalogo={catalogo}
          personas={personas}
          actorId={actorId}
          cerrar={() => { setAccion(null) }}
          alTerminar={(guardadas) => {
            if (guardadas > 0) onAplicado()
          }}
          limpiar={limpiar}
        />
      )}
    </div>
  )
}

/** El resultado de aplicar un lote. */
interface ResultadoDeLote {
  guardadas: number
  fallidas: Array<{ nombre: string, mensaje: string }>
}

/** El diálogo de una acción en lote: elegir el valor, ver a quién se salta, aplicar. */
function DialogoDeLote ({
  accion, elegidas, catalogo, personas, actorId, cerrar, alTerminar, limpiar
}: {
  accion: AccionDeLote
  elegidas: PersonaDeAccesos[]
  catalogo: CatalogoDeAccesos
  personas: PersonaDeAccesos[]
  actorId: number
  cerrar: () => void
  alTerminar: (guardadas: number) => void
  limpiar: () => void
}) {
  const [valor, setValor] = useState<string | null>(accion === 'escalon' ? ESCALONES[0]?.clave ?? null : null)
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDeLote | null>(null)

  const nodos = useMemo(() => nodosDesdePersonas(personas), [personas])
  const omitidas = omitidasDelLote(elegidas, accion, valor, actorId, nodos)
  const aplicables = elegidas.filter((persona) => !omitidas.has(persona.staffid))
  const titulo = ACCIONES.find((una) => una.clave === accion)?.titulo ?? ''

  /** Escribe el cambio a cada persona aplicable, una por una. */
  async function aplicar (): Promise<void> {
    setAplicando(true)

    const cuerpo = cuerpoDeLote(accion, valor)
    const fallidas: ResultadoDeLote['fallidas'] = []
    let guardadas = 0

    for (const persona of aplicables) {
      const escritura = await escribirEnBff(`accesos/personas/${persona.staffid}`, 'PUT', cuerpo)

      if (escritura.ok) guardadas += 1
      else fallidas.push({ nombre: persona.nombre, mensaje: escritura.mensaje })
    }

    setAplicando(false)
    setResultado({ guardadas, fallidas })
    alTerminar(guardadas)
  }

  /**
   * Cierra el resultado. La selección se vacía recién acá y no al terminar de aplicar: la barra solo
   * se dibuja con filas elegidas, y vaciarla antes se llevaría puesto el diálogo con el resultado.
   * Con fallos se conserva, para poder reintentar con las mismas.
   */
  function cerrarResultado (): void {
    cerrar()
    if (resultado !== null && resultado.fallidas.length === 0) limpiar()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto && !aplicando) cerrarResultado() }}>
      <ContenidoDialogo titulo={titulo} descripcion={`Se aplica a ${elegidas.length} ${elegidas.length === 1 ? 'persona' : 'personas'}.`} ancho="chico">
        {resultado === null
          ? (
            <form className="flex flex-col gap-4" onSubmit={(evento) => { evento.preventDefault(); void aplicar() }}>
              <ControlDeLote
                accion={accion}
                valor={valor}
                catalogo={catalogo}
                personas={personas}
                deshabilitado={aplicando}
                onCambiar={setValor}
              />

              {omitidas.size > 0 && (
                <div className="bg-superficie-aviso text-texto-aviso rounded-tarjeta px-3 py-2 text-sm">
                  <p className="font-medium">Se van a saltar {omitidas.size}:</p>
                  <ul className="mt-1 list-disc ps-5">
                    {elegidas.filter((persona) => omitidas.has(persona.staffid)).map((persona) => (
                      <li key={persona.staffid}>{persona.nombre}: {omitidas.get(persona.staffid)}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <CerrarDialogo asChild>
                  <Boton variante="sutil" type="button" disabled={aplicando}>Cancelar</Boton>
                </CerrarDialogo>
                <Boton variante="primario" type="submit" cargando={aplicando} disabled={aplicables.length === 0}>
                  Aplicar a {aplicables.length}
                </Boton>
              </div>
            </form>
            )
          : <ResultadoDelLote resultado={resultado} cerrar={cerrarResultado} />}
      </ContenidoDialogo>
    </Dialogo>
  )
}

/** El control que corresponde a cada acción. `null` es "vaciar": sin área, sin jefe, sin cargo. */
function ControlDeLote ({
  accion, valor, catalogo, personas, deshabilitado, onCambiar
}: {
  accion: AccionDeLote
  valor: string | null
  catalogo: CatalogoDeAccesos
  personas: PersonaDeAccesos[]
  deshabilitado: boolean
  onCambiar: (valor: string | null) => void
}) {
  if (accion === 'jefe') {
    return (
      <Campo etiqueta="A cargo de" ayuda="Quien cuelga de alguna de las elegidas se salta: sería un ciclo.">
        {(props) => (
          <SelectorDePersona
            id={props.id}
            etiqueta="A cargo de"
            opciones={personas.filter((persona) => persona.activo).map((persona) => ({ staffid: persona.staffid, nombre: persona.nombre }))}
            valor={valor === null ? null : Number(valor)}
            marcador="Sin jefe directo"
            deshabilitado={deshabilitado}
            onCambiar={(staffid) => { onCambiar(staffid === null ? null : String(staffid)) }}
          />
        )}
      </Campo>
    )
  }

  const opciones = accion === 'escalon'
    ? ESCALONES.map((uno) => ({ valor: uno.clave, etiqueta: uno.nombre }))
    : (accion === 'area' ? catalogo.areas : catalogo.cargos).map((uno) => ({ valor: String(uno.id), etiqueta: uno.nombre }))
  const vacio = accion === 'area' ? 'Sin área' : 'Sin cargo'

  return (
    <Campo etiqueta={accion === 'escalon' ? 'Escalón' : accion === 'area' ? 'Área principal' : 'Cargo'}>
      {(props) => (
        <Selector
          value={valor ?? SIN_VALOR}
          disabled={deshabilitado}
          onValueChange={(elegido) => { onCambiar(elegido === SIN_VALOR ? null : elegido) }}
        >
          <DisparadorSelector marcador={vacio} {...props} />
          <ContenidoSelector>
            {accion !== 'escalon' && <Opcion value={SIN_VALOR}>{vacio}</Opcion>}
            {opciones.map((opcion) => <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>)}
          </ContenidoSelector>
        </Selector>
      )}
    </Campo>
  )
}

/** Qué entró y qué no, con el mensaje de la API de cada fallo. */
function ResultadoDelLote ({ resultado, cerrar }: { resultado: ResultadoDeLote, cerrar: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-texto text-sm">
        {resultado.guardadas === 0
          ? 'No se guardó ningún cambio.'
          : `${resultado.guardadas} ${resultado.guardadas === 1 ? 'persona actualizada' : 'personas actualizadas'}.`}
      </p>

      {resultado.fallidas.length > 0 && (
        <MensajeDeError>
          <span className="block font-medium">No se pudo con {resultado.fallidas.length}:</span>
          <ul className="mt-1 list-disc ps-5">
            {resultado.fallidas.map((fallo) => <li key={fallo.nombre}>{fallo.nombre}: {fallo.mensaje}</li>)}
          </ul>
        </MensajeDeError>
      )}

      <div className="flex justify-end">
        <Boton variante="primario" onClick={cerrar}>Listo</Boton>
      </div>
    </div>
  )
}
