import React, { lazy, Suspense } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ModalContextProvider } from "./shared/contexts/ModalContext";
import { AuthContextProvider } from "./shared/contexts/AuthContext";
import { EmployeeDirectoryProvider } from "./shared/contexts/EmployeeDirectoryContext";
import { SidebarProvider } from "./shared/contexts/SidebarContext";
import { GlobalAlertProvider } from "./shared/components/GlobalAlertProvider";
import AppRoutes from "./routes/AppRoutes";

// Maya sits on every page but is closed on arrival, and she pulls in a whole
// markdown renderer to display answers. Loading her lazily keeps react-markdown
// and remark-gfm out of the first paint of every route.
const ChatbotWidget = lazy(() => import("./shared/components/ChatbotWidget"));

function App() {
  return (
    <GlobalAlertProvider>
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
        <AuthContextProvider>
          {/* The organisation's people, read once per session and shared by
              every dropdown, avatar and name lookup. Inside the auth provider
              because it is keyed by the session; it requests nothing until a
              screen asks, so the marketing site never fires it. */}
          <EmployeeDirectoryProvider>
            <ModalContextProvider>
              <Router>
                <SidebarProvider>
                  <AppRoutes />
                </SidebarProvider>
                {/* Inside the router so it can close itself on navigation.
                    No fallback: nothing should occupy the corner until she loads. */}
                <Suspense fallback={null}>
                  <ChatbotWidget />
                </Suspense>
              </Router>
            </ModalContextProvider>
          </EmployeeDirectoryProvider>
        </AuthContextProvider>
      </GoogleOAuthProvider>
    </GlobalAlertProvider>
  );
}

export default App;
