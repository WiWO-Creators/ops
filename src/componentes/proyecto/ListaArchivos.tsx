import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Vacio } from '@/componentes/estado/Estados'
import type { ArchivoProyecto, MiembroEquipo } from '@/datos/recursos'

/**
 * Nombre de quien subio un archivo.
 *
 * @param staffId id del staff que consta en el adjunto
 * @param miembros equipo del proyecto, unica fuente de nombres a mano
 * @returns el nombre completo, o el id si esa persona ya no esta en el proyecto — pasa con gente que
 *          dejo la empresa, y mostrar el id es preferible a mostrar nada
 */
function subidoPor (staffId: number, miembros: MiembroEquipo[]): string {
  return miembros.find((miembro) => miembro.id === staffId)?.full_name ?? `#${staffId}`
}

/**
 * Enlace de apertura del archivo, cuando existe.
 *
 * Los adjuntos internos hoy no se pueden descargar: la API no expone el endpoint, asi que un boton
 * ahi seria un boton roto. Solo los externos —Drive, Dropbox— traen una `url` abrible.
 *
 * @param archivo el adjunto tal cual llega de la API
 * @returns el enlace, o la leyenda de no disponible
 */
function AccionArchivo ({ archivo }: { archivo: ArchivoProyecto }) {
  const externo = archivo.external !== null && archivo.external !== '' && archivo.url !== null

  if (!externo) return <span className="text-texto-sutil text-xs">No disponible para descarga</span>

  return (
    <a
      href={archivo.url ?? '#'}
      target="_blank"
      rel="noreferrer"
      className="text-acento text-xs font-semibold underline underline-offset-4"
    >
      Abrir en {archivo.external}
    </a>
  )
}

interface PropsListaArchivos {
  archivos: ArchivoProyecto[]
  miembros: MiembroEquipo[]
}

/**
 * Adjuntos del Proyecto.
 *
 * @param archivos los adjuntos ya cargados
 * @param miembros equipo del proyecto, para resolver `staff_id` a un nombre
 * @returns la lista, o el estado vacio si no hay adjuntos
 */
export function ListaArchivos ({ archivos, miembros }: PropsListaArchivos) {
  if (archivos.length === 0) {
    return (
      <Vacio
        titulo="Sin archivos"
        descripcion="Los adjuntos del proyecto aparecen acá. Todavía se suben desde el panel."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {archivos.map((archivo) => (
        <li
          key={archivo.id}
          className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-wrap items-center gap-x-4 gap-y-2 border p-3"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-texto truncate text-sm font-medium">
              {archivo.original_file_name ?? archivo.file_name}
            </span>
            <span className="text-texto-tenue truncate text-xs">
              {archivo.filetype ?? 'Tipo desconocido'} · {subidoPor(archivo.staff_id, miembros)}
            </span>
          </span>

          <Fecha valor={archivo.date_added} conHora className="text-texto-tenue text-xs" />

          {archivo.visible_to_customer && <Insignia tamano="chico">Visible al cliente</Insignia>}

          <AccionArchivo archivo={archivo} />
        </li>
      ))}
    </ul>
  )
}
