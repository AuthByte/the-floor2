import { useState } from "react";
import App from "./App";
import { Landing } from "./components/Landing";

const ENTERED_STORAGE = "floor.entered";

/** Gates the marketing landing page in front of the live app for the session. */
export function Root() {
  const [entered, setEntered] = useState<boolean>(
    () => sessionStorage.getItem(ENTERED_STORAGE) === "1",
  );

  if (!entered) {
    return (
      <Landing
        onEnter={() => {
          sessionStorage.setItem(ENTERED_STORAGE, "1");
          setEntered(true);
        }}
      />
    );
  }

  return <App />;
}
