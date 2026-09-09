# 08 · LIVE (jornada y medidor)

Quién está trabajando **ahora** y sobre qué. Dos cosas en una: la **jornada** de cada persona —la
ventana del día en la que se puede medir— y el **medidor**, que es el cronómetro de siempre visto
desde arriba, sin importar en qué pantalla se arrancó.

**Sólo existe en `ops-v2`.** El panel de Perfex no tiene jornada: tiene cronómetros sueltos por tarea
y nada que los encuadre. La API de LIVE se construyó en paralelo a esta interfaz.

## La jornada es la llave del medidor

Ningún cronómetro arranca sin una jornada abierta: la API responde **409** a `POST /projects/{id}/timer`
y a `POST /tasks/{id}/timer` cuando no la hay. La interfaz no muestra ese error crudo — pinta
**"Abrir jornada y arrancar"**, que abre la jornada y reintenta **una sola vez**. Una cadena de
reintentos convertiría un 409 legítimo (ya hay un medidor corriendo) en un bucle silencioso.

`mensajeDeFalloDeMedidor()` (`src/dominio/live.ts`) nombra las dos causas del 409 porque la API no las
distingue, y es el texto que queda cuando ese reintento tampoco alcanzó.

## Un solo control, en la cabecera

`ControlJornada` vive en la cabecera del panel (`src/app/(panel)/layout.tsx`) y es **el único** de toda
la aplicación. Colapsado es un botón de `h-8` —el contador, o "Iniciar jornada"—; abierto despliega
jornada, medidor y el selector de Espacio. En `/live` se monta **el mismo componente** con
`variante="panel"`. Un segundo componente para la pantalla grande sería la segunda copia de la lógica
de arranque, y con ella la segunda forma de que los dos números digan cosas distintas.

No va en la barra lateral: la barra se abate a un riel de 4.5rem y en móvil se esconde dentro de un
cajón, justo donde más falta hace saber que quedó un medidor corriendo.

Por lo mismo se **borró** `inicio/CronometroAbierto.tsx` y `procesoConCronometro()`: hacían el mismo
trabajo, pero sólo en la portada y sólo al entrar.

## Los contadores no leen el reloj del navegador

Los segundos los calcula el servidor y llegan en `seconds`; el cliente sólo les suma **el tiempo
transcurrido desde la lectura**. Restar `Date.now()` contra `started_at` mete el desfase de reloj de
quien mira dentro del dato — es de donde salen los "hace -3 minutos". Y el contador arranca en cero:
el primer pintado del cliente tiene que coincidir con el del servidor o React reporta un error de
hidratación.

## Dos sitios que repreguntan, y ninguno más

`ControlJornada` y `PanelEquipo`. Los dos copian el patrón de `auditoria/PanelEnVivo`: `setInterval`
+ `document.hidden` + `visibilitychange` + `AbortController`, y **nunca** `router.refresh()` —eso
re-ejecuta la página entera y le reinicia el suelo a quien está leyendo, incluido el Espacio que
acaba de elegir en el combo.

**No hay SSE**: el dato cambia cuando alguien aprieta un botón, no continuamente. Sostener un stream
por persona a través del BFF, con su token vivo, es infraestructura permanente para un evento que
ocurre unas pocas veces por hora.

El intervalo sale de `intervaloDeLive()` (`LIVE_INTERVALO_SEGUNDOS`, 30 s por defecto, acotado entre
10 y 600). Lo resuelve el **servidor** y baja como prop, igual que `intervaloDeLatido()`.

## La doble fuente de verdad, resuelta con un aviso

El mismo cronómetro se muta desde `proyecto/Cronometros.tsx`, `proyecto/PanelTiempos.tsx` y
`proyecto/RegistroRapido.tsx`. Cada uno llama a `avisarCambioDeMedidor()`
(`src/componentes/live/medidor.ts`) antes de su propio refresco, y `ControlJornada` está suscrito. Sin
eso, detener un cronómetro en la ficha de una Tarea deja el contador de la cabecera corriendo hasta el
próximo intervalo: dos números distintos sobre el mismo hecho, en la misma pantalla.

Es un pub/sub de módulo, copia deliberada de `auditoria/accion.ts`: no guarda estado —quien escucha le
vuelve a preguntar a la API, que es la única que sabe cómo quedó— y no necesita provider, porque hay
un solo oyente en toda la aplicación.

## Alcance

`alcanceDeLive(yo)` decide **si se pide el tablero**, no quién puede verlo:

| Alcance | Llave | Qué se dibuja |
|---|---|---|
| `todo` | `is_superadmin` o `staff.view` | El equipo entero |
| `area` | `is_director` | Su área |
| `propio` | el resto | Sólo el control de jornada; `PanelEquipo` no se monta |

La compuerta real es la API: `meta.scope` de `GET /live` dice hasta dónde llegó de verdad. Esconder no
autoriza. Por eso la sección va en la barra lateral **sin condición**: todo el mundo tiene al menos su
propia vista.

## Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| `POST` | `/me/jornada` | `201 {id, started_at, note}`; **409** si ya hay una abierta |
| `POST` | `/me/jornada/cierre` | `{id, started_at, ended_at, seconds, auto_closed, timers_stopped}`; 409 si no hay |
| `GET` | `/me/jornada` | `{open, seconds, measured_seconds, uncovered_seconds, over_journey, timer}` |
| `GET` | `/live` | `{data: [...], meta: {scope}}` |
| `POST\|DELETE` | `/projects/{id}/timer` | `201` / `204`; **409** al arrancar sin jornada |
| `POST\|DELETE` | `/tasks/{id}/timer` | ya existía; ahora también **409** sin jornada |

Fila de `/live`:

```ts
{staff:{id,name,avatar,cargo,area}, jornada:{id,started_at,seconds}|null,
 medidor:{id,project:{id,name}|null,task:{id,name}|null,start_time,seconds}|null,
 presencia:{last_seen,seconds_ago}|null, seconds_today}
```

`live` está en `PREFIJOS_PERMITIDOS` (`src/datos/rutas.ts`). `me`, `projects` y `tasks` ya estaban.

## Avisos (la campana)

`/notifications` existía en la API desde F0 y **no tenía consumidor**. Ahora lo tiene:

- El conteo inicial baja por prop desde el layout (`pedirOpcional('/notifications/count')`) para que el
  globo no aparezca vacío y salte a doce un segundo después, en cada navegación.
- El intervalo pide **sólo el contador**. La lista se pide **al abrir el desplegable** — ese montaje
  *es* la petición.
- Al cerrar se hace `POST /notifications/read` con actualización optimista del globo: abrir la campana
  ES leerlos, y si la escritura falla el próximo conteo lo devuelve a su valor real.

Las preferencias por persona (`/notifications/preferences`) quedan fuera: son una pantalla de ajustes,
no un desplegable.

## Qué no se reusó, y por qué

`arbolDePresencia()` y `PersonaActiva` están tipados contra `PersonaConectada` y viven de `activity`,
`location` y `route`, que en LIVE no existen; además su árbol es de tres niveles y el de LIVE es de
uno. Sí se reusan `Avatar`, `Insignia`, `Vacio`, `haceCuanto()` y `formatearDuracion()`.

## Pruebas

`pruebas/live.test.js` cubre lo que se rompe en silencio: `alcanceDeLive()`, `agruparPorEspacio()` —que
ninguna fila se pierda y que el grupo sin Espacio quede último— y `mensajeDeFalloDeMedidor()`. El resto
es JSX.
