import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
// Styles will be loaded via <link> in index.html

const rootElement = document.getElementById("root");

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
} else {
  console.error(
    "No se encontró el elemento raíz para renderizar la aplicación."
  );
}
