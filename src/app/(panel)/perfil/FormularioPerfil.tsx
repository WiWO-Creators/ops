'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { escribirEnBff, subirArchivoEnBff } from '@/componentes/datos/mutaciones'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Seccion } from '@/componentes/presentadores/Ficha'
import type { Yo } from '@/datos/tipos'

/** Respuesta de `GET|PATCH /me/perfil` y de `POST /me/foto` (`controllers/V1.php:4132`). */
export interface PerfilPropio {
  email_signature: string
  profile_image_url: string | null
}

/**
 * `GET /me` mas el telefono.
 *
 * `phonenumber` sale de `presentarStaff()` pero no esta en el tipo `Yo` compartido: solo esta
 * pantalla lo necesita, y el resto del panel no tiene por que arrastrar un campo que no muestra.
 */
export type YoConTelefono = Yo & { phonenumber: string | null }

/**
 * Largos maximos de `Escritura\Staff::PERFIL_PROPIO_EDITABLE`, que son los de las columnas de
 * `tblstaff`. Se repiten aca para avisar antes del viaje, no para reemplazar la validacion del
 * servidor: la unica que manda es la de alla.
 */
const LARGOS = { firstname: 50, lastname: 50, email: 100, phonenumber: 30 } as const

type ClaveDato = keyof typeof LARGOS
type Datos = Record<ClaveDato, string>

/**
 * Revisa los datos de identidad con las mismas reglas que aplica `editarPerfilPropio()`.
 *
 * El correo se mira con una expresion floja a proposito: replicar `FILTER_VALIDATE_EMAIL` en el
 * navegador solo lograria rechazar direcciones que el servidor si acepta. Aca alcanza con atajar lo
 * obviamente mal escrito.
 *
 * @param datos lo que hay en el formulario
 * @returns un mensaje por campo invalido; vacio si todo sirve
 */
function erroresDe (datos: Datos): Partial<Record<ClaveDato, string>> {
  const errores: Partial<Record<ClaveDato, string>> = {}

  const etiquetas: Record<ClaveDato, string> = {
    firstname: 'El nombre',
    lastname: 'El apellido',
    email: 'El correo',
    phonenumber: 'El teléfono'
  }

  for (const clave of Object.keys(LARGOS) as ClaveDato[]) {
    const valor = datos[clave].trim()

    if (valor === '') {
      // El telefono es el unico opcional: la columna admite NULL y hay fichas sin telefono.
      if (clave !== 'phonenumber') errores[clave] = `${etiquetas[clave]} no puede quedar vacío.`
      continue
    }

    if (valor.length > LARGOS[clave]) {
      errores[clave] = `${etiquetas[clave]} no puede superar ${LARGOS[clave]} caracteres.`
    }
  }

  if (errores.email === undefined && datos.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email.trim())) {
    errores.email = 'Ese correo no tiene un formato válido.'
  }

  return errores
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
  yo: YoConTelefono
  perfil: PerfilPropio
}

/**
 * Perfil propio: la foto, los datos de identidad y la firma de correo.
 *
 * Nombre, apellido, correo y telefono se editan contra `PATCH /me/perfil`
 * (`Escritura\Staff::editarPerfilPropio()`), que escribe sobre el staff del token y no acepta ningun
 * id: no hace falta el permiso `staff.edit` porque editar lo propio no es administrar gente.
 *
 * Cada bloque se guarda por separado, con su propio boton: son tres endpoints distintos —uno
 * multipart y dos JSON— y juntarlos en un solo "Guardar" obligaria a decidir que hacer cuando uno
 * funciona y el otro no.
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

  const inicialDatos: Datos = {
    firstname: yo.firstname,
    lastname: yo.lastname,
    email: yo.email,
    phonenumber: yo.phonenumber ?? ''
  }

  const [datos, establecerDatos] = useState<Datos>(inicialDatos)
  // Lo ultimo que la API confirmo. Igual que con la firma: comparar contra la prop no sirve, porque
  // despues del primer guardado se queda en el valor viejo hasta la proxima navegacion.
  const [datosConfirmados, establecerDatosConfirmados] = useState<Datos>(inicialDatos)
  const [erroresDatos, establecerErroresDatos] = useState<Partial<Record<ClaveDato, string>>>({})
  const [guardandoDatos, establecerGuardandoDatos] = useState(false)
  const [errorDatos, establecerErrorDatos] = useState<string | null>(null)
  const [datosGuardados, establecerDatosGuardados] = useState(false)

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

  /** Escribe un campo de identidad y borra los errores y el aviso de guardado que ya no aplican. */
  function cambiarDato (clave: ClaveDato, valor: string): void {
    establecerDatos((previos) => ({ ...previos, [clave]: valor }))
    establecerErroresDatos((previos) => ({ ...previos, [clave]: undefined }))
    establecerErrorDatos(null)
    establecerDatosGuardados(false)
  }

  /** Guarda nombre, apellido, correo y telefono. */
  async function guardarDatos (): Promise<void> {
    const errores = erroresDe(datos)

    if (Object.keys(errores).length > 0) {
      establecerErroresDatos(errores)
      establecerErrorDatos(null)
      return
    }

    // Se manda lo recortado porque es lo que el servidor va a guardar: si despues se adoptara el
    // texto con espacios, el campo diria algo distinto de lo que quedo en la base.
    const recortados: Datos = {
      firstname: datos.firstname.trim(),
      lastname: datos.lastname.trim(),
      email: datos.email.trim(),
      phonenumber: datos.phonenumber.trim()
    }

    establecerGuardandoDatos(true)
    establecerErroresDatos({})
    establecerErrorDatos(null)
    establecerDatosGuardados(false)

    const resultado = await escribirEnBff<PerfilPropio>('me/perfil', 'PATCH', recortados)

    establecerGuardandoDatos(false)

    if (!resultado.ok) {
      establecerErrorDatos(resultado.mensaje)
      return
    }

    establecerDatos(recortados)
    establecerDatosConfirmados(recortados)
    establecerDatosGuardados(true)

    // El nombre y el avatar de la cabecera los pinta el layout con `GET /me`, que corre en el
    // servidor: refrescar el arbol es lo que los actualiza sin recargar la pagina a mano.
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

  const sinCambiosEnDatos = (Object.keys(LARGOS) as ClaveDato[])
    .every((clave) => datos[clave].trim() === datosConfirmados[clave])

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
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre" requerido error={erroresDatos.firstname}>
            {(props) => (
              <Entrada
                {...props}
                value={datos.firstname}
                maxLength={LARGOS.firstname}
                autoComplete="given-name"
                disabled={guardandoDatos}
                onChange={(evento) => { cambiarDato('firstname', evento.target.value) }}
              />
            )}
          </Campo>

          <Campo etiqueta="Apellido" requerido error={erroresDatos.lastname}>
            {(props) => (
              <Entrada
                {...props}
                value={datos.lastname}
                maxLength={LARGOS.lastname}
                autoComplete="family-name"
                disabled={guardandoDatos}
                onChange={(evento) => { cambiarDato('lastname', evento.target.value) }}
              />
            )}
          </Campo>

          <Campo
            etiqueta="Correo"
            requerido
            ayuda="Es con lo que entrás al panel."
            error={erroresDatos.email}
          >
            {(props) => (
              <Entrada
                {...props}
                type="email"
                value={datos.email}
                maxLength={LARGOS.email}
                autoComplete="email"
                disabled={guardandoDatos}
                onChange={(evento) => { cambiarDato('email', evento.target.value) }}
              />
            )}
          </Campo>

          <Campo etiqueta="Teléfono" ayuda="Opcional." error={erroresDatos.phonenumber}>
            {(props) => (
              <Entrada
                {...props}
                type="tel"
                value={datos.phonenumber}
                maxLength={LARGOS.phonenumber}
                autoComplete="tel"
                disabled={guardandoDatos}
                onChange={(evento) => { cambiarDato('phonenumber', evento.target.value) }}
              />
            )}
          </Campo>
        </div>

        <div className="flex items-center gap-3">
          <Boton
            variante="primario"
            tamano="chico"
            cargando={guardandoDatos}
            disabled={sinCambiosEnDatos}
            onClick={() => { void guardarDatos() }}
          >
            Guardar datos
          </Boton>
          {datosGuardados && <span role="status" className="text-texto-exito text-xs">Datos guardados.</span>}
        </div>

        {errorDatos !== null && <p role="alert" className="text-texto-peligro text-xs">{errorDatos}</p>}
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
