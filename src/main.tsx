import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { router } from "@/App";
import Toaster from "@/components/Toast/Toaster";
import { setAppNavigator } from "@/lib/navigate";
import { setupAuthWatcher } from "@/stores/useAuthStore";
import { setupNotificationWatcher } from "@/stores/useNotificationStore";
import { applyTheme, useThemeStore } from "@/stores/useThemeStore";
import "@/styles/global.css";

setAppNavigator((path, options) => void router.navigate(path, options));

applyTheme(useThemeStore.getState().theme);
useThemeStore.subscribe((state) => applyTheme(state.theme));

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element '#root' was not found in index.html");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster />
  </React.StrictMode>,
);

setupAuthWatcher();
setupNotificationWatcher();
