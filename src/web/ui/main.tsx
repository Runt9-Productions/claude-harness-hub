import { render } from "preact";
import { useEffect, useErrorBoundary, useReducer } from "preact/hooks";
import { initialPageState, pageReducer } from "../logic/page-state.ts";
import { startClient } from "./client.ts";
import { Page } from "./page.tsx";

function App() {
  const [state, dispatch] = useReducer(pageReducer, initialPageState);
  useEffect(() => startClient(dispatch), []);
  return <Page state={state} dispatch={dispatch} />;
}

// A caught render error reaches no window event, so the boundary logs it itself.
function Root() {
  // Preact types the caught error as any.
  const boundary: [unknown, () => void] = useErrorBoundary((caught: unknown) => {
    console.error("hub: the page failed to render", caught);
  });
  if (boundary[0] !== undefined) {
    return (
      <p class="failure" role="alert">
        The page failed to draw. Reload it; the browser console has the details.
      </p>
    );
  }
  return <App />;
}

// Built outside Preact so it still shows when Preact itself is what failed. Without it, a throw outside render leaves
// a half-updated page that looks live.
const failureBanner = document.createElement("p");
failureBanner.className = "failure";
failureBanner.role = "alert";
failureBanner.hidden = true;
failureBanner.textContent =
  "Something on this page failed, so what it shows may be out of date. Reload it; the browser console has the details.";

function showFailure(): void {
  failureBanner.hidden = false;
}

window.addEventListener("error", showFailure);
window.addEventListener("unhandledrejection", showFailure);

const appRoot = document.createElement("div");
appRoot.className = "app";
document.body.append(failureBanner, appRoot);
render(<Root />, appRoot);
