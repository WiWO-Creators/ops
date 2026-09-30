export interface Interruptor {
  clave: string
  grupo: string
  etiqueta: string
  valor: boolean
  peligro: boolean
}

export interface Estado {
  /** Lo pone el servidor: una cadena del componente viajaria en el bundle de todo el panel. */
  titulo: string
  operador: { staffid: number, nombre: string }
  migraciones: {
    en_disco: number
    aplicadas: number
    pendientes: string[]
    ultima: { archivo: string, aplicada_en: string } | null
  }
  interruptores: Interruptor[]
  reloj: {
    php: string
    zona_php: string
    base: string
    desfase_segundos: number
    alineados: boolean
  }
  base: { version: string, prefijo: string }
  ocupantes: number
  horario: Horario
}

/** La rutina propia del operador. Viaja como `rutina` y se renombra al leer. */
export interface Horario {
  activo: boolean
  /** `HH:MM`. */
  hora: string
  /** Fechas `YYYY-MM-DD`, de hoy en adelante. */
  omitir: string[]
  /** `YYYY-MM-DD HH:MM`, o null si esta apagado. */
  proximo: string | null
  /** `HH:MM`. La hora tiene que quedar antes. */
  hora_corte: string
}

/** Lo que dice la seccion. Lo pone la pagina de servidor: escrito en el componente viajaria en el bundle. */
export interface TextosHorario {
  rotulo: string
  interruptor: string
  nota: string
}
