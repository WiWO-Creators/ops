# Mejoras: Thinking Orb (pestaña del proyecto y orbe flotante) — 2026-10-13

**Alcance**: `src/componentes/ia/*`, `src/componentes/estado/Orbe.tsx`, `src/estilos/thinking-orb.css`, `src/dominio/{ia,ia-chat,orbe,orbe-sujeto,tamano-chat}.ts` · **Lentes**: visual-ux, funcional, estructural, rendimiento, seguridad-calidad · **Hallazgos**: 38 en bruto, 23 tras fusionar (10 altos · 10 medios · 3 bajos)

## Resumen
Con el motor único, el staff usa `ChatAgente`. Este perdió varias funciones que tenía el motor antiguo (`ConversacionOrbe`): el estado vacío con sugerencias, las citas y fuentes, el envío con Enter, las preguntas pulsables y el orbe animado mientras piensa. El orbe flotante no refleja el estado de la ejecución ni el contexto de la página.

Las tres mejoras de más valor son:
- devolverle a `ChatAgente` el nivel del motor antiguo (quick wins);
- extraer primitivas compartidas para que el rediseño se haga en un solo lugar;
- crear un estado de conversación compartido entre la pestaña, el panel y el botón flotante (FAB).

Varios hallazgos repiten V4–V8 y F3 de `thinking-orb-colaborador-2026-10-05.md`.

## Priorización
### Quick wins (impacto alto/medio, esfuerzo S)
| ID | Lente | Mejora | Ubicación |
|---|---|---|---|
| V1 | visual | Estado vacío con sugerencias y fuentes en el agente | `ChatAgente.tsx:122` |
| V2 | visual | Mostrar el estado «pensando» con el orbe y explicar el compositor bloqueado | `ChatAgente.tsx:115,129,152` |
| F2·V4 | funcional/visual | Enter para enviar y Shift+Enter para salto de línea | `ChatAgente.tsx` (compositor) |
| F5·R3a | funcional/rendimiento | Scroll inicial al final y umbral de proximidad también en el motor antiguo | `ChatAgente.tsx:85`, `ChatOrbe.tsx:198` |
| F7 | funcional | Salida clara de una ejecución fallida o incompleta | `ChatAgente.tsx:45` |
| F4 | funcional | «Eliminar chat» coherente con el 409 y con un fallo parcial | `ChatAgente.tsx:173` |
| V5·V8·E3 | visual/estructural | Tokens (`rounded-tarjeta`, par `-contenido`), `ASISTENTE` y copy humano | `ChatAgente.tsx:126,198`, `ChatOrbe.tsx:131` |
| R1 | rendimiento | Carga diferida del chat (sale react-markdown del bundle global) | `OrbeChatIA.tsx:17` |

### Proyectos (impacto alto, esfuerzo M/L)
| ID | Lente | Mejora | Ubicación |
|---|---|---|---|
| E1·E2 | estructural | Separar `ConversacionOrbe` y extraer marco, compositor, burbujas y autoscroll compartidos | `ChatOrbe.tsx`, `ChatAgente.tsx` |
| E4·F3·R4 | estructural/funcional/rendimiento | `useEjecucionesAgente` y polling robusto (backoff, pausa con la pestaña oculta, aviso de «detenida») | `ChatAgente.tsx:60-81` |
| V3 | visual | Preguntas del agente como opciones pulsables | `ChatAgente.tsx:138` |
| V6 | visual | Plan agéntico: paso activo animado, acciones fijas y pasos destructivos marcados | `PlanEjecucion.tsx:35` |
| E6·V2b | estructural/visual | Estado compartido de conversación (fase) para pestaña, panel y FAB | `OrbeChatIA.tsx:308` |
| F1·F6 | funcional | Contexto de página y acta, continuidad con el hilo del proyecto y borrador persistente | `ChatAgente.tsx:102`, `OrbeChatIA.tsx:93` |
| V7·E8·R3b | visual/estructural/rendimiento | Panel flotante: hoja a pantalla completa en móvil, cabecera con acciones, Cmd/Ctrl+K y redimensionado sin re-render | `OrbeChatIA.tsx:86-289` |
| R2·R7 | rendimiento | Streaming memoizado con deltas por rAF y variante ligera de `<Orbe>` | `ChatOrbe.tsx:268-398`, `Orbe.tsx:111` |
| R6 | rendimiento | Animación del orbe solo con transform y opacity, y orbe en reposo con el chat abierto | `thinking-orb.css:185,1190` |
| F8 | funcional | Copiar, reintentar, editar, citas, historial paginado y varios hilos | `ChatAgente.tsx` |
| E7·R8 | estructural/rendimiento | Aplanar `thinking-orb.css` (3 o más versiones superpuestas) con una línea base visual previa | `thinking-orb.css` |

### Menores
| ID | Lente | Mejora | Ubicación |
|---|---|---|---|
| S1 | seguridad | Vaciar `HILOS` al cerrar sesión | `ia-chat.ts:113` |
| S2 | seguridad | Mostrar el dominio de los enlaces externos del modelo | `TextoChat.tsx:25` |
| S3 | seguridad | Rechazar caracteres de control en `href` de navegar | `ia.ts:594` |
| S4·S5 | calidad | Tests de render del portal sin escrituras y aserciones de solo lectura en el mock | `ChatOrbe.tsx:257`, `mock/orbe-portal.test.js` |
| S6 | seguridad | Clave de idempotencia en confirmar y cancelar | `ChatAgente.tsx:93` |
| E5 | estructural | `leerCapacidadesOrbe` y hook compartido con el layout del portal; capacidades en caché (R5) | `ChatOrbe.tsx:99` |

## Conflictos entre lentes
- **R6 contra la identidad visual**: aligerar el halo y el `border-radius` animado cambia el aspecto. Recomendación: hacerlo junto con E7 y con capturas por estado.
- **E2 contra la UX**: unificar el compositor cambia el teclado en el agente. Es deseable (F2), así que se acepta.
- **F6, ámbito del flotante**: cambiar el flotante al hilo del proyecto deja oculto el hilo global. Recomendación: ofrecer «Continuar en el hilo de X» en vez de cambiar el ámbito en silencio.

## No revisado / supuestos
- Ninguna prueba en navegador ni medición real: los impactos de rendimiento salen de la lectura del código.
- No se revisaron la autorización real del backend del portal (solo el mock) ni el flag del agente en producción.
- Tampoco la vigencia en el navegador de cada regla de `thinking-orb.css` ni el detalle de `TarjetaPropuestaIA` y `BotonDictado`.
- S1 depende de si el login del portal recarga la página.
