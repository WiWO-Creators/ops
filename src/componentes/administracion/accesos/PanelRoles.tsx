'use client'

import { useState } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import {
  CeldaEncabezado, CeldaTabla, CuerpoTabla, EncabezadoTabla, FilaTabla, Tabla
} from '@/componentes/datos/Tabla'
import { Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { motivoParaRechazarNombre } from '@/dominio/accesos'
import { CabeceraDePanel, DialogoConfirmar, MensajeDeError, SIN_VALOR } from './piezas'
import type { CatalogoDeAccesos, Escalon, RolDeAccesos } from '@/datos/accesos'

interface PropsPanelRoles {
  catalogo: CatalogoDeAccesos
  recargar: () => void
}

/**
 * Los roles de Perfex (`tblroles`) y a qué escalón mapea cada uno.
 *
 * El mapa es lo que hace que alguien recién creado tenga el acceso que le corresponde sin que nadie
 * le ponga un override: sin fila en `tblwiwo_nivel_persona`, el escalón lo decide el rol. Por eso un
 * rol sin escalón no es un error de datos sino gente que se queda en el piso más bajo, y la tabla lo
 * dice en vez de mostrar una celda vacía.
 *
 * El escalón se cambia en la propia fila y se escribe al elegirlo: es un solo campo con un dominio
 * cerrado, y meterlo en un diálogo sería un paso de más para cada uno de los veintitantos roles.
 */
export function PanelRoles ({ catalogo, recargar }: PropsPanelRoles) {
  const [editando, setEditando] = useState<{ rol: RolDeAccesos | null } | null>(null)
  const [borrando, setBorrando] = useState<RolDeAccesos | null>(null)
  const [enCurso, setEnCurso] = useState(false)
  const [errorFila, setErrorFila] = useState<string | null>(null)

  const escalones = [...catalogo.escalones].sort((uno, otro) => uno.orden - otro.orden)

  /** Cambia a qué escalón mapea un rol. Escribe solo esa clave. */
  async function mapear (rol: RolDeAccesos, escalon: string | null): Promise<void> {
    setEnCurso(true)
    setErrorFila(null)

    const resultado = await escribirEnBff(`accesos/roles/${rol.id}`, 'PUT', { escalon })

    setEnCurso(false)

    if (!resultado.ok) {
      setErrorFila(resultado.mensaje)

      return
    }

    recargar()
  }

  /** Borra el rol elegido. La API responde 409 si tiene personas. */
  async function borrar (): Promise<void> {
    if (borrando === null) return

    setEnCurso(true)
    setErrorFila(null)

    const resultado = await escribirEnBff(`accesos/roles/${borrando.id}`, 'DELETE')

    setEnCurso(false)

    if (!resultado.ok) {
      setErrorFila(resultado.mensaje)

      return
    }

    setBorrando(null)
    recargar()
  }

  return (
    <div className="flex flex-col gap-4">
      <CabeceraDePanel
        titulo="Roles"
        descripcion="Los roles de Perfex y el escalón que le dan a quien los tenga. Es lo que decide el acceso de alguien recién creado, antes de que nadie le ponga nada a mano."
        accion={
          <Boton variante="primario" onClick={() => { setEditando({ rol: null }) }}>
            Nuevo rol
          </Boton>
        }
      />

      {errorFila !== null && <MensajeDeError>{errorFila}</MensajeDeError>}

      {catalogo.roles.length === 0
        ? (
          <Vacio
            titulo="No hay roles"
            descripcion="Esta instalación no tiene ningún rol cargado. Sin roles, cada persona depende por completo de su matriz de permisos."
          />
          )
        : (
          <div className="overflow-x-auto">
            <Tabla>
              <EncabezadoTabla>
                <tr>
                  <CeldaEncabezado>Rol</CeldaEncabezado>
                  <CeldaEncabezado>Escalón que otorga</CeldaEncabezado>
                  <CeldaEncabezado numerica angosta>Personas</CeldaEncabezado>
                  <CeldaEncabezado angosta>Acciones</CeldaEncabezado>
                </tr>
              </EncabezadoTabla>
              <CuerpoTabla>
                {catalogo.roles.map((rol) => (
                  <FilaTabla key={rol.id}>
                    <CeldaTabla>{rol.nombre}</CeldaTabla>

                    <CeldaTabla>
                      <SelectorDeEscalon
                        escalones={escalones}
                        valor={rol.escalon}
                        deshabilitado={enCurso}
                        etiqueta={`Escalón de ${rol.nombre}`}
                        onCambiar={(escalon) => { void mapear(rol, escalon) }}
                      />
                    </CeldaTabla>

                    <CeldaTabla numerica>{rol.personas}</CeldaTabla>

                    <CeldaTabla angosta>
                      <span className="flex gap-1">
                        <Boton variante="sutil" tamano="chico" onClick={() => { setEditando({ rol }) }}>
                          Renombrar
                        </Boton>
                        <Boton
                          variante="sutil"
                          tamano="chico"
                          onClick={() => { setErrorFila(null); setBorrando(rol) }}
                        >
                          Borrar
                        </Boton>
                      </span>
                    </CeldaTabla>
                  </FilaTabla>
                ))}
              </CuerpoTabla>
            </Tabla>
          </div>
          )}

      {editando !== null && (
        <DialogoDeRol
          rol={editando.rol}
          roles={catalogo.roles}
          escalones={escalones}
          cerrar={() => { setEditando(null) }}
          alGuardar={() => { setEditando(null); recargar() }}
        />
      )}

      <DialogoConfirmar
        abierto={borrando !== null}
        titulo={`Borrar el rol «${borrando?.nombre ?? ''}»`}
        descripcion="Solo se puede borrar un rol que no tenga a nadie. Si tiene personas, la API lo rechaza y hay que moverlas primero."
        etiquetaConfirmar="Borrar el rol"
        peligroso
        enCurso={enCurso}
        error={errorFila}
        onConfirmar={() => { void borrar() }}
        onCerrar={() => { setBorrando(null) }}
      />
    </div>
  )
}

/** Desplegable de escalones con la opción de no mapear ninguno. */
function SelectorDeEscalon ({
  escalones, valor, deshabilitado, etiqueta, onCambiar, id
}: {
  escalones: Escalon[]
  valor: string | null
  deshabilitado: boolean
  etiqueta: string
  onCambiar: (escalon: string | null) => void
  id?: string
}) {
  return (
    <Selector
      value={valor ?? SIN_VALOR}
      disabled={deshabilitado}
      onValueChange={(elegido) => { onCambiar(elegido === SIN_VALOR ? null : elegido) }}
    >
      <DisparadorSelector marcador="Sin escalón" id={id} aria-label={etiqueta} />
      <ContenidoSelector>
        <Opcion value={SIN_VALOR}>Sin escalón</Opcion>
        {escalones.map((escalon) => (
          <Opcion key={escalon.clave} value={escalon.clave}>{escalon.nombre}</Opcion>
        ))}
      </ContenidoSelector>
    </Selector>
  )
}

/** Alta y renombre de un rol. El escalón se elige acá al crear, y en la tabla después. */
function DialogoDeRol ({
  rol, roles, escalones, cerrar, alGuardar
}: {
  rol: RolDeAccesos | null
  roles: RolDeAccesos[]
  escalones: Escalon[]
  cerrar: () => void
  alGuardar: () => void
}) {
  const [nombre, setNombre] = useState(rol?.nombre ?? '')
  const [escalon, setEscalon] = useState<string | null>(rol?.escalon ?? null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const otros = roles.filter((otro) => otro.id !== rol?.id).map((otro) => otro.nombre)
  const motivo = motivoParaRechazarNombre(nombre, otros)

  /** Manda el alta o el renombre. Al renombrar solo viaja `nombre`. */
  async function guardar (): Promise<void> {
    if (motivo !== null) {
      setError(motivo)

      return
    }

    setGuardando(true)
    setError(null)

    const resultado = rol === null
      ? await escribirEnBff('accesos/roles', 'POST', { nombre: nombre.trim(), escalon })
      : await escribirEnBff(`accesos/roles/${rol.id}`, 'PUT', { nombre: nombre.trim() })

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
        titulo={rol === null ? 'Nuevo rol' : `Renombrar «${rol.nombre}»`}
        descripcion={
          rol === null
            ? 'El rol se crea en Perfex y, si le das un escalón, todo el que lo tenga lo hereda.'
            : 'Solo cambia cómo se llama. El escalón se cambia en la tabla, y la gente que lo tiene no se mueve.'
        }
      >
        <form
          onSubmit={(evento) => { evento.preventDefault(); void guardar() }}
          className="flex flex-col gap-5"
        >
          <Campo etiqueta="Nombre" requerido>
            {(props) => (
              <Entrada
                {...props}
                value={nombre}
                maxLength={80}
                disabled={guardando}
                onChange={(evento) => { setNombre(evento.target.value); setError(null) }}
              />
            )}
          </Campo>

          {rol === null && (
            <Campo etiqueta="Escalón que otorga" ayuda="Se puede dejar sin escalón y decidirlo después.">
              {(props) => (
                <SelectorDeEscalon
                  escalones={escalones}
                  valor={escalon}
                  deshabilitado={guardando}
                  etiqueta="Escalón que otorga el rol"
                  onCambiar={setEscalon}
                  id={props.id}
                />
              )}
            </Campo>
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
