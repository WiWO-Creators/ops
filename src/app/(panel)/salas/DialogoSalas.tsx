'use client'

import { useState } from 'react'
import { Copy, Monitor, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoDialogo, Dialogo, DisparadorDialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { Sala } from '@/datos/recursos'

interface PropsDialogoSalas {
  salas: Sala[]
  onCambio: () => void
}

/** Formulario vacio de alta. */
const NUEVA = { name: '', capacity: '', location: '' }

/**
 * Administracion de salas. Solo para administradores.
 *
 * Es un dialogo y no una pantalla propia porque se usa dos veces al año: una sala nueva, o corregir
 * una capacidad. Darle ruta, tabla y detalle seria construir un modulo entero para eso.
 *
 * La baja es logica del lado de la API, asi que el boton dice "Dar de baja" y no "Eliminar": la sala
 * desaparece de la agenda pero sus reservas historicas siguen teniendo nombre.
 */
export function DialogoSalas ({ salas, onCambio }: PropsDialogoSalas) {
  const [alta, setAlta] = useState(NUEVA)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Corre una escritura y refresca, dejando el error a la vista si falla.
   *
   * @param operacion la escritura a ejecutar
   */
  async function correr (operacion: () => Promise<{ ok: boolean, mensaje?: string }>): Promise<void> {
    setOcupado(true)
    setError(null)

    const resultado = await operacion()

    setOcupado(false)

    if (!resultado.ok) {
      setError(resultado.mensaje ?? 'No se pudo guardar.')
      return
    }

    onCambio()
  }

  const capacidad = Number(alta.capacity)
  const altaValida = alta.name.trim() !== '' && Number.isInteger(capacidad) && capacidad >= 1

  return (
    <Dialogo>
      <DisparadorDialogo asChild>
        <Boton variante="secundario" tamano="chico">Administrar salas</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo="Salas"
        descripcion="Capacidad, ubicación y la pantalla que va colgada en la puerta."
        ancho="grande"
      >
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {salas.map((sala) => (
              <FilaSala
                key={sala.id}
                sala={sala}
                ocupado={ocupado}
                onEditar={(cambios) => { void correr(async () => await escribirEnBff(`rooms/${sala.id}`, 'PATCH', cambios)) }}
                onBaja={() => { void correr(async () => await escribirEnBff(`rooms/${sala.id}`, 'DELETE')) }}
              />
            ))}
            {salas.length === 0 && (
              <li className="text-texto-tenue py-4 text-center text-sm">Todavía no hay salas cargadas.</li>
            )}
          </ul>

          <div className="border-linea flex flex-col gap-3 border-t pt-4">
            <p className="text-texto text-sm font-medium">Sala nueva</p>

            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr]">
              <Campo etiqueta="Nombre" requerido>
                {(props) => (
                  <Entrada
                    {...props}
                    value={alta.name}
                    placeholder="Insight"
                    onChange={(evento) => setAlta({ ...alta, name: evento.target.value })}
                  />
                )}
              </Campo>
              <Campo etiqueta="Capacidad" requerido>
                {(props) => (
                  <Entrada
                    {...props}
                    type="number"
                    min={1}
                    max={500}
                    value={alta.capacity}
                    onChange={(evento) => setAlta({ ...alta, capacity: evento.target.value })}
                  />
                )}
              </Campo>
              <Campo etiqueta="Ubicación">
                {(props) => (
                  <Entrada
                    {...props}
                    value={alta.location}
                    placeholder="Piso 2"
                    onChange={(evento) => setAlta({ ...alta, location: evento.target.value })}
                  />
                )}
              </Campo>
            </div>

            <Boton
              variante="primario"
              tamano="chico"
              className="self-start"
              cargando={ocupado}
              disabled={!altaValida}
              onClick={() => {
                void correr(async () => {
                  const resultado = await escribirEnBff('rooms', 'POST', {
                    name: alta.name.trim(),
                    capacity: capacidad,
                    location: alta.location.trim() === '' ? null : alta.location.trim()
                  })

                  if (resultado.ok) setAlta(NUEVA)

                  return resultado
                })
              }}
            >
              <Plus size={14} aria-hidden="true" />
              Agregar sala
            </Boton>
          </div>

          {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}

interface PropsFilaSala {
  sala: Sala
  ocupado: boolean
  onEditar: (cambios: Record<string, unknown>) => void
  onBaja: () => void
}

/**
 * Una sala en la lista de administracion.
 *
 * Los campos se guardan al salir del control (`onBlur`) y no con un boton por fila: son dos valores
 * cortos, y una fila con su propio "Guardar" multiplica los botones sin agregar nada.
 */
function FilaSala ({ sala, ocupado, onEditar, onBaja }: PropsFilaSala) {
  const [nombre, setNombre] = useState(sala.name)
  const [capacidad, setCapacidad] = useState(String(sala.capacity))
  const [copiado, setCopiado] = useState(false)

  const urlPantalla = sala.panel_token === undefined
    ? null
    : `${globalThis.location?.origin ?? ''}/sala/${sala.panel_token}`

  return (
    <li className="border-linea bg-superficie-elevada flex flex-wrap items-end gap-3 rounded-medio border p-3">
      <Campo etiqueta="Nombre" className="min-w-40 flex-1">
        {(props) => (
          <Entrada
            {...props}
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            onBlur={() => { if (nombre.trim() !== '' && nombre !== sala.name) onEditar({ name: nombre.trim() }) }}
          />
        )}
      </Campo>

      <Campo etiqueta="Capacidad" className="w-24">
        {(props) => (
          <Entrada
            {...props}
            type="number"
            min={1}
            max={500}
            value={capacidad}
            onChange={(evento) => setCapacidad(evento.target.value)}
            onBlur={() => {
              const valor = Number(capacidad)
              if (Number.isInteger(valor) && valor >= 1 && valor !== sala.capacity) onEditar({ capacity: valor })
            }}
          />
        )}
      </Campo>

      <div className="flex items-center gap-1">
        {urlPantalla !== null && (
          <>
            <Boton
              variante="sutil"
              tamano="chico"
              title="Copiar el enlace de la pantalla de puerta"
              onClick={() => {
                void navigator.clipboard.writeText(urlPantalla).then(() => {
                  setCopiado(true)
                  globalThis.setTimeout(() => setCopiado(false), 2000)
                })
              }}
            >
              {copiado ? <Copy size={14} aria-hidden="true" /> : <Monitor size={14} aria-hidden="true" />}
              {copiado ? 'Copiado' : 'Pantalla'}
            </Boton>

            <Boton
              variante="sutil"
              tamano="chico"
              soloIcono
              title="Rotar el enlace de la pantalla (el anterior deja de funcionar)"
              aria-label={`Rotar el enlace de pantalla de ${sala.name}`}
              disabled={ocupado}
              onClick={() => onEditar({ rotate_token: true })}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </Boton>
          </>
        )}

        <Boton
          variante="sutil"
          tamano="chico"
          soloIcono
          title="Dar de baja la sala"
          aria-label={`Dar de baja ${sala.name}`}
          disabled={ocupado}
          onClick={onBaja}
        >
          <Trash2 size={14} aria-hidden="true" className="text-texto-peligro" />
        </Boton>
      </div>
    </li>
  )
}
