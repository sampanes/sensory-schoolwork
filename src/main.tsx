import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter as BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";

/*
 * Chrome loads speech voices lazily: the first getVoices() call returns an
 * empty list and starts the load. Asking once at startup means the chosen
 * voice (and the Spanish voice the advanced reading deck asks for) is ready
 * by the first tap on Play, instead of that first word using the default.
 */
if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
