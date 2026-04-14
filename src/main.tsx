import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const APP_VERSION = "0.1.0";
console.log(`%c🧸 Cubbly v${APP_VERSION} (pre-alpha)`, "color: hsl(32, 80%, 50%); font-weight: bold; font-size: 14px;");

createRoot(document.getElementById("root")!).render(<App />);
