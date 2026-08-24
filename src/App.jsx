import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ModalContextProvider } from "./shared/contexts/ModalContext";
import { AuthContextProvider } from "./shared/contexts/AuthContext";
import { SidebarProvider } from "./shared/contexts/SidebarContext";
import { GlobalAlertProvider } from "./shared/components/GlobalAlertProvider";
import AppRoutes from "./routes/AppRoutes";

function App() {
  return (
    <GlobalAlertProvider>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <AuthContextProvider>
          <ModalContextProvider>
            <Router>
              <SidebarProvider>
                <AppRoutes />
              </SidebarProvider>
            </Router>
          </ModalContextProvider>
        </AuthContextProvider>
      </GoogleOAuthProvider>
    </GlobalAlertProvider>
  );
}

export default App;
