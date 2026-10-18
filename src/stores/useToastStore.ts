import { create } from "zustand";

export interface ToastItem {
  id: number;
  message: string;
  kind: "error" | "success" | "info";
}

let nextId = 1;

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, kind?: ToastItem["kind"]) => void;
  dismiss: (id: number) => void;
}

const TOAST_LIFETIME_MS = 4500;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = "error") => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { id, message, kind }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, TOAST_LIFETIME_MS);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
