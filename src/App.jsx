import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ModalContextProvider } from "./shared/contexts/ModalContext";
import { AuthContextProvider } from "./shared/contexts/AuthContext";
import AppRoutes from "./routes/AppRoutes";

function App() {
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <AuthContextProvider>
        <ModalContextProvider>
          <Router>
            <AppRoutes />
          </Router>
        </ModalContextProvider>
      </AuthContextProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
