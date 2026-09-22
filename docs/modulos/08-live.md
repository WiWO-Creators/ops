# 08 · LIVE (jornada y medidor)

Quién está trabajando **ahora** y sobre qué. Dos cosas en una: la **jornada** de cada persona —la
ventana del día en la que se puede medir— y el **medidor**, que es el cronómetro de siempre visto
desde arriba, sin importar en qué pantalla se arrancó.

**Sólo existe en `ops-v2`.** El panel de Perfex no tiene jornada: tiene cronómetros sueltos por tarea
y nada que los encuadre. La API de LIVE se construyó en paralelo a esta interfaz.

## La jornada es la llave del medidor, y el destino es la llave de la jornada

Ningún cronómetro arranca sin una jornada abierta: la API responde **409** a `POST /tasks/{id}/timer`
cuando no la hay.

Por eso la jornada ya **no se abre sola**: abrir pide el **Proyecto**, y la API lo exige
(`POST /me/jornada` con `project_id`; `task_id` viaja sólo si se eligió una Tarea). Abrir la jornada y
arrancar el medidor son el mismo gesto (`abrirYArrancar()`), sin reintentos: una cadena de reintentos
convertiría un 409 legítimo —ya hay un medidor corriendo— en un bucle silencioso.

El motivo no es de interfaz: una jornada abierta sin medidor es tiempo que después nadie sabe
imputar, y aparecía sola porque abrir era un clic y elegir el destino era otro. Ahora son el mismo.

`mensajeDeFalloDeMedidor()` (`src/dominio/live.ts`) nombra las dos causas del 409 porque la API no las
distingue, y es el texto que queda cuando ese reintento tampoco alcanzó.

## El Proyecto bloquea; la Tarea se pide

**Regla vigente: Proyecto obligatorio, Tarea opcional.** `POST /me/jornada` exige `project_id` y
rechaza con 422 si falta; `task_id` es opcional, y cuando viene se comprueba que la Tarea pertenezca a
ese Proyecto (`Jornada::destinoValidado()`). Sin Tarea se arranca el **medidor de Espacio** de la
migración `0260`: la fila de `tbltaskstimers` con `task_id = 0` y `project_id` lleno.

### El vaivén del 2026-09-11, para que nadie lo lea como un descuido

Esta sección cambió dos veces el mismo día, y las dos a propósito:

| Cuándo | Qué decía | Por qué |
|---|---|---|
| hasta la mañana del 11/09 | el Espacio bloquea; la Tarea se pide con un aviso | es lo que la `0260` había construido: el medidor de Espacio existe para el trabajo que no cuelga de ninguna Tarea |
| reunión del 11/09 (RQ-JOR-4) | los dos bloquean | textual: «es indispensable marcar la tarea y el proyecto exactos para que el registro sea útil» — tiempo cargado a un Proyecto entero dice a quién facturarle y no en qué se fue el día |
| esa misma tarde, el cliente | vuelve a bloquear sólo el Proyecto | quiere **poder iniciar jornada eligiendo sólo un Proyecto, para demostrar que se está trabajando en ese Proyecto**; obligar a elegir Tarea le impedía abrir el día |

Lo que la reversión deshizo: `destinoValidado()` dejó de exigir `task_id`, `POST /projects/{id}/timer`
volvió a arrancar el medidor de Espacio y `Cronometro::arrancarEspacio()` se restituyó del historial
tal cual estaba. La migración `0440`, que iba a borrar las filas históricas con `task_id = 0`, quedó
**neutralizada**: bajo la regla vigente esas filas vuelven a ser legítimas y no se borró ninguna. El
archivo sigue en el repo con su nombre, vacío y con el motivo escrito, y el sha de la versión con el
`DELETE` quedó en `SHAS_HISTORICOS` de `migrar.php` por si algún entorno la hubiera anotado.

Lo que la reversión **no** deshizo: la comprobación de que la Tarea, cuando viene, sea de ese
Proyecto. Nunca fue la parte que molestaba, y sin ella `project_id` sería decorativo —la fila cuelga
de la Tarea y el Espacio se deriva de su `rel_id`—.

### Pedir sin bloquear

La Tarea se sigue ofreciendo, porque el registro con Tarea es el bueno: dice en qué se fue el rato y
no sólo a quién facturarle. Lo que cambia es cómo se pide.

- En el modal, el tercer escalón se pinta igual y lleva debajo una línea que dice que conviene
  elegirla. El botón no la espera.
- En el control de la cabecera, medir sin Tarea muestra una línea en tono sutil —no de aviso— que
  ofrece detener y volver a arrancar sobre una Tarea.
- En el Inicio, `AvisoJornada` sigue recordándolo con su tarjeta.
- En el tablero En Vivo, el escalón vacío se pinta con una insignia **neutra** que dice «Sin Tarea».
  El tono `aviso` quedó para lo que sí está mal: el medidor sin Espacio.

Ninguno de los cuatro bloquea nada. Pedir es poner la opción delante; bloquear es lo que el cliente
pidió quitar.

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
   esta vez. Hace falta: quien no tiene Proyectos asignados y cualquiera el día que la API falle se
   quedarían frente a un botón inerte, expulsados del sistema entero por un dato que no depende de
   ellos. Que la Tarea sea opcional achica ese grupo —quien tiene Proyecto y ninguna Tarea asignada ya
   puede abrir— pero no lo vacía.
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

## El cierre automático se avisa, y se puede correr

El cron cierra la jornada a la hora de corte sin preguntarle a nadie, y con ella detiene los
cronómetros. Quien seguía trabajando a esa hora perdía el resto de la tarde y tenía que volver a
abrir todo: el aviso previo de la campana —media hora antes— avisaba, pero no ofrecía ninguna salida
que no fuera cerrar y reabrir a mano. `AvisoDeCierre` es esa salida.

`GET /me/jornada` trae `closing` al **nivel raíz** del estado, hermano de `open`, `seconds` y
`timer`: `{at, extension_minutes, extended}`. `at` es el instante en que **esta** jornada se cierra
sola —la hora de corte de su día de inicio, o la prórroga si quedó más tarde—, `extension_minutes` es
cuánto suma cada "sigo trabajando", y `extended` dice si ya se corrió alguna vez, que es lo único que
cambia el encabezado del aviso ("Se acabó la prórroga: son las 20:30" en vez de "Son las 20:00").

Viene en **`null`** con el cierre automático apagado y cuando no hay jornada abierta, y es la única
señal que mira la pantalla para decidir si se dibuja: sin cierre que anunciar no hay nada que avisar.
Deducir la hora del reloj del navegador sería la misma clase de error que los contadores ya evitan.

Va suelto y no dentro de `open` porque `open` es la forma `JornadaEnVivo` que el tablero `GET /live`
también sirve, y ahí este dato no existe. El tipo es `CierreProgramado`, en `src/datos/live.ts`.

### El aviso, y por qué trae una cuenta regresiva

`AvisoDeCierre` (`src/componentes/live/AvisoDeCierre.tsx`) sale **en el instante del corte**, no
antes: una tarjeta flotante en la esquina inferior derecha —en móvil, centrada por encima del botón
del chat, como el resto de los avisos flotantes del panel— con treinta segundos de cuenta regresiva
(`SEGUNDOS_DE_GRACIA`), dos botones y una barra de progreso decorativa, que queda fuera del árbol de
accesibilidad porque el número ya dice lo mismo en texto.

Los dos botones son "Sigo trabajando" —primario, `POST /me/jornada/prorroga`— y "Cerrar jornada"
—sutil, cierra ya—. El primario va último en la fila: es la respuesta que el aviso espera, y la otra
la toma el silencio de todas formas.

Es **`role="alert"` con `aria-live="assertive"`**, al revés que `RecordatorioDeDestino`, que es
`status`. Aquél es un recordatorio que se va solo; acá hay una consecuencia inminente y no reversible
desde la pantalla —el día se cierra y los cronómetros se detienen—, así que interrumpir a quien usa
un lector de pantalla es exactamente lo correcto.

**La cuenta regresiva no es impaciencia: es lo que hace que el silencio signifique algo.** El caso
que hay que resolver bien es el de la persona que **no** está. Un diálogo que espera indefinidamente
deja la jornada abierta hasta mañana justo cuando nadie la mira, o sea que desactiva el cierre
automático para todo el mundo salvo para quien se acuerda de cerrarlo. Treinta segundos y no tres,
porque la frase tiene que poder leerse y decidirse; y no cinco minutos, que ya es un aviso de adorno.

Si el plazo se agota sin respuesta, **es el navegador el que cierra la jornada**
(`POST /me/jornada/cierre`). El cron sigue siendo la red de seguridad para quien tenga el navegador
cerrado: la pantalla adelanta el cierre, no lo sustituye.

### Qué congela la cuenta, y qué no

| Congela | No congela |
|---|---|
| El foco **dentro** del aviso | El puntero encima |
| Una petición en vuelo | |
| Un mensaje de error a la vista | |

El foco dentro es prueba de que hay alguien: quien navega con teclado tarda más en llegar al botón y
no tiene por qué perder el día por eso. El puntero **no prueba nada** —un ratón se queda donde se lo
dejaron— y congelar por hover convertiría un escritorio con el cursor olvidado encima en una jornada
que no se cierra nunca. Un fallo congela por el mismo motivo que el foco: acaba de haber alguien, y
dejar correr el reloj hacia un cierre que probablemente tampoco va a salir sólo suma un segundo error
encima del primero.

Congelar no le quita el plazo a nadie: "Sigo trabajando" corre el cierre **de verdad**, en el
servidor, y es la salida que WCAG 2.2.1 pide para un límite de tiempo.

### El reloj que lo dispara

Lo monta `ControlJornada`, y **sólo la instancia `variante="compacta"`** —la del armazón del panel—,
por lo mismo que la compuerta de apertura: en `/live` hay dos controles montados leyendo la misma
jornada, y sin esa guarda saldrían dos avisos idénticos con dos cuentas regresivas, y el primero en
vencer cerraría el día mientras el otro sigue preguntando.

Es un `setInterval` de un segundo que compara `Date.now()` con `closing.at`, y **no** un `setTimeout`
hasta la hora: el navegador suspende los temporizadores largos con la pestaña de fondo y se
dispararía tarde, que es justo el caso de quien dejó el equipo encendido. Comparar el reloj una vez
por segundo se pone al día solo en cuanto la pestaña vuelve, y este control ya se repinta cada
segundo por el contador de la jornada.

Cada prórroga cambia `closing.at`, y el aviso se remonta con `key={cierre.at}`. Sin eso React
reutilizaría el mismo componente y la cuenta seguiría donde la dejó: el segundo aviso nacería en cero
y cerraría el día en el acto.

No sale por encima de `CierreJornada`: ahí la persona ya está cerrando el día, y preguntarle si sigue
trabajando encima del formulario donde escribe su comentario es interrumpir la respuesta que ya está
dando. Y no se pospone ni se guarda en `localStorage`, al revés que la ventana de apertura: una marca
de "no molestar" sería la persona pidiendo que le cierren el día sin avisar. La única forma de que no
vuelva a salir es cerrar la jornada, que es justo lo que pregunta.

### Los errores dicen otra cosa acá

`mensajeDeFalloDeProrroga()` (`src/dominio/live.ts`) está aparte de `mensajeDeFalloDeJornada()`
porque los mismos códigos significan lo contrario en este camino: el **404** no es "no existe" sino
«tu jornada ya está cerrada», y el **409** no es "ya tienes una abierta" sino «el cierre automático
está apagado». Los dos se escriben en indicativo y sin culpar a nadie, porque en los dos el aviso
desaparece a continuación —se vuelve a leer el estado y el reloj lo retira solo— y lo único que hace
falta es que quien lo estaba leyendo entienda por qué.

Con cualquier otro fallo **el aviso se queda a la vista con el motivo encima**, y la cuenta detenida.
Es la única pantalla donde la persona puede enterarse de que su "sigo trabajando" no llegó; retirarlo
igual sería exactamente la mentira que este mecanismo existe para no contar. Por eso el mensaje viaja
hasta el aviso en vez de quedarse en el cuerpo del control: en la variante compacta ese cuerpo vive
dentro de un desplegable cerrado, y ahí no lo leería nadie.

### El ajuste

`wiwo_live_prorroga_minutos` (entero, 5..240, `30` de fábrica) decide cuánto corre cada prórroga, y
se edita desde Ajustes junto a `wiwo_live_cierre_automatico` y `wiwo_live_hora_cierre`. Su etiqueta y
su ayuda están en `ETIQUETAS_DE_AJUSTES` (`src/dominio/ajustes.ts`).

**El minutaje no viaja en el POST**, que va vacío a propósito: un número que llega del navegador
convierte el cierre automático en algo que cada persona se fija a sí misma. Lo que la pantalla sabe
es lo que le dice `closing.extension_minutes`, y con eso escribe el texto del aviso.

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
| | | `project_id` obligatorio y `task_id` opcional: **422** sin el primero, o si el `task_id` que viene no es un entero positivo o no es de ese Proyecto |
| `GET` | `/me/jornada/resumen` | en **qué** se fue la jornada abierta, por Espacio y Tarea; **404** si no hay ninguna |
| `POST` | `/me/jornada/cierre` | `{id, started_at, ended_at, seconds, auto_closed, timers_stopped, comment}`; 409 si no hay |
| | | Cuerpo opcional `{comment}`: el comentario del día del modal de cierre, máx. 2000 caracteres (422 si se pasa). Sin cuerpo también cierra |
| `POST` | `/me/jornada/prorroga` | **sin cuerpo**; corre el cierre automático de este día y devuelve el mismo `estado()` que el `GET`, ya con el corte nuevo |
| | | **404** si no hay jornada abierta, **409** si el cierre automático está apagado. Cuánto corre lo decide el servidor, no quien pulsa |
| `GET` | `/me/jornada` | `{open, seconds, measured_seconds, uncovered_seconds, over_journey, timer, closing}` |
| `GET` | `/live` | `{data: [...], meta: {scope}}` |
| `POST` | `/projects/{id}/timer` | `201`: el medidor de Espacio, la fila con `task_id = 0` y `project_id` lleno |
| `DELETE` | `/projects/{id}/timer` | `204`; lo detiene |
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

Medir un Espacio sin Tarea **no se esconde ni se marca como defecto**: el escalón de la Tarea se
pinta igual, con una insignia neutra que dice «Sin Tarea». Es una elección válida —ver "El Proyecto
bloquea; la Tarea se pide"— así que ni se oculta ni se reprocha. Esconderlo dejaría un hueco donde el
ojo espera una línea; pintarlo en `aviso` regañaría a quien hizo lo que el cliente pidió poder hacer.

El `aviso` queda para el medidor **sin Espacio**: ahí no hay a qué imputar el tiempo por ningún
camino, y de ésos hay en la base desde antes del módulo.

## Pruebas

`pruebas/live.test.js` cubre lo que se rompe en silencio: `alcanceDeLive()`,
`ordenarPorActividad()` —que ninguna fila se pierda y que el orden no baile entre refrescos—,
`trabajoDeLaFila()`, `cargoYArea()` y `mensajeDeFalloDeMedidor()`. `pruebas/cierre-jornada.test.js`
cubre el resumen del cierre, y `pruebas/inicio-jornada.test.js` la compuerta de entrada —sobre todo
que un estado que no se pudo leer **no** bloquee—. El resto es JSX.

Del aviso de cierre: `pruebas/cierre-jornada-prorroga.test.js` cubre `mensajeDeFalloDeProrroga()`
—los tres códigos que acá significan lo contrario que en el resto de la jornada— y
`mock/prorroga-jornada.test.js` la ruta contra el mock, sobre todo que el corte se cuente desde el
corte vigente y no desde ahora. `pruebas/cierre-jornada.browser.mjs` recorre el camino entero en
navegador —el aviso sale, la cuenta baja, se congela con el foco dentro y la prórroga la reinicia—
y se corre a mano como el resto de los `.browser.mjs`: el mock acepta
`MOCK_JORNADA_CIERRE_EN=<segundos>` para poner el corte a unos segundos de abrir la jornada, en vez
de esperar a la hora real.
