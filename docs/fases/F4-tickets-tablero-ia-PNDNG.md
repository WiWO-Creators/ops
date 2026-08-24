# F4 — Tickets, tablero e IA

Soporte, el tablero de inicio completo, y la capa de IA que motivó buena parte del proyecto.

## Qué se construye

### Tickets

Lista, detalle con hilo de respuestas, respuestas predefinidas, adjuntos, estados y prioridades.

### Tablero de inicio

Los widgets que valen la pena de los 14 actuales: indicadores, resumen financiero, gráficos de
prospectos, pagos y Procesos. Con `Grafico` y `Calendario` del sistema de diseño, que hasta acá
estaban fuera de alcance.

### IA

Perfex ya sabe hablar con un LLM: `application/services/ai/AiProviderRegistry.php` y
`modules/openai/src/OpenAiProvider.php`. Lo que agrega `ops-v2` no es la capacidad, sino **streaming
al navegador y contexto de interfaz** — que en una MPA de CodeIgniter es doloroso.

En orden de valor:

1. **Redacción en sitio con streaming.** `src/app/api/ia/[accion]/route.ts` reenvía a
   `POST /api/v1/ia/completar` y devuelve la respuesta como stream. El texto aparece token a token
   dentro del editor o del área de comentarios. Casos: resumir un hilo de Ticket, redactar la
   descripción de un Proceso, borrador de respuesta al cliente.
2. **Buscador ⌘K en lenguaje natural.** "facturas vencidas de Acme" devuelve **una definición de
   filtro** —el mismo objeto que consume el motor de tablas—, no prosa. La tabla se aplica sola.
   Esto sólo es barato porque las tablas ya son declarativas: es la sinergia entre el motor de F1 y
   esta fase, y la razón por la que el motor se diseñó así.
3. **Panel de contexto por entidad.** En un Espacio: qué cambió esta semana, Procesos estancados,
   riesgos. `POST /api/v1/ia/contexto {tipo, id}`, con datos reales, mostrado en streaming.
4. **Acciones sugeridas con confirmación humana.** La IA propone ("mover estos 3 Procesos a
   Bloqueado"), la persona confirma, y el frontend ejecuta la mutación normal.

## Reglas de la capa de IA

- **El frontend no habla con ningún proveedor de IA.** Habla con `/api/bff/ia/*`, y Perfex decide
  proveedor, modelo, límites y auditoría vía `AiProviderRegistry`. Así la IA queda sujeta a los mismos
  permisos que el resto del sistema.
- **La clave del proveedor jamás llega al navegador.**
- **Nunca ejecución directa desde el modelo.** Toda acción pasa por confirmación humana y por la misma
  mutación que usaría una persona — con sus permisos y su registro de actividad.
- Lo que la IA lee está acotado por los permisos del staff dueño del token. Un usuario no obtiene por
  IA lo que no puede ver por pantalla.

## Criterios de aceptación

1. Resumir un Ticket con más de 20 respuestas: el texto aparece en streaming, no de golpe tras una
   espera.
2. La clave de OpenAI no aparece en ninguna respuesta ni en el paquete del cliente.
   `grep -rn "sk-" .next/` no devuelve nada.
3. El buscador ⌘K con "Procesos urgentes sin asignar" aplica el filtro correcto en la tabla.
4. Un staff sin permiso sobre facturas no obtiene datos de facturas por el panel de contexto.
5. Una acción sugerida no se ejecuta hasta que alguien la confirma, y al confirmarse deja registro de
   actividad con el staff real como autor.
6. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | La IA filtra datos que el usuario no debería ver | El contexto se arma en Perfex con los permisos del token. Criterio 4 |
| R2 | Inyección de instrucciones desde contenido del sistema (un comentario de cliente que dice "ignora tus instrucciones") | El contenido del usuario va como dato, nunca como instrucción. Ninguna salida del modelo ejecuta nada sin confirmación |
| R3 | Coste sin techo | Límite por staff y por día, en Perfex. Se mide antes de subirlo |
| R4 | El streaming se corta y deja el editor a medias | El editor conserva el borrador local; el stream escribe en una capa que se confirma al terminar |

## Deuda consciente

- Sin memoria entre consultas: cada petición es independiente.
- Sin RAG sobre documentos: el contexto es el que arma Perfex con consultas.
- Canales privados de Pusher: sólo si algún día el evento lleva datos.

## Lo que se aprendió

_(Se completa al cerrar la fase.)_
