import React from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { App } from "./App";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;

function MissingConvexUrl() {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <p className="eyebrow">Setup required</p>
        <h1>Connect the web app to Convex</h1>
        <p>
          Add your deployment URL to <code>.env.local</code>, then restart the
          dev server.
        </p>
        <pre>VITE_CONVEX_URL=https://your-deployment.convex.cloud</pre>
      </section>
    </main>
  );
}

const root = createRoot(document.getElementById("root")!);

if (!convexUrl) {
  root.render(<MissingConvexUrl />);
} else {
  const convex = new ConvexReactClient(convexUrl);
  root.render(
    <React.StrictMode>
      <ConvexAuthProvider client={convex}>
        <App />
      </ConvexAuthProvider>
    </React.StrictMode>,
  );
}
