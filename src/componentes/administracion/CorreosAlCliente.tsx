'use client'

import { useId, useMemo, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Seccion } from '@/componentes/presentadores/Ficha'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { nombrar } from '@/dominio/glosario'
import type { ConfiguracionCorreo as ConfiguracionCorreoTipo } from '@/datos/recursos'

interface PropsCorreosAlCliente {
  inicial: ConfiguracionCorreoTipo
}

/**
 * Qué correos pueden llegarle a un contacto, uno por uno.
 *
 * Es la perilla fina que va debajo del interruptor de tres posiciones: aquel decide si sale algo,
 * esta decide cuáles de los correos al cliente salen cuando sale. Con el modo en «apagado» o
 * «prueba» estas casillas no hacen nada, y la pantalla lo dice en vez de dejar creer lo contrario.
 *
 * El catálogo lo escribe el backend (`modules/api/Correo/CatalogoAlCliente.php`) y esta pantalla no
 * inventa ni un nombre: dibuja lo que llega, agrupado como llega.
 */
export function CorreosAlCliente ({ inicial }: PropsCorreosAlCliente): ReactElement {
  const idAyuda = useId()
  const [catalogo, setCatalogo] = useState(inicial.client_email_catalog)
  const [guardados, setGuardados] = useState<string[]>(inicial.client_emails_allowed)
  const [marcados, setMarcados] = useState<string[]>(inicial.client_emails_allowed)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const todos = useMemo(
    () => catalogo.flatMap((grupo) => grupo.correos.map((correo) => correo.slug)),
    [catalogo]
  )

  const sucio = marcados.length !== guardados.length ||
    marcados.some((slug) => !guardados.includes(slug))

  /** Marca o desmarca un correo. */
  function alternar (slug: string): void {
    setMarcados((previos) => previos.includes(slug)
      ? previos.filter((otro) => otro !== slug)
      : [...previos, slug])
  }

  /** Marca o desmarca un grupo entero: si ya está completo, lo vacía. */
  function alternarGrupo (slugs: string[]): void {
    const completo = slugs.every((slug) => marcados.includes(slug))

    setMarcados((previos) => completo
      ? previos.filter((slug) => !slugs.includes(slug))
      : [...new Set([...previos, ...slugs])])
  }

  /**
   * Guarda la lista. Se manda como arreglo aunque estén todos marcados: es el backend el que decide
   * que eso se guarda como «todos» y no una enumeración, para que un correo nuevo del catálogo
   * herede el permiso en vez de nacer callado.
   */
  async function guardar (): Promise<void> {
    setGuardando(true)
    setError(null)

    const resultado = await escribirEnBff<ConfiguracionCorreoTipo>(
      'notifications/settings',
      'PUT',
      { client_emails_allowed: marcados }
    )

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    setCatalogo(resultado.datos.client_email_catalog)
    setGuardados(resultado.datos.client_emails_allowed)
    setMarcados(resultado.datos.client_emails_allowed)
  }

  return (
    <Seccion titulo={'Qué correos le llegan al ' + nombrar('cliente')}>
      <div className="flex flex-col gap-4">
        <p id={idAyuda} className="text-texto-tenue text-sm">
          Lista blanca: solo sale lo marcado. Lo que no está en esta lista no es correo al{' '}
          {nombrar('cliente')} y lo gobierna el interruptor de arriba.
          {inicial.email_mode !== 'real' && (
            <> Hoy el modo es <strong>{inicial.email_mode}</strong>, así que no sale ninguno igual.</>
          )}
        </p>

        <div className="flex items-center gap-2">
          <Insignia tono={marcados.length === 0 ? 'neutro' : 'acento'} tamano="chico">
            {marcados.length} de {todos.length} permitidos
          </Insignia>
          {guardados.length === todos.length && !sucio && (
            <span className="text-texto-sutil text-xs">Sale todo, como antes de esta pantalla</span>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {catalogo.map((grupo) => {
            const slugs = grupo.correos.map((correo) => correo.slug)
            const completo = slugs.every((slug) => marcados.includes(slug))

            return (
              <div key={grupo.grupo} className="border-linea rounded-tarjeta border p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-texto text-sm font-semibold">{grupo.grupo}</h3>
                  <button
                    type="button"
                    className="text-texto-tenue hover:text-texto text-xs underline"
                    onClick={() => { alternarGrupo(slugs) }}
                  >
                    {completo ? 'Quitar todos' : 'Marcar todos'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {grupo.correos.map((correo) => (
                    <label
                      key={correo.slug}
                      className="text-texto flex items-start gap-2 text-sm"
                      title={correo.slug}
                    >
                      <input
                        type="checkbox"
                        className={CLASES_CASILLA}
                        checked={marcados.includes(correo.slug)}
                        aria-describedby={idAyuda}
                        onChange={() => { alternar(correo.slug) }}
                      />
                      {correo.nombre}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

        <div className="flex items-center gap-3">
          <Boton
            variante="primario"
            cargando={guardando}
            disabled={!sucio}
            onClick={() => { void guardar() }}
          >
            Guardar
          </Boton>
          {!sucio && <span className="text-texto-sutil text-xs">Sin cambios</span>}
        </div>
      </div>
    </Seccion>
  )
}
