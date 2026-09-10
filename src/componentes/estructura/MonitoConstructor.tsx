/**
 * El monito que construye mientras entra la version nueva.
 *
 * Dibujo propio, sin dependencias: son treinta formas y cuatro `@keyframes` (`estilos/monito.css`).
 * Una libreria de animacion —Lottie y compañia— traeria un motor de reproduccion entero al bundle
 * para reproducir esto una vez cada varias semanas.
 *
 * Sobre la regla del proyecto que prohibe animacion infinita en elementos siempre visibles: esta lo
 * es, pero el elemento no. La bienvenida vive dos segundos y se desmonta, igual que el orbe dentro de
 * un boton cargando. Nunca hay dos en pantalla ni se repite por fila.
 *
 * El `viewBox` recorta el aire de los lados: la escena ocupa de 43 a 142 en horizontal, y con el
 * lienzo entero se veia diminuta dentro de su propia caja.
 *
 * `aria-hidden` porque no informa: lo que hay que leer es el texto que la acompaña. Sin eso, un lector
 * de pantalla anunciaria un grafico que no dice nada. `prefers-reduced-motion` lo cubre el bloque
 * global de `neo.css`, que apaga toda animacion del documento.
 */
export function MonitoConstructor () {
  return (
    <svg
      // El encuadre recorta el aire que sobraba a los lados: el dibujo ocupa de 43 a 142 en
      // horizontal, asi que con el lienzo completo la escena se veia diminuta dentro de su caja.
      viewBox="34 30 116 80"
      className="text-texto-tenue h-auto w-64 max-w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* El muro, de abajo hacia arriba. Cada bloque entra con su propio retraso: es lo que hace que
          se lea como "esta construyendo" y no como "hay un dibujo de un muro". */}
      <g className="fill-superficie-elevada">
        <rect className="monito-bloque" style={{ '--retraso': '0ms' } as React.CSSProperties} x="100" y="88" width="20" height="12" rx="2" />
        <rect className="monito-bloque" style={{ '--retraso': '120ms' } as React.CSSProperties} x="122" y="88" width="20" height="12" rx="2" />
        <rect className="monito-bloque" style={{ '--retraso': '260ms' } as React.CSSProperties} x="100" y="74" width="20" height="12" rx="2" />
        <rect className="monito-bloque" style={{ '--retraso': '380ms' } as React.CSSProperties} x="122" y="74" width="20" height="12" rx="2" />
        {/* El de arriba es el que recibe el martillo, asi que entra ultimo. */}
        <rect className="monito-bloque" style={{ '--retraso': '520ms' } as React.CSSProperties} x="111" y="60" width="20" height="12" rx="2" />
      </g>

      {/* El suelo, para que el monito y el muro se apoyen en lo mismo. */}
      <line className="stroke-linea" x1="18" y1="102" x2="162" y2="102" />

      <g className="monito-cuerpo">
        {/* Piernas y brazo de atras primero: quedan detras del torso sin necesidad de recortes. */}
        <line x1="55" y1="87" x2="50" y2="102" />
        <line x1="61" y1="87" x2="66" y2="102" />
        <line x1="51" y1="68" x2="43" y2="79" />

        <rect className="fill-superficie" x="50" y="63" width="16" height="24" rx="7" />
        <circle className="fill-superficie" cx="58" cy="50" r="11" />

        {/* El casco tapa la mitad de arriba de la cabeza y no la cabeza entera: si la cubre toda deja
            de leerse como alguien con casco y pasa a ser una mancha con patas. El arco es exactamente
            la mitad superior del circulo, asi que apoya en el borde y no flota.
            Es lo unico con color de marca: en un dibujo de dos trazos, una sola mancha de color dice
            "de aca es" mejor que teñir todo. */}
        <path className="fill-acento stroke-acento" d="M47 50a11 11 0 0 1 22 0z" />
        <rect className="fill-acento stroke-acento" x="44" y="48" width="28" height="4" rx="2" />

        {/* Brazo y martillo giran juntos alrededor del hombro (65,68). El giro va por CSS, asi que la
            posicion de reposo tiene que estar DENTRO de los keyframes: una `transform` de atributo aca
            la pisaria la animacion y el brazo saltaria al horizontal en el primer fotograma. */}
        <g className="monito-brazo">
          <line x1="65" y1="68" x2="82" y2="62" />
          <line x1="82" y1="62" x2="101" y2="52" />
          {/* La cabeza del martillo va perpendicular al mango: los 58 grados son los 32 del mango mas
              los 90 del cruce. Su `transform` es de atributo y no de CSS, asi que convive con el giro
              del grupo sin pisarlo. */}
          <rect
            className="fill-texto-tenue"
            x="94.5"
            y="48"
            width="13"
            height="8"
            rx="1.5"
            transform="rotate(58 101 52)"
          />
        </g>
      </g>

      {/* Las chispas del golpe. Comparten duracion con el brazo para caer en el fotograma del impacto;
          separarlas seria dejar que se despeguen en cuanto alguien toque una de las dos. */}
      <g className="monito-chispas stroke-acento">
        <line x1="105" y1="58" x2="100" y2="53" />
        <line x1="110" y1="56" x2="110" y2="49" />
        <line x1="115" y1="58" x2="120" y2="53" />
      </g>
    </svg>
  )
}
