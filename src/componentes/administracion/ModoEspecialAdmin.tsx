'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { Seccion } from '@/componentes/presentadores/Ficha'
import { useAviso } from '@/componentes/estado/useAviso'
import { revalidarModoEspecial } from '@/datos/acciones-modo'
import { guardarAjustes } from '@/datos/recursos'
import { detallesDeAjustesLegibles, ETIQUETAS_DE_AJUSTES } from '@/dominio/ajustes'
import { diaLocal, estadoDelModo, MODOS, SIN_MODO, type EstadoDelModo } from '@/dominio/modos-especiales'
import { aFechaDelContrato, aFechaLocal, enmascararFechaLocal } from '@/lib/fechas'
import type { Ajustes } from '@/datos/recursos'

const CLAVE_MODO = 'wiwo_modo_especial'
const CLAVE_DESDE = 'wiwo_modo_desde'
const CLAVE_HASTA = 'wiwo_modo_hasta'

const TEXTO_DE_ESTADO: Record<EstadoDelModo, string> = {
  apagado: 'Apagado: la interfaz se ve normal.',
  programado: 'Programado: todavía no empieza.',
  vigente: 'Vigente: se está viendo ahora.',
  vencido: 'Vencido: el rango ya pasó.'
}

/** Lee un ajuste de texto, o vacío si todavía no tiene fila. */
function textoDe (ajustes: Ajustes, clave: string): string {
  const valor = ajustes.editable[clave]?.value

  return typeof valor === 'string' ? valor : ''
}

/**
 * Pestaña «Apariencia» de Administración: programa el modo especial de la interfaz.
 *
 * Un solo modo a la vez, con su rango de días (inclusivo). Guarda las tres claves en un solo
 * `PATCH /settings` porque la API valida el conjunto —el modo exige las dos fechas y `desde <= hasta`—
 * y rechaza el cuerpo entero si no cierra. Al guardar invalida la lectura cacheada del layout para
 * que el cambio se vea de inmediato y no dentro de un minuto.
 *
 * @param inicial el cuerpo de `GET /settings` tal como lo trajo el servidor
 */
export function ModoEspecialAdmin ({ inicial }: { inicial: Ajustes }): ReactElement {
  const aviso = useAviso()
  const [guardada, setGuardada] = useState(inicial)
  const [modo, setModo] = useState(textoDe(inicial, CLAVE_MODO) || SIN_MODO)
  const [desde, setDesde] = useState(textoDe(inicial, CLAVE_DESDE))
  const [hasta, setHasta] = useState(textoDe(inicial, CLAVE_HASTA))
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])

  const sucio = modo !== (textoDe(guardada, CLAVE_MODO) || SIN_MODO) ||
    desde !== textoDe(guardada, CLAVE_DESDE) || hasta !== textoDe(guardada, CLAVE_HASTA)
  const estado = estadoDelModo(
    textoDe(guardada, CLAVE_MODO), textoDe(guardada, CLAVE_DESDE), textoDe(guardada, CLAVE_HASTA), diaLocal(new Date())
  )
  const incompleto = modo !== SIN_MODO && (desde === '' || hasta === '')
  const invertido = desde !== '' && hasta !== '' && desde > hasta

  async function guardar (): Promise<void> {
    setGuardando(true)
    setErrores([])

    const resultado = await guardarAjustes({ [CLAVE_MODO]: modo, [CLAVE_DESDE]: desde, [CLAVE_HASTA]: hasta })

    if (resultado.ok) {
      setGuardada(resultado.ajustes)
      await revalidarModoEspecial()
      aviso.exito('Apariencia guardada.')
    } else {
      const etiquetas = Object.fromEntries(
        Object.entries(ETIQUETAS_DE_AJUSTES).map(([clave, { etiqueta }]) => [clave, etiqueta])
      )

      setErrores([resultado.mensaje, ...detallesDeAjustesLegibles(resultado.detalles, etiquetas)])
    }
    setGuardando(false)
  }

  return (
    <Seccion titulo="Modo especial">
      <div className="flex max-w-xl flex-col gap-4">
        <p className="text-texto-tenue text-sm">
          Cambia el estilo de toda la interfaz (el panel, el portal de clientes y las pantallas) entre dos
          días. Cada persona puede apagarlo para sí desde el botón junto al selector de tema.
        </p>

        <Campo etiqueta="Modo">
          {(props) => (
            <Selector value={modo} disabled={guardando} onValueChange={setModo}>
              <DisparadorSelector marcador="Sin definir" id={props.id} />
              <ContenidoSelector>
                <Opcion value={SIN_MODO}>Ninguno</Opcion>
                {Object.entries(MODOS).map(([clave, { nombre }]) => (
                  <Opcion key={clave} value={clave}>{nombre}</Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Primer día" requerido={modo !== SIN_MODO}>
            {(props) => <EntradaDia props={props} valor={desde} deshabilitado={guardando} alCambiar={setDesde} />}
          </Campo>
          <Campo
            etiqueta="Último día (inclusive)"
            requerido={modo !== SIN_MODO}
            error={invertido ? 'No puede ser anterior al primer día.' : undefined}
          >
            {(props) => <EntradaDia props={props} valor={hasta} deshabilitado={guardando} alCambiar={setHasta} />}
          </Campo>
        </div>

        <p className="text-texto-sutil text-xs" role="status">{TEXTO_DE_ESTADO[estado]}</p>

        {errores.length > 0 && (
          <ul role="alert" className="text-texto-peligro list-disc pl-5 text-sm">
            {errores.map((linea) => <li key={linea}>{linea}</li>)}
          </ul>
        )}

        <div>
          <Boton
            variante="primario"
            cargando={guardando}
            disabled={!sucio || incompleto || invertido}
            onClick={() => { void guardar() }}
          >
            Guardar
          </Boton>
        </div>
      </div>
    </Seccion>
  )
}

/**
 * Campo de día con la máscara `DD/MM/AAAA`; hacia arriba sube `YYYY-MM-DD`, o el texto a medio escribir
 * (que no pasa el formato y deja el botón sin guardar). Mismo criterio que el de los formularios de
 * recursos: nunca un `<input type="date">`, que ordena según el idioma del sistema operativo.
 */
function EntradaDia (
  { props, valor, deshabilitado, alCambiar }: {
    props: Parameters<Parameters<typeof Campo>[0]['children']>[0]
    valor: string
    deshabilitado: boolean
    alCambiar: (valor: string) => void
  }
): ReactElement {
  const [texto, setTexto] = useState(() => aFechaLocal(valor))

  return (
    <Entrada
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="DD/MM/AAAA"
      maxLength={10}
      value={texto}
      disabled={deshabilitado}
      onChange={(evento) => {
        const escrito = enmascararFechaLocal(evento.target.value)

        setTexto(escrito)
        // Vacío es válido (apaga la fecha); a medio escribir sube crudo y no pasa el formato.
        alCambiar(escrito === '' ? '' : aFechaDelContrato(escrito) ?? escrito)
      }}
    />
  )
}
