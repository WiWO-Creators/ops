/**
 * A donde se reporta un problema.
 *
 * El soporte no es un modulo del panel: se atiende en wiwo.center, y el panel ya no monta ninguna
 * pantalla de tickets (ver `definiciones/tickets.ts`). La constante vive aca y no repetida en cada
 * pantalla porque ahora la nombran tres lugares —la tarjeta de Inicio, el aviso de error y la
 * pantalla de error de la ficha publica— y el dia que el soporte cambie de direccion tiene que
 * cambiar en uno.
 */
export const URL_SOPORTE = 'https://wiwo.center'

/** Como se nombra el destino del soporte cuando se escribe dentro de una frase. */
export const NOMBRE_SOPORTE = 'wiwo.center'
