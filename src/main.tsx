import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";

import { router } from "@/App";
import Toaster from "@/components/Toast/Toaster";
import { setAppNavigator } from "@/lib/navigate";
import { setupAuthWatcher } from "@/stores/useAuthStore";
import "@/styles/global.css";

setAppNavigator((path, options) => void router.navigate(path, options));

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
