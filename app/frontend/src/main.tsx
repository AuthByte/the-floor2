import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./contexts/AuthContext";
import { FloorPlanProvider } from "./lib/floorPlan/context";import { UserDataProvider } from "./contexts/UserDataContext";
import { Root } from "./Root";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <FloorPlanProvider>
        <UserDataProvider>
          <Root />
        </UserDataProvider>
      </FloorPlanProvider>
    </AuthProvider>
  </React.StrictMode>,
);
