# 07 · Teletrabajo

Videollamadas del equipo, sobre un servidor LiveKit propio (`livekit.wiwo.me`, ver
la carpeta `livekit/` de `ops.wiwo`). **Sólo existe en `ops-v2`**: el panel de Perfex no tiene equivalente y
no se le va a construir uno. No hay tabla propia ni recurso en `modules/api/`: la única superficie de
servidor es la firma de tokens y una consulta de ocupación contra la API de administración de LiveKit.

## Dos clases de sala, distinguidas por el nombre

`src/dominio/teletrabajo.ts` reconoce dos clases, y la diferencia está en la forma del nombre, no en
una tabla:

- **Comunes** — catálogo fijo en código (`general`, `cafe`). Entra cualquiera del equipo.
- **Privadas** — `espacio-<id>`. Entra sólo quien sea miembro de ese Espacio en la API.

El nombre es la clave primaria de la sala en LiveKit, así que derivarlo de un dato que ya tiene dueño
conocido —el Espacio— evita mantener una lista de invitados aparte que se desincronice.

## La autorización es de un solo punto

LiveKit no tiene usuarios ni permisos: abre cualquier sala a cualquier token firmado y válido, con el
nombre que diga el token. Eso significa que **toda** la decisión vive del lado de `ops-v2`, y un error
ahí no da un 403: da una conversación privada con alguien de más adentro.

Ese punto único es `src/app/(panel)/teletrabajo/[sala]/page.tsx`. El orden es obligatorio: validar la
forma del nombre → `GET /me` → miembros del Espacio (si la sala es privada) → `puedeEntrar()` → **y
sólo entonces** firmar el token. Firmar antes "para ver si hace falta" sería emitir una credencial que
después se decide no entregar.

Quien no puede entrar recibe **404**, no 403: un "no tienes permiso" ya confirma que la sala existe y
quiénes la usan, y eso es justo lo que una sala privada no debe filtrar. No hay endpoint de tokens a
propósito — un endpoint sería un segundo lugar donde volver a escribir la misma comprobación, y con
ella el mismo riesgo de que se les vaya el orden.

Un administrador **no** entra por decreto a las salas privadas (`esAdmin` no participa en
`puedeEntrar()`): puede ver el Espacio en el panel, pero colarse sin avisar a una conversación en curso
es otra cosa. Si algún día hace falta, se agrega ahí y se anuncia en la sala, no se cuela por omisión.

## Recorrido de la pantalla

`/teletrabajo` (portada con las salas y cuánta gente hay en cada una) → `/teletrabajo/<sala>` →
**antesala** (te ves, elegís micrófono y cámara, ves quién está dentro) → **llamada**.

La portada sólo muestra las salas a las que esta persona **puede** entrar, no todas las que existen:
las comunes salen siempre, las privadas salen de `GET /projects?filter[member]=<id>`. Es la misma
pregunta que después repite `[sala]/page.tsx` antes de firmar — acá para decidir qué se ve, allá para
decidir quién entra. La segunda es la que manda; la primera sólo evita mostrar puertas que después se
cierran en la cara.

## Por qué hay antesala

Antes se entraba directo a la llamada, con todo apagado, y la pantalla se leía como rota: no había
indicador de dónde estabas, no salía tu nombre y el marcador de cámara apagada era un rectángulo
vacío. La antesala (`Antesala.tsx`) resuelve eso sin conectar: abre cámara y micrófono en local, sólo
para el preview, y recién al confirmar `Sala.tsx` monta `Llamada.tsx` con la elección ya tomada.

El micrófono y la cámara arrancan **apagados** siempre, aunque `usePersistentUserChoices` recuerde que
la última vez estaban prendidos: lo que se persiste es el *dispositivo* elegido, no si se publica.
Unirse publicando por defecto hace que quien abre la sala por curiosidad aparezca hablando sin
saberlo.

### Los dos fallos que originaron el rediseño

Quedan anotados acá para que no vuelvan:

1. **El tema de LiveKit no estaba puesto.** Se importaba `@livekit/components-styles` pero ningún nodo
   llevaba `data-lk-theme`, así que todas las variables `--lk-*` quedaban sin definir: el nombre del
   participante heredaba la tinta del panel sobre un chip negro y desaparecía, y
   `.lk-participant-placeholder` quedaba transparente. Hoy lo resuelve `src/estilos/livekit.css`, que
   define un tema propio llamado `wiwo` (aplicado en `Llamada.tsx` con `data-lk-theme="wiwo"`) con los
   semánticos de `neo.css`. Se usa un nombre propio y no `default` porque el `default` de la librería
   trae `color-scheme: dark` y forzaría el escenario a oscuro incluso con el panel en claro.
2. **La grilla no sabía repartir el alto.** El escenario era un `auto-fit` de CSS, que sabe cuántas
   columnas entran a lo ancho pero **nunca cuántas filas hay**. Con una sola persona la única celda se
   comía el escenario entero y el `object-fit: cover` del video recortaba la cara a pantalla completa.
   Hoy lo reparte `mosaico()` en `src/dominio/teletrabajo.ts` — función pura, probada en
   `pruebas/teletrabajo.test.js` sin DOM ni red — que recibe la medida real del contenedor
   (`useMedida`, `src/lib/medidas.ts`, sobre `ResizeObserver`) y devuelve columnas, filas y el **ancho
   exacto de cada ficha**. La ficha es la caja 16:9 más grande que entra en su celda, centrada — no la
   celda entera, que es lo que antes recortaba las caras. Tiene una holgura del 10%
   (`HOLGURA_A_LO_ANCHO`) que hace ganar al reparto con más columnas cuando la diferencia de tamaño es
   imperceptible: sin ella, dos personas en una pantalla apaisada salían apiladas con media pantalla
   vacía a los costados.

## Estados del escenario

`src/componentes/teletrabajo/Escenario.tsx` elige entre tres repartos, cada uno porque el anterior
falla en su caso:

- **Con pantalla compartida**, esa pista pasa al foco y las cámaras bajan a una tira lateral. Una
  segunda pantalla compartida va a la tira igual — no se descarta en silencio, o quien la comparte cree
  que no está pasando nada.
- **Con una sola persona**, `EstadoSolo.tsx`: la ficha queda acotada y centrada en vez de estirada a
  pantalla completa, con "Estás solo en la sala" y un botón para copiar el enlace.
- **Con dos o más**, `Mosaico.tsx`, la grilla medida de la sección anterior.

## Fichas propias sobre la cáscara de LiveKit

`FichaParticipante.tsx` y `FichaDePantalla.tsx` usan `ParticipantTile` como cáscara, con `children`
propios: conserva los atributos `data-lk-*` de los que depende el CSS de la librería (espejo de la
cámara propia, anillo de "está hablando"), pero reemplaza el contenido. Dos motivos concretos:

- El marcador de cámara apagada usa el `Avatar` del sistema (iniciales sobre color derivado del
  nombre) en vez del monigote genérico de la librería.
- El tile de pantalla compartida de fábrica escribe el literal **en inglés** `"'s screen"`
  (`node_modules/@livekit/components-react/dist/prefabs-BEB1UEnC.mjs:720`), y el proyecto responde
  siempre en español.

## Chat

`ChatDeSala.tsx`, sobre `useChat`. Viaja por el canal de datos de la llamada — el token concede
`canPublishData: true` al firmar, no publica media — y **no se guarda**: quien entra después de un
mensaje no lo ve. Eso se dice en la propia interfaz ("Los mensajes no se guardan. Quien entra después
no ve lo anterior."), y por eso la portada no promete lo contrario.

## Foto de perfil

LiveKit no tiene campo para eso, así que viaja como JSON en `metadata` del token
(`{"imagen": ...}`, ver `firmarEntrada` en `src/datos/teletrabajo.ts`). Se lee con
`imagenDeMetadata()` en `src/dominio/teletrabajo.ts`, que devuelve `null` ante cualquier cosa rara:
llega por la red y puede venir vacía, de otra versión del formato o de un token firmado a mano. La usan
tres lugares: las fichas de video, el panel de participantes y la consulta de quién está dentro que
corre en el servidor.

## Ocupación

`ocupacionDeSalas()` y `quienEstaEn()`, en `src/datos/teletrabajo.ts`, sobre `RoomServiceClient`. Dos
trampas que hay que dejar escritas:

- `LIVEKIT_URL` viene en `wss://` porque es la que abre el WebSocket desde el navegador, y la API de
  administración es HTTP: hay que traducir el esquema (`administracion()` hace
  `url.replace(/^ws/, 'http')`). Es el error silencioso más fácil de cometer acá — la URL parece
  correcta y el cliente no conecta nunca.
- `listRooms()` sólo devuelve las salas que existen **ahora**: una sala vacía no aparece en la
  respuesta, y eso es cero, no error.

Si la consulta a LiveKit falla, las dos funciones devuelven `null` y **no se pinta ningún contador** —
ni en la portada, ni la lista de "quién está dentro" de la antesala. Mostrar "0 dentro" cuando en
realidad falló la consulta afirmaría algo falso.

## Detalle del armazón

El alto del escenario es `h-[calc(100dvh-5.5rem)]` (constante `ALTO` en `Llamada.tsx`), que descuenta
la cabecera del panel (`h-14`) y el relleno de `ScrollSuave` (`p-4`, arriba y abajo). Son los dos únicos
números entre la ventana y el módulo.

Todo contenedor con scroll propio dentro de la llamada — la tira de pantallas/cámaras en `Escenario`,
la lista de `PanelDeParticipantes`, los mensajes de `ChatDeSala` — lleva `data-lenis-prevent`, o el
scroll suave del armazón se come el gesto y el contenedor no se mueve.

## Identidad y token

`identidadDe(staffId, sufijo)` en `src/dominio/teletrabajo.ts` produce `staff-<id>-<8 hex>`. El sufijo
aleatorio (calculado en `[sala]/page.tsx` con `crypto.randomUUID().slice(0, 8)`) existe porque LiveKit
usa la identidad como clave del participante: una segunda conexión con la misma identidad expulsa a la
primera. Sin él, abrir dos pestañas de la misma persona la echaría de la primera.

El token (`firmarEntrada` en `src/datos/teletrabajo.ts`) vale 4 horas y **no** concede `roomCreate`:
las salas nacen con `auto_create` del servidor, así que un token filtrado no puede fabricar salas fuera
del catálogo.

## Visibilidad en el panel

La sección aparece en la barra lateral (`src/app/(panel)/layout.tsx`, función `seccionesDe`) **sin
condición**, a diferencia del resto de los módulos: no hay `secciones_habilitadas` ni `permissions` que
consultar, porque Teletrabajo no es una feature de Perfex y esa lista la arma el backend sólo para lo
que es suyo. Condicionarla a esa bandera la escondería siempre. Quién entra a cada sala lo sigue
decidiendo `puedeEntrar()`, sala por sala, en el servidor — la barra lateral no es control de acceso.

## Archivos

| Archivo | Qué hace |
|---|---|
| `src/app/(panel)/teletrabajo/page.tsx` | Portada: salas + ocupación |
| `src/app/(panel)/teletrabajo/[sala]/page.tsx` | Autorización y firma del token |
| `src/app/(panel)/teletrabajo/[sala]/Sala.tsx` | Alterna antesala ↔ llamada |
| `src/componentes/teletrabajo/Antesala.tsx` | Preview, dispositivos, quién está |
| `src/componentes/teletrabajo/Llamada.tsx` | `LiveKitRoom` y el armado de la pantalla |
| `src/componentes/teletrabajo/CabeceraDeSala.tsx` | Título, estado de conexión, quién sos |
| `src/componentes/teletrabajo/Escenario.tsx` | Elige entre foco, estado solo y mosaico |
| `src/componentes/teletrabajo/Mosaico.tsx` | La grilla medida |
| `src/componentes/teletrabajo/EstadoSolo.tsx` | Una sola persona en la sala |
| `src/componentes/teletrabajo/FichaParticipante.tsx` | Ficha de video propia sobre `ParticipantTile` |
| `src/componentes/teletrabajo/FichaDePantalla.tsx` | Ficha de pantalla compartida, en español |
| `src/componentes/teletrabajo/BarraDeControles.tsx` | Micrófono, cámara, pantalla, salir |
| `src/componentes/teletrabajo/MenuDeDispositivos.tsx` | Elegir dispositivo dentro de la llamada |
| `src/componentes/teletrabajo/PanelDeParticipantes.tsx` | Lista lateral de quién está |
| `src/componentes/teletrabajo/ChatDeSala.tsx` | Chat por canal de datos, sin guardar |
| `src/componentes/teletrabajo/errores.ts` | Traduce los fallos de dispositivo |
| `src/componentes/teletrabajo/tipos.ts` | Tipos compartidos del módulo |
| `src/dominio/teletrabajo.ts` | Reglas de acceso, mosaico, metadata |
| `src/datos/teletrabajo.ts` | Firma del token y ocupación (server-only) |
| `src/lib/medidas.ts` | `useMedida` (`ResizeObserver`) |
| `src/estilos/livekit.css` | Tema `wiwo` y clases `sobre-video` / `lienzo-video` |
| `pruebas/teletrabajo.test.js` | Acceso, mosaico, metadata |
| `pruebas/teletrabajo-errores.test.js` | Mensajes de fallo de dispositivo |
