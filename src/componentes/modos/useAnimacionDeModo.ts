"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { cumpleConsulta, MENOS_MOVIMIENTO } from "@/lib/useConsultaDeMedios";

/** Lo minimo que se le pide a una animacion o timeline de anime.js para poder limpiarla. */
export interface AnimacionRevertible {
  revert: () => unknown;
}

/**
 * Monta las animaciones de anime.js de una pieza decorativa y las revierte al desmontar.
 *
 * El marcado de la pieza ya es su estado final y quieto: con `prefers-reduced-motion` no se arma
 * nada y se queda tal cual. Corre en `useLayoutEffect` para esconder lo que va a entrar antes del
 * primer pintado y no dejar ver un fotograma de mas.
 *
 * @param armar recibe la raiz de la pieza y devuelve lo que creo, para revertirlo
 * @returns el ref que va en la raiz de la pieza
 */
export function useAnimacionDeModo<T extends HTMLElement | SVGElement>(
  armar: (raiz: T) => AnimacionRevertible[],
): RefObject<T | null> {
  const raizRef = useRef<T | null>(null);

  useLayoutEffect(() => {
    const raiz = raizRef.current;

    if (raiz === null || cumpleConsulta(MENOS_MOVIMIENTO)) return;

    const creadas = armar(raiz);

    return () => {
      for (const animacion of creadas) animacion.revert();
    };
    // Corre una vez por montaje: la pieza no cambia de armador en caliente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return raizRef;
}

/** Una animacion o timeline de anime.js que ademas sabe si ya terminó. */
type AnimacionGuardable = AnimacionRevertible & { completed?: boolean };

/**
 * Agenda de una pieza que se repite con pausas largas y valores nuevos cada vez, algo que un
 * `loop` de anime.js no puede hacer. Junta los temporizadores y las animaciones que se van creando
 * para detenerlos todos al limpiar; se devuelve junto al resto de lo que arma la pieza.
 */
export interface Agenda extends AnimacionRevertible {
  /** Ejecuta `tarea` dentro de `ms`; no hace nada si la agenda ya se limpió. */
  en: (ms: number, tarea: () => void) => void;
  /** Registra una animacion para revertirla al limpiar y la devuelve. */
  guardar: <A extends AnimacionGuardable>(animacion: A) => A;
}

/**
 * Crea una agenda vacia.
 *
 * @returns la agenda; su `revert` cancela lo pendiente y revierte lo guardado
 */
export function crearAgenda(): Agenda {
  const temporizadores = new Set<ReturnType<typeof setTimeout>>();
  let guardadas: AnimacionGuardable[] = [];
  let limpia = false;

  return {
    en(ms, tarea) {
      if (limpia) return;
      const id = setTimeout(() => {
        temporizadores.delete(id);
        tarea();
      }, ms);

      temporizadores.add(id);
    },
    guardar(animacion) {
      if (!limpia)
        guardadas = [
          ...guardadas.filter((a) => a.completed !== true),
          animacion,
        ];

      return animacion;
    },
    revert() {
      limpia = true;
      for (const id of temporizadores) clearTimeout(id);
      temporizadores.clear();
      for (const animacion of guardadas) animacion.revert();
      guardadas = [];
    },
  };
}
