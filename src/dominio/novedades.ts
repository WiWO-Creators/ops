/**
 * Las novedades de Ops: lo que cambió, contado para quien lo usa y no para quien lo programó.
 *
 * === POR QUE UNA LISTA ESCRITA A MANO Y NO EL LOG DE GIT ===
 *
 * Los commits hablan de migraciones, mocks y BFF. A quien usa el panel le importa otra cosa: que
 * puede buscar por patente, o que ahora la Tarea le pide fecha. Cada entrada resume uno o varios
 * merges en una frase que se entienda sin saber cómo está hecho el sistema, y guarda los hashes
 * para que el equipo técnico pueda rastrear de dónde salió.
 *
 * Vive en el repo —y no en la base— porque se publica con el mismo push que publica el cambio: la
 * novedad y el código llegan juntos a producción, y no hay forma de anunciar algo que no se desplegó.
 *
 * === QUE NO VA ACA ===
 *
 * Lo que está desplegado pero apagado (interruptores que nacen en cero, claves sin configurar) y lo
 * que es interno del equipo técnico. Una novedad que nadie puede ver es una promesa rota.
 *
 * Para redactar las nuevas: `node scripts/novedades-borrador.mjs` lista los merges posteriores a la
 * última entrada.
 */

/** Qué clase de cambio es. Decide el color y el rótulo de la insignia. */
export type TipoNovedad = 'nuevo' | 'mejora' | 'arreglo'

export interface Novedad {
  /** Día en que llegó a producción, `YYYY-MM-DD`. */
  fecha: string
  tipo: TipoNovedad
  /** Una frase corta, en el idioma de quien usa el panel. */
  titulo: string
  /** Una o dos frases más, si hacen falta para entender dónde está o para qué sirve. */
  detalle?: string
  /** Hashes de los merges que la originan, con el repo delante: `ops-v2@78251e9`. */
  commits: string[]
}

/** Las novedades de un mismo día, ya ordenadas. */
export interface DiaDeNovedades {
  fecha: string
  novedades: Novedad[]
}

/** Rótulo visible de cada tipo. */
export const ROTULO_TIPO: Record<TipoNovedad, string> = {
  nuevo: 'Nuevo',
  mejora: 'Mejora',
  arreglo: 'Arreglo'
}

/**
 * Las novedades, de la más reciente a la más vieja. Las nuevas se agregan ARRIBA.
 */
export const NOVEDADES: Novedad[] = [
  {
    fecha: '2026-10-05',
    tipo: 'mejora',
    titulo: 'La bandeja de Tickets muestra solo los abiertos',
    detalle: 'Al entrar a Tickets ya no ves los cerrados: el filtro Estado dice «Abiertos». Para verlos todos, abre Estado y marca «Todos»; «Limpiar filtros» vuelve a los abiertos.',
    commits: []
  },
  {
    fecha: '2026-10-05',
    tipo: 'nuevo',
    titulo: 'Cambia un ticket de Proyecto desde su ficha',
    detalle: 'Junto al nombre del Proyecto hay una flecha para mover el ticket a otro Proyecto de su mismo cliente, o dejarlo sin Proyecto. Si el cambio no es posible, te explica por qué.',
    commits: []
  },
  {
    fecha: '2026-10-05',
    tipo: 'mejora',
    titulo: 'La conversación del ticket abre en el último mensaje',
    detalle: 'Al abrir un ticket largo ya estás en el mensaje más reciente. Si llega uno nuevo mientras lees más arriba, aparece «Nuevos mensajes» para ir a él sin que se te mueva la pantalla.',
    commits: []
  },
  {
    fecha: '2026-10-05',
    tipo: 'mejora',
    titulo: 'Portal: tus tickets muestran su Proyecto',
    detalle: 'En la lista de tickets del portal hay una columna nueva con el Proyecto de cada ticket.',
    commits: []
  },
  {
    fecha: '2026-10-05',
    tipo: 'mejora',
    titulo: 'Tickets más claros y sin perder lo que escribes',
    detalle: 'Al crear un ticket desde el portal, lo que escribes se guarda como borrador hasta que lo envías, y cuando te acercas al largo máximo del mensaje aparece un contador. En la lista del portal la última columna ahora dice «Última actividad», el estado y la prioridad editables muestran una flecha y en el móvil se ve a quién espera cada ticket.',
    commits: []
  },
  {
    fecha: '2026-10-05',
    tipo: 'arreglo',
    titulo: 'Portal: los tickets cargan aunque falle la lista de Proyectos',
    detalle: 'Si no se pueden cargar tus Proyectos, la página de tickets sigue funcionando y el botón «Nuevo ticket» se reemplaza por un aviso con la opción de reintentar. Un adjunto que no carga ya no impide abrir el ticket.',
    commits: []
  },
  {
    fecha: '2026-10-05',
    tipo: 'mejora',
    titulo: 'Focals en tarjetas, con el logo del cliente y por páginas',
    detalle: 'Cada cuenta es una tarjeta con su logo, su puntaje y quien responde por ella, de a doce por página. Al hacer clic en una se abre el detalle en un panel lateral.',
    commits: []
  },
  {
    fecha: '2026-10-05',
    tipo: 'mejora',
    titulo: 'Focals más limpio y con salida para las cuentas sin focal',
    detalle: 'Si una cuenta tiene un solo Proyecto, su desglose ya no se repite. «Sin cambio» reemplaza al «– 0», las señales que no aplican dicen «No aplica» y una nota explica qué señales cuentan en el puntaje. En las cuentas sin focal aparece «Asignar focal», que lleva a la pestaña Focales del Cliente.',
    commits: []
  },
  {
    fecha: '2026-10-02',
    tipo: 'nuevo',
    titulo: 'Seguimiento de lo que hacen los clientes en el portal',
    detalle: 'En la ficha del Cliente, la pestaña «Actividad del portal» muestra cuándo entran sus contactos, qué páginas, pestañas y proyectos abren más y menos, qué botones pulsan y cuánto tiempo pasan. Desde cada contacto puedes abrir su recorrido sesión por sesión. Lo que hace el equipo con «Ver como cliente» no cuenta.',
    commits: ['ops-v2@b777515', 'board@f2817fe']
  },
  {
    fecha: '2026-10-02',
    tipo: 'mejora',
    titulo: 'Patente en todos los buscadores',
    detalle: 'Los selectores de Tareas y Proyectos (jornada, alta de Tarea, sumar a un hito y filtros de recurrentes) ahora encuentran por patente y la muestran junto al nombre.',
    commits: []
  },
  {
    fecha: '2026-09-30',
    tipo: 'nuevo',
    titulo: 'Adjuntar archivos al crear una Tarea',
    detalle: 'Al crear una Tarea ahora puedes adjuntar archivos en el mismo formulario y se guardan en el Drive de la Tarea, sin tener que abrirla después.',
    commits: ['ops-v2@fb5ecb3']
  },
  {
    fecha: '2026-09-30',
    tipo: 'mejora',
    titulo: 'Tablero del proyecto: elige un mes ya cerrado',
    detalle: 'En el tablero del proyecto puedes escoger un mes cerrado y verlo tal como quedó al cierre, con sus cifras y gráficos.',
    commits: ['ops-v2@e04108a', 'board@ec75ec3']
  },
  {
    fecha: '2026-09-30',
    tipo: 'mejora',
    titulo: '«Ver como cliente» a la vista en los contactos',
    detalle: 'En la ficha del cliente, cada contacto tiene un botón visible para ver el portal tal como lo ve esa persona.',
    commits: ['ops-v2@54be877']
  },
  {
    fecha: '2026-09-29',
    tipo: 'nuevo',
    titulo: 'Reporte mensual en el portal del cliente',
    detalle: 'El portal del cliente tiene un reporte mensual de cada proyecto con lo que ya puede ver: tareas, entregables y, si están visibles, el Meeting Paper y las horas. En cada tarea se marca si hay entregable y se puede dejar un enlace.',
    commits: ['ops-v2@ec4540c', 'board@608f921']
  },
  {
    fecha: '2026-09-29',
    tipo: 'nuevo',
    titulo: 'Ver el portal como un contacto del cliente',
    detalle: 'En la ficha del cliente, el menú de cada contacto tiene «Ver como cliente»: entras al portal tal como lo ve esa persona, con una franja arriba para terminar. Cualquiera que pueda ver al cliente puede usarlo, y queda registrado quién entró.',
    commits: ['ops-v2@d16599a', 'board@a678b9c']
  },
  {
    fecha: '2026-09-29',
    tipo: 'nuevo',
    titulo: 'Contratos para Finanzas y Comercial',
    detalle: 'Hay una sección Contratos donde las áreas autorizadas ven, crean y editan contratos. El superadmin define con el botón «Acceso» qué áreas entran.',
    commits: ['ops-v2@d061f03', 'board@03a2bb6']
  },
  {
    fecha: '2026-09-29',
    tipo: 'mejora',
    titulo: 'Seguidores predeterminados por proyecto y plantilla',
    detalle: 'Quien configura un proyecto o una plantilla puede dejar seguidores predeterminados: se suman solos a las tareas nuevas y reciben las notificaciones normales. Las tareas que ya existen no cambian.',
    commits: ['ops-v2@9bb9bfe', 'board@fce67c1']
  },
  {
    fecha: '2026-09-29',
    tipo: 'mejora',
    titulo: 'Una licitación puede tener varias áreas',
    detalle: 'En el asistente de licitación ahora se eligen varias áreas, y el filtro por área encuentra la licitación en cualquiera de ellas.',
    commits: ['ops-v2@f2b96cf', 'board@5e148db']
  },
  {
    fecha: '2026-09-29',
    tipo: 'mejora',
    titulo: 'Las escenas de actualización cuentan qué cambió en Ops',
    detalle: 'Al entrar tras una actualización, las escenas de bienvenida muestran el contexto de Ops, y en Administración hay un laboratorio para ensayarlas.',
    commits: ['ops-v2@f930375', 'ops-v2@b56c9cd']
  },
  {
    fecha: '2026-09-29',
    tipo: 'mejora',
    titulo: 'Jerarquías ahora se llama Organización',
    detalle: 'El organigrama y la administración de accesos están en una sola pantalla. Quien administra edita a cada persona en un panel con todo junto: puesto, jefe, área, cargo y rol. También puede ver por qué alguien ve lo que ve, cambiar a varias personas a la vez y revisar el historial de cambios.',
    commits: []
  },
  {
    fecha: '2026-09-28',
    tipo: 'nuevo',
    titulo: 'Meeting Paper: "Solo transcribir"',
    detalle: 'En la pestaña Meeting Paper de un Proyecto, "Solo transcribir" graba o sube un audio y devuelve el texto sin escribir un acta. Se puede copiar, descargar o usar para crear un Meeting Paper después. Se guarda 24 horas y se borra solo.',
    commits: []
  },
  {
    fecha: '2026-09-28',
    tipo: 'mejora',
    titulo: 'Un mismo lenguaje visual en todo Ops: personas, tablas, avisos y confirmaciones',
    detalle: 'El nombre de una persona ahora es siempre clickeable y muestra su tarjeta al pasar el mouse por encima, en cualquier pantalla. Las tablas de los listados se ven y se filtran igual en todos lados, y el filtro que elegiste sigue ahí si recargas la página. El menú "⋯" de cada fila y la confirmación antes de borrar o cancelar algo tienen el mismo aspecto en todo el sistema, y guardar o borrar algo siempre avisa con el mismo mensaje flotante. Lo que antes se llamaba Proceso y Espacio ahora se llama Tarea y Proyecto (la URL pasó de /procesos a /tareas), y las fechas se muestran en formato chileno.',
    commits: []
  },
  {
    fecha: '2026-09-28',
    tipo: 'mejora',
    titulo: 'Animaciones más cuidadas en la bienvenida, el aviso de versión nueva y Novedades',
    detalle: 'La escena de bienvenida tras actualizar, la barra de "hay una versión nueva" y la lista de Novedades ahora animan con más pulido. Respetan "menos movimiento" cuando el sistema lo pide.',
    commits: []
  },
  {
    fecha: '2026-09-28',
    tipo: 'arreglo',
    titulo: 'Supervisión: tu hoja ya no muestra gente que no está a tu cargo',
    detalle: 'Si diriges un área, ya no ves las tareas ni la hoja de quien solo la comparte contigo sin reportarte: tu equipo es exactamente tu gente a cargo, directa o en cadena.',
    commits: []
  },
  {
    fecha: '2026-09-28',
    tipo: 'mejora',
    titulo: 'Drive de la Tarea admite archivos grandes (videos)',
    detalle: 'Los archivos de más de 25 MB ya no se rechazan: suben directo al Drive, en trozos y con barra de avance, hasta 2 GB.',
    commits: []
  },
  {
    fecha: '2026-09-28',
    tipo: 'mejora',
    titulo: 'Supervisión: agrupar por área y hoja impresa sin tareas completadas',
    detalle: 'La hoja diaria ya agrupa por cliente, persona o área, y "Agrupar por persona" solo junta a tu gente a cargo. La hoja para imprimir ya no lista las tareas completadas del día; en pantalla se siguen viendo.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'La llamada de Teletrabajo ya no se corta al cambiar de pantalla',
    detalle: 'Mientras estás en una llamada puedes moverte por Ops: abajo a la derecha queda una ventanita con la llamada, desde donde silencias el micrófono, apagas la cámara, cuelgas o vuelves a la sala.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'Supervisión por equipo: la hoja incluye a tu gente y tu jefatura la confirma',
    detalle: 'Si tienes gente a cargo, tu hoja diaria ya trae sus tareas aunque no tengas clientes asociados, y también las de los clientes donde eres Focal. Muestra las completadas del día, lo que ya revisó tu equipo y se puede agrupar por cliente o por persona. Al firmarla, tu jefatura la ve en "Hojas de tu equipo" y la confirma o te la devuelve con una nota.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'Las tareas del Meeting Paper se crean con un clic y vienen con más detalle',
    detalle: 'Cada tarea propuesta tiene su botón "Crear tarea", y "Crear todas" las pasa al proyecto de una vez. La IA ahora lee el Meeting Paper completo y escribe cada tarea con su objetivo y los detalles que se hablaron, y la tarea creada cita la reunión de la que salió. Para mejorar las propuestas de un Meeting Paper anterior, usa "Volver a analizar".',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'nuevo',
    titulo: 'Supervisión diaria: la hoja de tareas vencidas de tus clientes',
    detalle: 'Si eres Lead o superior y supervisas clientes, en Equipo → Supervisión ves cada día las tareas que vencen o ya vencieron, las marcas OK o No OK con una nota y firmas la hoja. También se puede imprimir para revisarla en papel. Los supervisores de cada cliente se eligen en su ficha, pestaña Supervisión.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'nuevo',
    titulo: 'Papelera: lo eliminado se puede recuperar durante 30 días',
    detalle: 'Eliminar un proyecto, una tarea o un cliente ya no lo borra: lo manda a la Papelera, en el bloque Administración, donde queda 30 días invisible para todos. Desde ahí los administradores lo restauran entero o lo borran para siempre.',
    commits: ['ops-v2@4a55f91', 'board@d1ae48f']
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'Las etiquetas se escriben y te sugieren las que ya existen',
    detalle: 'Al escribir una etiqueta en una tarea o en una licitación, abajo aparecen las que ya existen y se le parecen, incluso con errores de tipeo. Si no está, eliges "Crear" y queda creada al guardar. Las licitaciones ahora también tienen etiquetas, al crearlas y al editarlas.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'El Meeting Paper te muestra sus tareas apenas termina',
    detalle: 'Al terminar de escribir un Meeting Paper, la pantalla baja sola a las tareas que la IA encontró en él, para que las revises y crees las que correspondan. Los Meeting Papers anteriores tienen un botón "Analizar buscando tareas", y el Thinking Orb también puede analizarlos y proponértelas. Ninguna tarea se crea sin tu confirmación.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'El Upselling se edita completo desde su ficha',
    detalle: 'Editar ahora junta en un solo formulario el nombre, las fechas, las horas y la descripción del proyecto con el monto, la moneda, la probabilidad y las notas de la oportunidad. Se puede corregir también después de ganarla o perderla, y hay un botón para eliminar la que no debió crearse.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'nuevo',
    titulo: 'Las novedades de Ops ahora aparecen en el Inicio',
    detalle: 'Arriba de "Mi trabajo" ves lo último que cambió en el sistema. Si ya lo leíste, lo ocultas con la X y vuelve solo cuando haya algo nuevo.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'nuevo',
    titulo: 'Cada recurrencia muestra las tareas que generó y avisa cuando nadie las usa',
    detalle: 'En Tareas recurrentes, "Ver copias" lista cada tarea generada y si alguien la usó: cambios de estado, comentarios, tiempo, archivos o checklist. La vista "Sin uso" junta las reglas con varias copias seguidas sin movimiento, y un administrador puede mandar esas copias a la papelera y, de paso, pausar o dejar de repetir la regla. La ficha de cada copia dice qué recurrencia la creó.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'Las tareas recurrentes se editan, se pausan y saltan días',
    detalle: 'En Tareas recurrentes, "Editar regla" abre en un clic la frecuencia, el inicio y cómo termina, con una vista previa de las próximas copias. Puedes marcar días en que no se generan copias (por ejemplo, sin fines de semana) y pausar una regla sin perderla: al reanudarla sigue desde hoy. La ficha de la Tarea también muestra su recurrencia.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'nuevo',
    titulo: 'Ops se puede instalar como aplicación, también en el computador',
    detalle: 'Si usas Ops desde el navegador, una vez al día aparece un aviso para instalarlo. En Chrome, Edge y Brave basta con tocar Instalar; en iPhone, iPad y Safari de Mac el aviso explica los pasos.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'nuevo',
    titulo: 'Los archivos de Drive se ordenan arrastrando',
    detalle: 'En la pestaña Archivos puedes arrastrar archivos y carpetas a otra carpeta, soltar archivos desde tu computador para subirlos y crear carpetas dentro del Proyecto. Las carpetas de cada Tarea quedan con candado, pero reciben lo que sueltes. También hay búsqueda, orden y vista de cuadrícula.',
    commits: ['ops-v2@94427d8']
  },
  {
    fecha: '2026-09-25',
    tipo: 'nuevo',
    titulo: 'Cada licitación guarda el link a la carpeta de su propuesta',
    detalle: 'Se pega arriba de la ficha de la licitación y queda a un clic para todo el equipo. También aparece en la columna Carpeta del listado.',
    commits: ['board@c252755']
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'Toda la licitación se edita desde un solo botón',
    detalle: 'Editar reúne el nombre, las fechas y la descripción del proyecto con los datos de la licitación, sus responsables y la carpeta de la propuesta.',
    commits: []
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'El menú de la izquierda ya no tiene scroll',
    detalle: 'Cada bloque del menú se pliega tocando su título, y el panel recuerda cómo lo dejaste. Equipo y Administración empiezan cerrados.',
    commits: ['ops-v2@99e31fa']
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'Elegir el Proyecto de la jornada es más fácil',
    detalle: 'La lista muestra todos tus Proyectos con su código y su cliente, y se busca por cualquiera de los tres: "campaña consalud" o "CNSA-001" lo encuentran.',
    commits: ['ops-v2@1fc8ff6']
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'Importar Tareas de otro Proyecto ya no exige un Hito',
    detalle: 'Por defecto entran sueltas. Si quieres agruparlas, eliges un Hito o escribes el nombre de uno nuevo y se crea al importar. Cada Tarea importada muestra de qué Proyecto vino, aunque ese Proyecto después se borre.',
    commits: ['board@4b7e49d']
  },
  {
    fecha: '2026-09-25',
    tipo: 'mejora',
    titulo: 'La hora de "¿Estás ahí?" se configura en Administración',
    detalle: 'Los superadministradores tienen una pestaña Jornada para encender la pregunta, fijar su hora y los minutos entre preguntas.',
    commits: ['ops-v2@2fb63f6']
  },
  {
    fecha: '2026-09-24',
    tipo: 'mejora',
    titulo: 'La jornada pregunta "¿Estás ahí?" antes de cerrarse',
    detalle: 'A la hora de corte suena un aviso. Si sigues trabajando, contestas y te vuelve a preguntar en media hora; si nadie contesta en media hora, la jornada se cierra sola.',
    commits: ['board@28c5764']
  },
  {
    fecha: '2026-09-24',
    tipo: 'nuevo',
    titulo: 'Te avisamos cuando comentan tus Tareas',
    detalle: 'Si comentan una Tarea que tienes asignada, que sigues o que creaste, te llega a la campana. Si te mencionan, el aviso lo dice.',
    commits: ['board@616c0b1']
  },
  {
    fecha: '2026-09-24',
    tipo: 'mejora',
    titulo: 'Cabecera del Proyecto más visible',
    detalle: 'El nombre y la imagen del Proyecto se ven más grandes al entrar a él.',
    commits: ['ops-v2@2eeafd6']
  },
  {
    fecha: '2026-09-24',
    tipo: 'nuevo',
    titulo: 'Ya se pueden renombrar, mover, borrar y crear carpetas y archivos de Drive desde Ops',
    detalle: 'En la pestaña Archivos de un Cliente, un Proyecto o una Tarea. Lo que se borra va a la papelera de Drive y se puede recuperar durante 30 días; las carpetas de Tarea quedan fijas.',
    commits: []
  },
  {
    fecha: '2026-09-24',
    tipo: 'nuevo',
    titulo: 'Novedades de Ops',
    detalle: 'Esta página. Desde el menú de tu cuenta ves qué cambió en el sistema, y un punto te avisa cuando hay algo que todavía no leíste.',
    commits: []
  },
  {
    fecha: '2026-09-24',
    tipo: 'mejora',
    titulo: 'Algunos clientes exigen fecha de vencimiento',
    detalle: 'Si el cliente lo tiene activado en su ficha, toda Tarea suya pide fecha de vencimiento al crearla, editarla o cambiarla en masa.',
    commits: ['ops-v2@78251e9', 'board@bdd7f13']
  },
  {
    fecha: '2026-09-24',
    tipo: 'nuevo',
    titulo: 'Buscar por patente',
    detalle: 'La búsqueda (Ctrl+K) encuentra Tareas y Proyectos por su patente y la muestra en cada resultado.',
    commits: ['ops-v2@0b62750', 'board@5e3d2d3']
  },
  {
    fecha: '2026-09-24',
    tipo: 'nuevo',
    titulo: 'Editar y eliminar licitaciones desde su ficha',
    commits: ['ops-v2@8aed673', 'ops-v2@d68ac06']
  },
  {
    fecha: '2026-09-24',
    tipo: 'nuevo',
    titulo: 'Scope del contrato',
    detalle: 'Cada Proyecto tiene una pestaña Scope con el alcance del contrato, y la IA puede revisar qué Tareas caen dentro o fuera de él.',
    commits: ['ops-v2@77a5323', 'board@315878d']
  },
  {
    fecha: '2026-09-24',
    tipo: 'nuevo',
    titulo: 'Pedir la eliminación de un Proyecto',
    detalle: 'La eliminación de un Proyecto pasa por una cola de aprobación. Al aprobarla, el Proyecto se archiva: no se pierde nada.',
    commits: ['ops-v2@aa321ff', 'board@81fbefc']
  },
  {
    fecha: '2026-09-24',
    tipo: 'mejora',
    titulo: 'Comentarios de las Tareas reunidos en el Proyecto',
    detalle: 'La pestaña Discusiones del Proyecto junta los comentarios de todas sus Tareas.',
    commits: ['ops-v2@6184b4f', 'board@3429ea7']
  },
  {
    fecha: '2026-09-24',
    tipo: 'mejora',
    titulo: 'Quién creó y quién asignó cada Tarea',
    detalle: 'La ficha de la Tarea lo muestra, y al crear una Tarea quedas elegido como responsable salvo que elijas a otra persona.',
    commits: ['ops-v2@9b014ee', 'ops-v2@07584a4', 'board@782539e']
  },
  {
    fecha: '2026-09-24',
    tipo: 'mejora',
    titulo: 'Mi Área muestra solo las Tareas de tus áreas',
    detalle: 'Ordenadas por etapa y prioridad. Jerarquías sigue siendo la vista general de toda la organización.',
    commits: ['ops-v2@71d78b0', 'ops-v2@7f100d0', 'ops-v2@56f4c50', 'board@d4af3a8', 'board@4d3740f']
  },
  {
    fecha: '2026-09-24',
    tipo: 'mejora',
    titulo: 'Elegir qué se ve al compartir una Tarea',
    detalle: 'Al generar el enlace público decides qué secciones muestra. Los enlaces creados antes solo muestran lo básico.',
    commits: ['ops-v2@bbad2cc', 'board@23458ae']
  },
  {
    fecha: '2026-09-23',
    tipo: 'nuevo',
    titulo: 'Tickets dentro de Ops',
    detalle: 'Bandeja de tickets en el menú principal y pestaña en cada Proyecto, con contador, borrador, adjuntos, asignado y cierre o reapertura.',
    commits: ['ops-v2@82bcf54', 'ops-v2@859b22f', 'ops-v2@873ff53']
  },
  {
    fecha: '2026-09-23',
    tipo: 'nuevo',
    titulo: 'Mi Ops: fijados, Tareas recurrentes y búsqueda rápida',
    detalle: 'Fija en el menú lo que más usas, programa Tareas que se repiten solas y abre cualquier pantalla con Ctrl+K. Además, Ops se puede instalar en el celular como aplicación.',
    commits: ['ops-v2@5289ad0']
  },
  {
    fecha: '2026-09-23',
    tipo: 'mejora',
    titulo: 'Nueva licitación a partir de un prospecto',
    detalle: 'Al crear una licitación puedes partir de un prospecto que ya existe en vez de cargarlo de nuevo.',
    commits: ['ops-v2@2c04677']
  },
  {
    fecha: '2026-09-23',
    tipo: 'mejora',
    titulo: 'Una Tarea se relaciona con Proyecto, Licitación, Upselling o Cliente',
    detalle: 'Son las únicas cuatro opciones, para que cada Tarea quede donde se la va a buscar.',
    commits: ['ops-v2@1214b48']
  },
  {
    fecha: '2026-09-22',
    tipo: 'mejora',
    titulo: 'Todas las Tareas del Proyecto a la vista',
    detalle: 'Los miembros de un Proyecto ven todas sus Tareas, no solo las propias. Se puede cerrar por Proyecto.',
    commits: ['ops-v2@3ff7d55']
  },
  {
    fecha: '2026-09-22',
    tipo: 'mejora',
    titulo: 'Elegir qué adjuntos ve el cliente',
    commits: ['ops-v2@ee187da']
  },
  {
    fecha: '2026-09-22',
    tipo: 'mejora',
    titulo: 'El Gantt abre en las próximas dos semanas',
    commits: ['ops-v2@eaabdfb']
  },
  {
    fecha: '2026-09-22',
    tipo: 'mejora',
    titulo: 'Crear una Tarea dentro de una licitación abierta',
    commits: ['ops-v2@c65a173']
  },
  {
    fecha: '2026-09-22',
    tipo: 'mejora',
    titulo: 'Se retira el estado Testear',
    detalle: 'Ya no aparece al cambiar el estado de una Tarea.',
    commits: ['ops-v2@1a1bfe3']
  },
  {
    fecha: '2026-09-22',
    tipo: 'mejora',
    titulo: 'El portal del cliente se parece más a Ops',
    detalle: 'Tablero con gráficos del estado de cada Proyecto, kanban de Hitos, archivos y columnas de Tareas que se encienden por Proyecto.',
    commits: ['ops-v2@1963396', 'ops-v2@beea528', 'ops-v2@fe05a42', 'ops-v2@ccf2e93', 'ops-v2@ef598a1', 'ops-v2@082eb91']
  },
  {
    fecha: '2026-09-21',
    tipo: 'arreglo',
    titulo: 'Sin pantalla negra al entrar',
    detalle: 'Un error al cargar una pantalla ahora muestra un aviso en vez de dejarla en negro.',
    commits: ['ops-v2@28688bd']
  }
]

/**
 * Agrupa las novedades por día, del más reciente al más viejo, manteniendo el orden de la lista
 * dentro de cada día.
 *
 * @param novedades la lista a agrupar; vacía devuelve vacío
 * @returns un bloque por día con al menos una novedad
 */
export function agruparPorDia (novedades: readonly Novedad[]): DiaDeNovedades[] {
  const porFecha = new Map<string, Novedad[]>()

  for (const novedad of novedades) {
    const delDia = porFecha.get(novedad.fecha)
    if (delDia) delDia.push(novedad)
    else porFecha.set(novedad.fecha, [novedad])
  }

  return [...porFecha.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, delDia]) => ({ fecha, novedades: delDia }))
}

/**
 * La fecha de la novedad más reciente.
 *
 * @param novedades la lista; vacía devuelve `null`
 * @returns `YYYY-MM-DD` o `null` si no hay ninguna
 */
export function fechaMasReciente (novedades: readonly Novedad[]): string | null {
  let masReciente: string | null = null

  for (const { fecha } of novedades) {
    if (masReciente === null || fecha > masReciente) masReciente = fecha
  }

  return masReciente
}

/**
 * Las novedades que cuenta el recorrido de después de actualizar: las del día más reciente.
 *
 * El día más reciente y no "desde la última versión": la versión es un hash de build y no sabe qué
 * novedades trae. Lo último que se anunció es la mejor aproximación de lo que acaba de llegar.
 *
 * @param novedades la lista completa; vacía devuelve vacío
 * @param maximo cuántas como mucho; cada una es una pantalla de scroll, y diez ya es un paseo largo
 * @returns las novedades del día más reciente, en el orden de la lista, recortadas a `maximo`
 */
export function novedadesDelRecorrido (novedades: readonly Novedad[], maximo = 8): Novedad[] {
  const [dia] = agruparPorDia(novedades)

  return dia === undefined ? [] : dia.novedades.slice(0, Math.max(0, maximo))
}

/**
 * Si hay algo que la persona todavía no vio.
 *
 * Se compara por día y no por entrada: la marca guarda la fecha de la última novedad que había
 * cuando abrió la página, así que cualquier día posterior es nuevo para ella.
 *
 * Una marca que no tiene forma de fecha (editada a mano, o de otra versión) cuenta como nunca vista:
 * comparada como texto podría quedar "después" de cualquier fecha y apagar el aviso para siempre.
 *
 * @param ultimaVista la fecha guardada al abrir la página por última vez; `null` si nunca la abrió
 * @param masReciente la fecha de la novedad más reciente; `null` si no hay novedades
 * @returns true si hay que avisar
 */
export function hayNovedadesSinVer (ultimaVista: string | null, masReciente: string | null): boolean {
  if (masReciente === null) return false
  if (ultimaVista === null || !/^\d{4}-\d{2}-\d{2}$/.test(ultimaVista)) return true

  return masReciente > ultimaVista
}
