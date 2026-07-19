"use client";

// Adapted from shadcn/ui's use-toast (Radix-based). Provides an imperative
// `toast()` API backed by a small reducer store.
import * as React from "react";

const TOAST_LIMIT = 4;
const TOAST_REMOVE_DELAY = 5000;

export type ToastVariant = "default" | "success" | "destructive";

export interface ToasterToast {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
  open: boolean;
}

type Action =
  | { type: "ADD"; toast: ToasterToast }
  | { type: "DISMISS"; id: string }
  | { type: "REMOVE"; id: string };

interface State {
  toasts: ToasterToast[];
}

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };
let count = 0;

function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD":
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case "DISMISS":
      return {
        toasts: state.toasts.map((t) =>
          t.id === action.id ? { ...t, open: false } : t,
        ),
      };
    case "REMOVE":
      return { toasts: state.toasts.filter((t) => t.id !== action.id) };
    default:
      return state;
  }
}

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(memoryState));
}

export interface ToastOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
}

export function toast(opts: ToastOptions) {
  const id = genId();
  dispatch({ type: "ADD", toast: { ...opts, id, open: true } });
  setTimeout(() => dispatch({ type: "DISMISS", id }), TOAST_REMOVE_DELAY);
  return {
    id,
    dismiss: () => dispatch({ type: "DISMISS", id }),
  };
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (id: string) => dispatch({ type: "DISMISS", id }),
    remove: (id: string) => dispatch({ type: "REMOVE", id }),
  };
}
