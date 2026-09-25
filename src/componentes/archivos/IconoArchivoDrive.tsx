import {
  File, FileArchive, FileImage, FileMusic, FileSpreadsheet, FileText, FileType2, FileVideoCamera, Folder, FolderLock,
  Presentation, type LucideIcon
} from 'lucide-react'
import { ETIQUETA_TIPO, type TipoArchivoDrive } from '@/dominio/drive-explorador'
import { cn } from '@/lib/clases'
import './explorador-drive.css'

/** El dibujo de cada tipo. Uno por tipo, del mismo juego de íconos que el resto del panel. */
const ICONO: Record<TipoArchivoDrive, LucideIcon> = {
  carpeta: Folder,
  'carpeta-tarea': FolderLock,
  pdf: FileType2,
  imagen: FileImage,
  hoja: FileSpreadsheet,
  documento: FileText,
  presentacion: Presentation,
  video: FileVideoCamera,
  audio: FileMusic,
  comprimido: FileArchive,
  texto: FileText,
  otro: File
}

/** Medidas de la baldosa: la fila de la lista y la tarjeta de la cuadrícula. */
const MEDIDAS = {
  fila: { caja: 'size-8 rounded-chico', icono: 'size-4' },
  tarjeta: { caja: 'size-12 rounded-medio', icono: 'size-6' }
} as const

/**
 * El ícono de un archivo o carpeta, sobre su baldosa del color de su tipo.
 *
 * Es decorativo para el lector de pantalla cuando la fila ya dice el tipo; lleva `title` para quien
 * pasa el puntero y no reconoce el dibujo.
 *
 * @param tipo el tipo que decidió `tipoDeNodo`
 * @param medida `fila` en la lista, `tarjeta` en la cuadrícula
 */
export function IconoArchivoDrive ({ tipo, medida = 'fila', className }: {
  tipo: TipoArchivoDrive
  medida?: keyof typeof MEDIDAS
  className?: string
}) {
  const Icono = ICONO[tipo]
  const tamano = MEDIDAS[medida]

  return (
    <span
      data-tipo={tipo}
      title={ETIQUETA_TIPO[tipo]}
      aria-hidden="true"
      className={cn('tipo-drive grid shrink-0 place-items-center', tamano.caja, className)}
    >
      <Icono className={tamano.icono} strokeWidth={1.75} />
    </span>
  )
}
