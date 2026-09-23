/*
 * Punto de enganche de las notificaciones push dentro del service worker.
 *
 * `sw.js` lo carga con `importScripts('/sw-push.js')`. Este archivo lo reemplaza el frente de
 * notificaciones con los manejadores `push` y `notificationclick`; mientras tanto existe vacío para
 * que la carga no falle en local.
 */
