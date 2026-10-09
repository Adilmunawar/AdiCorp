import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import App from "./App.tsx";
import "./index.css";

// A deploy while this tab was open: the hashed chunks it references are gone. Reload once to pick up the new build.
window.addEventListener("vite:preloadError", (event) => {
  const key = "adicorp.chunk-reload-at";
  try {
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage unavailable: reload anyway */
  }
  event.preventDefault();
  window.location.reload();
});

// Promises nobody awaits (background refreshes, push set-up) must not fail without a trace.
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { message?: string } | undefined;
  const message = reason?.message ?? "";
  if (/abort|cancel/i.test(message)) return;
  toast.error("Something did not finish", { description: message || "Please try again.", id: "unhandled-rejection" });
});

createRoot(document.getElementById("root")!).render(<App />);
