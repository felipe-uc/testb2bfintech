/**
 * Tipos y carga del widget de Fintoc en el navegador.
 * Script oficial: https://js.fintoc.com/v1/ (no es dependencia de npm).
 */

export interface FintocWidget {
  open(): void;
  hide(): void;
  destroy(): void;
}

export interface FintocWidgetOptions {
  product: "payments";
  publicKey: string;
  sessionToken: string;
  onSuccess?: () => void;
  onExit?: () => void;
  onEvent?: (event: unknown) => void;
}

declare global {
  interface Window {
    Fintoc?: { create(options: FintocWidgetOptions): FintocWidget };
  }
}

const SCRIPT_SRC = "https://js.fintoc.com/v1/";

export function loadFintocScript(): Promise<void> {
  if (window.Fintoc) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("widget_load")));
    if (!existing) {
      script.src = SCRIPT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/** El session_token vive solo en sessionStorage del navegador que creó la sesión. */
export const tokenKey = (sessionId: string) => `al_token_${sessionId}`;
