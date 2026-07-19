import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Uygulama } from "./Uygulama.js";

const kok = document.getElementById("kok");
if (kok === null) throw new Error("index.html'de #kok bulunamadı");

createRoot(kok).render(
  <StrictMode>
    <Uygulama />
  </StrictMode>,
);
