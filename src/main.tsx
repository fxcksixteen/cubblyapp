import { createRoot } from "react-dom/client";
import { useState } from "react";
import App from "./App.tsx";
import LoadingSplash from "./components/app/LoadingSplash";
import { preloadAllSounds } from "./lib/sounds";
import "./index.css";

const APP_VERSION = "0.2.0";
console.log(`%c🧸 Cubbly v${APP_VERSION} (pre-alpha)`, "color: hsl(32, 80%, 50%); font-weight: bold; font-size: 14px;");

// Preload notification sounds in the background
preloadAllSounds();

const Root = () => {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <>
      <App />
      {!splashDone && <LoadingSplash onComplete={() => setSplashDone(true)} />}
    </>
  );
};

createRoot(document.getElementById("root")!).render(<Root />);
