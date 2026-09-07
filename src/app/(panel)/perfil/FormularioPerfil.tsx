'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { escribirEnBff, subirArchivoEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Filas, Seccion } from '@/componentes/presentadores/Ficha'
import type { Yo } from '@/datos/tipos'

/** Respuesta de `GET|PATCH /me/perfil` y de `POST /me/foto` (`controllers/V1.php:4132`). */
export interface PerfilPropio {
  email_signature: string
  profile_image_url: string | null
}

/**
 * Lo que acepta `handle_staff_profile_image_upload()` (`upload_helper.php:951`), ni mas ni menos.
 *
 * WebP NO esta: el helper del panel recorta con GD contra una lista de tres extensiones y la API
 * valida contra esa misma lista antes de llamarlo. Ofrecerlo aca solo produciria un 422.
 */
const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png']
const EXTENSIONES_ACEPTADAS = ['jpg', 'jpeg', 'png']

/**
 * Tope propio, mas chico que el de PHP.
 *
 * El servidor tambien rechaza por tamaño (`upload_max_filesize`), pero recien despues de haber
 * subido el archivo entero. Cortarlo aca ahorra el viaje y da un mensaje que dice el limite, en vez
 * del 422 generico del servidor.
 */
const LIMITE_BYTES = 5 * 1024 * 1024

/** Largo maximo de la firma segun `Escritura\Staff::LARGO_MAXIMO_FIRMA`. */
const LARGO_MAXIMO_FIRMA = 5000

/**
 * Revisa el archivo elegido contra lo que la API va a aceptar.
 *
 * Se miran las dos cosas —tipo MIME y extension— porque ninguna alcanza sola: el backend decide por
 * la extension del nombre, asi que un PNG renombrado a `.gif` pasaria el filtro de MIME y fallaria
 * alla; y un archivo sin extension reconocible puede traer un MIME correcto que el backend igual
 * rechaza.
 *
 * @param archivo el archivo que eligio la persona
 * @returns el motivo del rechazo, o `null` si sirve
 */
function motivoDeRechazo (archivo: File): string | null {
  const extension = archivo.name.split('.').pop()?.toLowerCase() ?? ''

  if (!TIPOS_ACEPTADOS.includes(archivo.type) || !EXTENSIONES_ACEPTADAS.includes(extension)) {
    return 'La foto tiene que ser una imagen JPG o PNG.'
  }

  if (archivo.size > LIMITE_BYTES) {
    return 'La foto no puede superar 5 MB.'
  }

  return null
}

interface PropsFormularioPerfil {
  yo: Yo
  perfil: PerfilPropio
}

/**
 * Perfil propio: la foto y la firma de correo.
 *
 * Nombre, apellido y correo se muestran pero **no se editan**: `PATCH /me/perfil`
 * (`Escritura\Staff::editarFirmaPropia()`) solo escribe `email_signature`, y el unico camino que
 * escribe los datos de identidad es `PATCH /staff/{id}`, que exige el permiso `staff.edit`. Ofrecer
 * unos campos que van a volver 422 seria peor que decir donde se cambian.
 *
 * La foto y la firma se guardan por separado, con un boton cada una: son dos endpoints distintos
 * —uno multipart y otro JSON— y juntarlos en un solo "Guardar" obligaria a decidir que hacer cuando
 * uno funciona y el otro no.
 */
export function FormularioPerfil ({ yo, perfil }: PropsFormularioPerfil) {
  const router = useRouter()
  const entradaArchivo = useRef<HTMLInputElement>(null)

  const [foto, establecerFoto] = useState(perfil.profile_image_url)
  const [elegida, establecerElegida] = useState<File | null>(null)
  const [previa, establecerPrevia] = useState<string | null>(null)
  const [subiendo, establecerSubiendo] = useState(false)
  const [errorFoto, establecerErrorFoto] = useState<string | null>(null)
  const [fotoGuardada, establecerFotoGuardada] = useState(false)

  const [firma, establecerFirma] = useState(perfil.email_signature)
  // La ultima firma que la API confirmo. Es lo que decide si hay algo que guardar: comparar contra
  // la prop no sirve, porque despues del primer guardado esa prop se queda en el valor viejo hasta
  // la proxima navegacion.
  const [firmaConfirmada, establecerFirmaConfirmada] = useState(perfil.email_signature)
  const [guardandoFirma, establecerGuardandoFirma] = useState(false)
  const [errorFirma, establecerErrorFirma] = useState<string | null>(null)
  const [firmaGuardada, establecerFirmaGuardada] = useState(false)

  // Una URL de objeto ocupa memoria hasta que se revoca, y aca se crea una por cada archivo que la
  // persona prueba. Se libera al reemplazarla y al desmontar la pantalla.
  useEffect(() => {
    if (previa === null) return

    return () => { URL.revokeObjectURL(previa) }
  }, [previa])

  /** Valida el archivo elegido y arma la vista previa. No sube nada todavia. */
  function elegir (evento: ChangeEvent<HTMLInputElement>): void {
    const archivo = evento.target.files?.[0] ?? null

    // El input se vacia siempre: sin esto, volver a elegir el MISMO archivo no dispara `change` y la
    // persona ve que su clic no hace nada.
    evento.target.value = ''

    establecerFotoGuardada(false)

    if (archivo === null) return

    const motivo = motivoDeRechazo(archivo)

    if (motivo !== null) {
      establecerErrorFoto(motivo)
      establecerElegida(null)
      establecerPrevia(null)
      return
    }

    establecerErrorFoto(null)
    establecerElegida(archivo)
    establecerPrevia(URL.createObjectURL(archivo))
  }

  /** Descarta la eleccion y vuelve a mostrar la foto que hay guardada. */
  function descartar (): void {
    establecerElegida(null)
    establecerPrevia(null)
    establecerErrorFoto(null)
  }

  /** Sube la foto elegida y actualiza la cabecera con la que devuelve la API. */
  async function subir (): Promise<void> {
    if (elegida === null) return

    establecerSubiendo(true)
    establecerErrorFoto(null)
    establecerFotoGuardada(false)

    const resultado = await subirArchivoEnBff<PerfilPropio>('me/foto', elegida, 'profile_image')

    establecerSubiendo(false)

    if (!resultado.ok) {
      establecerErrorFoto(resultado.mensaje)
      return
    }

    // La API devuelve el perfil ya reescrito: el nombre del archivo es unico por subida, asi que la
    // URL nueva nunca colisiona con la que el navegador tenga cacheada.
    establecerFoto(resultado.datos.profile_image_url)
    establecerElegida(null)
    establecerPrevia(null)
    establecerFotoGuardada(true)

    // El avatar de la cabecera lo pinta el layout con `GET /me`, que corre en el servidor: refrescar
    // el arbol es lo que lo actualiza sin que nadie recargue la pagina a mano.
    router.refresh()
  }

  /** Guarda la firma de correo. */
  async function guardarFirma (): Promise<void> {
    if (firma.length > LARGO_MAXIMO_FIRMA) {
      establecerErrorFirma(`La firma no puede superar ${LARGO_MAXIMO_FIRMA} caracteres.`)
      return
    }

    establecerGuardandoFirma(true)
    establecerErrorFirma(null)
    establecerFirmaGuardada(false)

    const resultado = await escribirEnBff<PerfilPropio>('me/perfil', 'PATCH', { email_signature: firma })

    establecerGuardandoFirma(false)

    if (!resultado.ok) {
      establecerErrorFirma(resultado.mensaje)
      return
    }

    // Se adopta lo que devolvio la API y no lo que se tecleo: `editarFirmaPropia()` pasa el texto
    // plano por `nl2br_save_html()`, asi que lo guardado trae `<br />` donde habia saltos de linea.
    // Mostrar el texto original dejaria el campo diciendo algo distinto de lo que hay en la base, y
    // al recargar la pantalla el valor cambiaria solo.
    establecerFirma(resultado.datos.email_signature)
    establecerFirmaConfirmada(resultado.datos.email_signature)
    establecerFirmaGuardada(true)
  }

  const mostrada = previa ?? foto

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <h1 className="text-texto font-titular text-xl font-extrabold">Mi perfil</h1>

      <Seccion titulo="Foto">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar
            nombre={yo.full_name}
            imagen={mostrada}
            className="size-20 text-2xl"
          />

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* `sr-only` y no `hidden`: un input oculto con `display:none` deja de ser enfocable,
                  y con el se puede llegar al selector de archivo con el teclado. */}
              <input
                ref={entradaArchivo}
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                aria-label="Elegir una foto de perfil"
                onChange={elegir}
              />
              <Boton
                tamano="chico"
                disabled={subiendo}
                onClick={() => { entradaArchivo.current?.click() }}
              >
                {foto === null ? 'Elegir foto' : 'Cambiar foto'}
              </Boton>

              {elegida !== null && (
                <>
                  <Boton variante="primario" tamano="chico" cargando={subiendo} onClick={() => { void subir() }}>
                    Guardar foto
                  </Boton>
                  <Boton variante="sutil" tamano="chico" disabled={subiendo} onClick={descartar}>
                    Descartar
                  </Boton>
                </>
              )}
            </div>

            {elegida !== null
              ? <p className="text-texto-tenue truncate text-xs">Vista previa de {elegida.name}. Todavía no se guardó.</p>
              : <p className="text-texto-sutil text-xs">JPG o PNG, hasta 5 MB.</p>}

            {errorFoto !== null && <p role="alert" className="text-texto-peligro text-xs">{errorFoto}</p>}
            {fotoGuardada && <p role="status" className="text-texto-exito text-xs">Foto actualizada.</p>}
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Tus datos">
        <Filas
          datos={[
            { etiqueta: 'Nombre', valor: yo.firstname === '' ? '—' : yo.firstname },
            { etiqueta: 'Apellido', valor: yo.lastname === '' ? '—' : yo.lastname },
            { etiqueta: 'Correo', valor: yo.email === '' ? '—' : yo.email }
          ]}
        />
        <p className="text-texto-sutil text-xs">
          Estos datos los cambia quien administra el equipo: la API solo deja editar la propia foto y
          la propia firma de correo.
        </p>
      </Seccion>

      <Seccion titulo="Firma de correo">
        <Campo
          etiqueta="Firma"
          ayuda="Se agrega al pie de los correos que salen a tu nombre desde el panel."
          error={errorFirma ?? undefined}
        >
          {(props) => (
            <AreaTexto
              {...props}
              value={firma}
              maxLength={LARGO_MAXIMO_FIRMA}
              disabled={guardandoFirma}
              placeholder="Todavía no tenés firma."
              onChange={(evento) => {
                establecerFirma(evento.target.value)
                establecerFirmaGuardada(false)
              }}
            />
          )}
        </Campo>

        <div className="flex items-center gap-3">
          <Boton
            variante="primario"
            tamano="chico"
            cargando={guardandoFirma}
            disabled={firma === firmaConfirmada}
            onClick={() => { void guardarFirma() }}
          >
            Guardar firma
          </Boton>
          {firmaGuardada && <span role="status" className="text-texto-exito text-xs">Firma guardada.</span>}
        </div>
      </Seccion>
    </div>
  )
}
