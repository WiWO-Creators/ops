'use client'

import { useState } from 'react'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { Espacio } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import { TIPOS_DE_FACTURACION } from '@/definiciones/espacios'
import { GLOSARIO } from '@/dominio/glosario'
import { hoyLocal } from '@/lib/fechas'

/**
 * Alta y edicion de un Proyecto.
 *
 * Es un solo dialogo para las dos cosas porque son el mismo formulario con distinto verbo, pero **no
 * con los mismos campos**: el `PATCH` del contrato solo acepta `name`, `description`, `start_date`,
 * `deadline`, `estimated_hours` y `status`, y cualquier otra clave devuelve `422` en vez de
 * ignorarse. Por eso en edicion no se ofrecen cliente ni tipo de facturacion: un campo que se ve, se
 * escribe y no se guarda es peor que un campo ausente.
 */

interface PropsFormularioProyecto {
  /** `null` cierra el dialogo. `'nuevo'` abre el alta; un Espacio abre su edicion. */
  destino: Espacio | 'nuevo' | null
  clientes: OpcionFiltro[]
  /** Estados de Proyecto de `/lookups`. */
  estados: OpcionFiltro[]
  onCerrar: () => void
  /** Se llama cuando el guardado salio bien. */
  onGuardado: () => void
}

export function FormularioProyecto ({ destino, clientes, estados, onCerrar, onGuardado }: PropsFormularioProyecto) {
  if (destino === null) return null

  const esAlta = destino === 'nuevo'

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo={esAlta ? `Nuevo ${GLOSARIO.espacio.singular.toLowerCase()}` : `Editar ${GLOSARIO.espacio.singular.toLowerCase()}`}
        descripcion={esAlta ? undefined : destino.name}
      >
        {/* `key` remonta el formulario al cambiar de destino: sin esto, editar un proyecto despues de
            otro arranca con los valores del anterior. */}
        <Campos
          key={esAlta ? 'nuevo' : destino.id}
          espacio={esAlta ? null : destino}
          clientes={clientes}
          estados={estados}
          onGuardado={onGuardado}
        />
      </ContenidoDialogo>
    </Dialogo>
  )
}

/** Cuerpo del dialogo. Separado para que el `key` lo remonte con el estado en cero. */
function Campos ({
  espacio,
  clientes,
  estados,
  onGuardado
}: {
  espacio: Espacio | null
  clientes: OpcionFiltro[]
  estados: OpcionFiltro[]
  onGuardado: () => void
}) {
  const esAlta = espacio === null

  const [nombre, setNombre] = useState(espacio?.name ?? '')
  const [cliente, setCliente] = useState(espacio?.client === null || espacio === null ? '' : String(espacio.client.id))
  const [estado, setEstado] = useState(String(espacio?.status ?? 2))
  const [facturacion, setFacturacion] = useState(String(espacio?.billing_type ?? 1))
  const [inicio, setInicio] = useState(espacio?.start_date ?? hoyLocal())
  const [entrega, setEntrega] = useState(espacio?.deadline ?? '')
  const [horas, setHoras] = useState(espacio?.estimated_hours === null || espacio === null ? '' : String(espacio.estimated_hours))
  const [descripcion, setDescripcion] = useState(espacio?.description ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Guarda el proyecto.
   *
   * En alta manda todo; en edicion manda solo lo que el `PATCH` acepta. `estimated_hours` viaja como
   * numero o como `null`: una cadena vacia la API la lee como cero, y cero horas estimadas no es lo
   * mismo que no haberlas estimado.
   */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()

    if (nombre.trim() === '') {
      setError('El nombre es obligatorio.')
      return
    }

    if (esAlta && cliente === '') {
      setError(`Elige un ${GLOSARIO.cliente.singular.toLowerCase()}.`)
      return
    }

    const comunes = {
      name: nombre.trim(),
      description: descripcion,
      start_date: inicio === '' ? null : inicio,
      deadline: entrega === '' ? null : entrega,
      estimated_hours: horas === '' ? null : Number(horas),
      status: Number(estado)
    }

    setEnviando(true)
    setError(null)

    const resultado = esAlta
      ? await escribirEnBff('projects', 'POST', {
        ...comunes,
        clientid: Number(cliente),
        billing_type: Number(facturacion)
      })
      : await escribirEnBff(`projects/${espacio.id}`, 'PATCH', comunes)

    setEnviando(false)

    if (resultado.ok) {
      onGuardado()
      return
    }

    setError(resultado.mensaje)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(evento) => { void guardar(evento) }}>
      <Campo etiqueta="Nombre" requerido>
        {(props) => <Entrada {...props} value={nombre} onChange={(e) => { setNombre(e.target.value) }} />}
      </Campo>

      {esAlta && (
        <>
          <Campo etiqueta={GLOSARIO.cliente.singular} requerido>
            {(props) => (
              <Selector value={cliente} onValueChange={setCliente}>
                <DisparadorSelector id={props.id} marcador="Elige un cliente" />
                <ContenidoSelector>
                  {clientes.map((opcion) => (
                    <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <Campo etiqueta="Tipo de facturación">
            {(props) => (
              <Selector value={facturacion} onValueChange={setFacturacion}>
                <DisparadorSelector id={props.id} />
                <ContenidoSelector>
                  {TIPOS_DE_FACTURACION.map((opcion) => (
                    <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>
        </>
      )}

      <Campo etiqueta="Estado">
        {(props) => (
          <Selector value={estado} onValueChange={setEstado}>
            <DisparadorSelector id={props.id} />
            <ContenidoSelector>
              {estados.map((opcion) => (
                <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha de inicio">
          {(props) => <Entrada {...props} type="date" value={inicio} onChange={(e) => { setInicio(e.target.value) }} />}
        </Campo>
        <Campo etiqueta="Fecha de entrega">
          {(props) => (
            <Entrada {...props} type="date" value={entrega} min={inicio} onChange={(e) => { setEntrega(e.target.value) }} />
          )}
        </Campo>
      </div>

      <Campo etiqueta="Horas estimadas" ayuda="Déjalo vacío si todavía no se estimó.">
        {(props) => (
          <Entrada
            {...props}
            type="number"
            min={0}
            step="0.5"
            value={horas}
            onChange={(e) => { setHoras(e.target.value) }}
          />
        )}
      </Campo>

      <Campo etiqueta="Descripción">
        {(props) => (
          <AreaTexto {...props} rows={4} value={descripcion} onChange={(e) => { setDescripcion(e.target.value) }} />
        )}
      </Campo>

      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <CerrarDialogo asChild>
          <Boton variante="sutil">Cancelar</Boton>
        </CerrarDialogo>
        <Boton type="submit" variante="primario" cargando={enviando}>
          {esAlta ? 'Crear' : 'Guardar'}
        </Boton>
      </div>
    </form>
  )
}
