# 08 · LIVE (jornada y medidor)

Quién está trabajando **ahora** y sobre qué. Dos cosas en una: la **jornada** de cada persona —la
ventana del día en la que se puede medir— y el **medidor**, que es el cronómetro de siempre visto
desde arriba, sin importar en qué pantalla se arrancó.

**Sólo existe en `ops-v2`.** El panel de Perfex no tiene jornada: tiene cronómetros sueltos por tarea
y nada que los encuadre. La API de LIVE se construyó en paralelo a esta interfaz.

## La jornada es la llave del medidor, y el destino es la llave de la jornada

Ningún cronómetro arranca sin una jornada abierta: la API responde **409** a `POST /tasks/{id}/timer`
cuando no la hay.

Por eso la jornada ya **no se abre sola**, y desde el 2026-09-11 tampoco se abre a medias: abrir pide
**Proyecto y Tarea**, y la API los exige (`POST /me/jornada` con `project_id` y `task_id`). Abrir la
jornada y arrancar el cronómetro son el mismo gesto (`abrirYArrancar()`), sin reintentos: una cadena
de reintentos convertiría un 409 legítimo —ya hay un medidor corriendo— en un bucle silencioso.

El motivo no es de interfaz: una jornada abierta sin medidor es tiempo que después nadie sabe
imputar, y aparecía sola porque abrir era un clic y elegir el destino era otro. Ahora son el mismo.

`mensajeDeFalloDeMedidor()` (`src/dominio/live.ts`) nombra las dos causas del 409 porque la API no las
distingue, y es el texto que queda cuando ese reintento tampoco alcanzó.

## El Proyecto y la Tarea bloquean los dos

**Esto revierte una decisión de este mismo documento.** Hasta el 2026-09-11 decía "el Espacio bloquea;
la Tarea se pide": la migración `0260` había creado a propósito el medidor de Espacio —`task_id = 0`
con `project_id` lleno— para el trabajo que no cuelga de ninguna Tarea, y la Tarea era un aviso
persistente con su selector al lado.

La reunión lo revirtió, textual: «es indispensable marcar la tarea y el proyecto exactos para que el
registro sea útil». Tiempo cargado a un Proyecto entero dice a quién facturarle y no dice en qué se
fue el día, que es la pregunta que LIVE existe para contestar. El aviso persistente, además, tenía un
desenlace predecible: se arrancaba, se leía el aviso y se paraba — tramos de segundos que no son
trabajo y que la migración `0440` limpia.

Qué cambió, concretamente:

| Antes | Ahora |
|---|---|
| `POST /me/jornada` pedía `project_id` | pide `project_id` **y** `task_id`, y comprueba que la Tarea sea de ese Proyecto (`Jornada::destinoValidado()`) |
| `POST /projects/{id}/timer` arrancaba un medidor sin Tarea | responde **422**; `Cronometro` se quedó sin `arrancarEspacio()` |
| el aviso de Tarea con su selector al lado | no hay medidor sin Tarea que avisar |

`DELETE /projects/{id}/timer` sigue vivo: en la base hay medidores de Espacio abiertos de antes del
cambio y ésa es su salida. Se cierra la puerta, no se tapia la salida.

`SelectorTarea` lista sólo las Tareas **asignadas** a quien mira y **del Proyecto elegido**: arrancar
un cronómetro sobre una Tarea ajena responde 403, y un combo con todas ofrecería opciones que fallan
al elegirlas. `assignee` va suelto en la query y no dentro de `filter[]`, que responde 422.

## Empezar el día pasa por un modal que no se descarta

`DestinoDeJornada` es el espejo de `CierreJornada` en el otro extremo del día, y por el mismo motivo:
lo que no se elige al empezar ya no se puede elegir después. Un desplegable de cabecera sirve para
operar, no para obligar — se cierra clicando en cualquier parte.

Pide **tres escalones, en este orden**: nombre → Proyecto → Tarea. El nombre no es un combo: la
jornada es de quien tiene la sesión y la API saca el `staff_id` del token, así que ofrecerlo sería
prometer algo que el backend rechaza. Se muestra porque con varias sesiones abiertas —o suplantando a
alguien— es lo único que dice de quién va a ser el registro. La Tarea va después del Proyecto y
filtrada por él; al revés habría que ofrecer todas las Tareas de la empresa para después descartarlas.

El mismo modal, en modo `medidor`, es el que arranca un cronómetro con la jornada ya abierta. Ahí
**sí** se descarta con `Escape`: quien ya abrió su día no está bloqueado, sólo no está midiendo. Con
él se fueron las **dos** copias del selector de Espacio que vivían dentro de `ControlJornada`.

## El bloqueo de entrada, y por qué no encierra a nadie

Iniciar jornada es obligatorio de verdad: la instancia de `ControlJornada` que vive en el armazón del
panel (`src/app/(panel)/layout.tsx`) monta el modal en modo `apertura` cuando consta que no hay
jornada abierta. Como el armazón está en las ocho pantallas y no se desmonta al navegar, no hay ruta
del panel que se salte el bloqueo. Antes sólo había un aviso en el Inicio (`AvisoJornada`), que se
leía o no se leía.

Sólo la variante `compacta` lo monta. En `/live` conviven las dos instancias, y dos modales con el
mismo trabajo se pisarían.

Tres decisiones, y las tres son sobre no encerrar a nadie:

1. **`estado === null` no bloquea** (`faltaAbrirJornada()`). `null` es "no se pudo leer", no "no hay
   jornada": bloquear ahí dejaría a quien ya la tiene abierta frente a un velo por un fallo de la
   API, y sin salida, porque al intentar abrirla le respondería 409. Lo contrario se corrige solo —el
   control repregunta cada `intervaloDeLive()` segundos y la compuerta aparece en cuanto hay dato—.
2. **"No puedo abrir mi jornada"** abre dos puertas reales: cerrar sesión, o entrar sin jornada por
   esta vez. Hace falta: quien no tiene Proyectos asignados, quien no tiene Tareas en el que eligió y
   cualquiera el día que la API falle se quedarían frente a un botón inerte, expulsados del sistema
   entero por un dato que no depende de ellos.
3. **Entrar sin jornada no la finge.** No abre nada ni marca nada: el aviso del Inicio y el control de
   la cabecera siguen diciendo que falta, y la siguiente recarga vuelve a pedirla. Es una excepción
   por esta vez, que es la única forma de que obligue sin encerrar. Cerrar la jornada también la
   revoca: el día siguiente empieza como cualquier otro.

La salida está a un clic de distancia y no en la fila principal a propósito. Obligar es poner la
excepción un paso más lejos que la regla, no tapiarla.

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
jornada y medidor. Los selectores ya no están ahí dentro: viven en `DestinoDeJornada`, que es también
la compuerta de entrada. En `/live` se monta **el mismo componente** con
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
| | | `project_id` y `task_id` obligatorios: **422** sin ellos o si la Tarea no es de ese Proyecto |
| `GET` | `/me/jornada/resumen` | en **qué** se fue la jornada abierta, por Espacio y Tarea; **404** si no hay ninguna |
| `POST` | `/me/jornada/cierre` | `{id, started_at, ended_at, seconds, auto_closed, timers_stopped}`; 409 si no hay |
| `GET` | `/me/jornada` | `{open, seconds, measured_seconds, uncovered_seconds, over_journey, timer}` |
| `GET` | `/live` | `{data: [...], meta: {scope}}` |
| `POST` | `/projects/{id}/timer` | **422**: ya no se mide contra un Espacio entero |
| `DELETE` | `/projects/{id}/timer` | `204`; sigue vivo para detener los medidores de Espacio históricos |
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
que falta elegirla. Ya no se pueden crear filas así —ver "El Proyecto y la Tarea bloquean los dos"—
pero las históricas que la `0440` preservó siguen apareciendo, y esconderlas sería el único caso en
que la pantalla mentiría.

## Pruebas

`pruebas/live.test.js` cubre lo que se rompe en silencio: `alcanceDeLive()`,
`ordenarPorActividad()` —que ninguna fila se pierda y que el orden no baile entre refrescos—,
`trabajoDeLaFila()`, `cargoYArea()` y `mensajeDeFalloDeMedidor()`. `pruebas/cierre-jornada.test.js`
cubre el resumen del cierre, y `pruebas/inicio-jornada.test.js` la compuerta de entrada —sobre todo
que un estado que no se pudo leer **no** bloquee—. El resto es JSX.
