# 08 · LIVE (jornada y medidor)

Quién está trabajando **ahora** y sobre qué. Dos cosas en una: la **jornada** de cada persona —la
ventana del día en la que se puede medir— y el **medidor**, que es el cronómetro de siempre visto
desde arriba, sin importar en qué pantalla se arrancó.

**Sólo existe en `ops-v2`.** El panel de Perfex no tiene jornada: tiene cronómetros sueltos por tarea
y nada que los encuadre. La API de LIVE se construyó en paralelo a esta interfaz.

## La jornada es la llave del medidor, y el Espacio es la llave de la jornada

Ningún cronómetro arranca sin una jornada abierta: la API responde **409** a `POST /projects/{id}/timer`
y a `POST /tasks/{id}/timer` cuando no la hay.

Por eso la jornada ya **no se abre sola**. El único botón es **"Abrir jornada y empezar"**, y está
inerte hasta elegir un Espacio: abre la jornada y arranca el medidor en el mismo gesto, con un solo
reintento (`abrirYArrancar()`). Una cadena de reintentos convertiría un 409 legítimo —ya hay un
medidor corriendo— en un bucle silencioso.

El motivo no es de interfaz: una jornada abierta sin medidor es tiempo que después nadie sabe
imputar, y aparecía sola porque abrir era un clic y elegir Espacio era otro. Ahora son el mismo.

`mensajeDeFalloDeMedidor()` (`src/dominio/live.ts`) nombra las dos causas del 409 porque la API no las
distingue, y es el texto que queda cuando ese reintento tampoco alcanzó.

## El Espacio bloquea; la Tarea se pide

No son la misma exigencia, y la diferencia la manda la API: se puede medir un Espacio sin Tarea
(`task_id = 0`), y hay trabajo real que no cuelga de ninguna Tarea. Así que el Espacio es condición
para abrir, y la Tarea es un aviso **persistente** —no un error— con su selector al lado, en el
control y en la fila del tablero.

`SelectorTarea` lista sólo las Tareas **asignadas** a quien mira: arrancar un cronómetro sobre una
Tarea ajena responde 403, y un combo con todas ofrecería opciones que fallan al elegirlas, con el
error llegando **después** de haber detenido el medidor anterior. `assignee` va suelto en la query y
no dentro de `filter[]`, que responde 422.

Elegir Tarea detiene el medidor de Espacio y arranca el de la Tarea, en ese orden. Si el arranque
falla después del cierre, la persona se quedó sin medidor y hay que decírselo con esas palabras.

## Cerrar la jornada pasa por el resumen

"Cerrar jornada" ya no cierra: abre `CierreJornada`, un diálogo que no se va con `Escape` ni
clicando fuera. Sólo se sale por sus dos botones —"Seguir trabajando" y "Confirmar cierre"—, así que
no es una trampa, pero tampoco se cierra la jornada por descuido.

Dentro va `GET /me/jornada/resumen`: en qué se fue el día, agrupado por Espacio y Tarea, más lo
medido y lo que quedó **sin cubrir**, que es la razón de existir de la pantalla. Y un formulario para
sumar lo que se trabajó sin el medidor andando, que manda `POST /projects/{id}/timesheets` —el mismo
endpoint del Registro rápido, con su misma validación de duración—.

Si el resumen no carga, la jornada **se cierra igual**. Un backend a medias no puede dejar a nadie
con la jornada abierta para siempre.

Ojo con un detalle del backend: el tiempo agregado a mano se guarda como un tramo que termina
**ahora**, así que una duración mayor a lo que lleva abierta la jornada empieza antes que ella y no
entra en `items` ni en `measured_seconds`. El diálogo lo acusa explícitamente —"quedó registrado
igual"— para que nadie lo agregue dos veces.

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
| `subordinados` | `dirige_areas` | Su rama del organigrama: su gente y la de las áreas que cuelgan |
| `area` | `is_director` | Su área |
| `propio` | el resto | Sólo el control de jornada; `PanelEquipo` no se monta |

`subordinados` va **antes** que `area` y arregla el caso que faltaba: quien dirige un área de
`tblareas` pero no tiene el cargo Director ni `staff.view` caía en `propio`, así que esta pantalla ni
le pedía el tablero — aunque la API se lo hubiera dado entero. Las dos llaves conviven porque son dos
cosas distintas: el árbol de áreas y el cargo de antes.

`subordinados` y `area` traen el **mismo** recorte del lado de la API (la rama entera, no sólo el
primer escalón) y se distinguen por de dónde salió, para poder titular "Mi gente" en vez de "Mi área".
Nadie gana ni pierde una fila por el cambio de nombre: el piso que da el nivel sigue intacto.

El árbol que decide todo esto se configura en `/equipo/jerarquia` — ver `docs/modulos/09-jerarquias.md`.

La compuerta real es la API: `meta.scope` de `GET /live` dice hasta dónde llegó de verdad. Esconder no
autoriza. Por eso la sección va en la barra lateral **sin condición**: todo el mundo tiene al menos su
propia vista.

## Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| `POST` | `/me/jornada` | `201 {id, started_at, note}`; **409** si ya hay una abierta |
| `GET` | `/me/jornada/resumen` | en **qué** se fue la jornada abierta, por Espacio y Tarea; **404** si no hay ninguna |
| `POST` | `/me/jornada/cierre` | `{id, started_at, ended_at, seconds, auto_closed, timers_stopped}`; 409 si no hay |
| `GET` | `/me/jornada` | `{open, seconds, measured_seconds, uncovered_seconds, over_journey, timer}` |
| `GET` | `/live` | `{data: [...], meta: {scope}}` |
| `POST\|DELETE` | `/projects/{id}/timer` | `201` / `204`; **409** al arrancar sin jornada |
| `POST\|DELETE` | `/tasks/{id}/timer` | ya existía; ahora también **409** sin jornada |

El `timer` de `GET /me/jornada` tiene **casi** la misma forma que el `medidor` del tablero: la
única diferencia es que el tablero manda además el `status` de la Tarea, para que la fila pueda
pintar su estado, y la jornada propia no —ahí el estado no se muestra, porque el control ya dice
sobre qué se está midiendo—. El tipo de TypeScript es el mismo y el campo va opcional. Venía plano
—`task_id`, `project_id`, `task_name`, `project_name`— y la interfaz, que tiene un solo tipo para el
mismo hecho, pintaba **"Sin destino"** con cualquier cronómetro corriendo. Se unificó en la API
(`Jornada::cronometroAbierto()`), donde además el Espacio se resuelve por los dos caminos: sin eso,
medir una Tarea no decía a qué Proyecto pertenece.

Fila de `/live`:

```ts
{staff:{id,name,avatar,cargo,area}, jornada:{id,started_at,seconds}|null,
 medidor:{id,project:{id,name}|null,task:{id,name,status}|null,start_time,seconds}|null,
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
`location` y `route`, que en LIVE no existen. Sí se reusan `Avatar`, `Insignia`, `Vacio`,
`haceCuanto()` y `formatearDuracion()`.

## La jerarquía es la persona, no el Espacio

El tablero agrupaba por Espacio y dentro ponía una fila plana que mezclaba Tarea y Espacio en un
mismo texto. Ahora la raíz es **la persona**, y debajo cuelgan los cuatro escalones que se pidieron:
persona con su cargo → Proyecto que está midiendo → Tarea → tiempo.

Agrupar por Espacio dejó de tener sentido con la persona arriba: repetiría el Proyecto en el
encabezado del grupo y otra vez dentro de cada fila. `agruparPorEspacio()` se fue y en su lugar quedó
`ordenarPorActividad()`, que es lo único que aquel agrupado aportaba de verdad —quien mide primero,
después quien sólo tiene jornada, después el resto; a igualdad, alfabético—.

Medir un Espacio sin Tarea **no se esconde**: el escalón de la Tarea se pinta igual, con un aviso de
que falta elegirla. Es el dato que la pantalla existe para hacer visible.

## Pruebas

`pruebas/live.test.js` cubre lo que se rompe en silencio: `alcanceDeLive()`,
`ordenarPorActividad()` —que ninguna fila se pierda y que el orden no baile entre refrescos—,
`trabajoDeLaFila()`, `cargoYArea()` y `mensajeDeFalloDeMedidor()`. `pruebas/cierre-jornada.test.js`
cubre el resumen del cierre. El resto es JSX.
