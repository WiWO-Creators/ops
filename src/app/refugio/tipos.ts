export interface Interruptor {
  clave: string
  grupo: string
  etiqueta: string
  valor: boolean
  peligro: boolean
}

export interface Estado {
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
}
