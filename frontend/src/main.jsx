import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
// Fontes empacotadas com o app (funcionam sem internet): Montserrat no texto,
// Playfair Display na marca. Só o subconjunto latino, que cobre o português.
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-500.css";
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/playfair-display/latin-600.css";
import "./estilos.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
