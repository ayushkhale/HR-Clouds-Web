import React, { lazy, Suspense } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { ModalContextProvider } from "./shared/contexts/ModalContext";
import { AuthContextProvider } from "./shared/contexts/AuthContext";
import { EmployeeDirectoryProvider } from "./shared/contexts/EmployeeDirectoryContext";
import { SidebarProvider } from "./shared/contexts/SidebarContext";
import { GlobalAlertProvider } from "./shared/components/GlobalAlertProvider";
import ErrorBoundary from "./shared/components/ErrorBoundary";
import { NotificationsProvider } from "./shared/notifications/NotificationsContext";
import NotificationDeepLink from "./shared/notifications/NotificationDeepLink";
import LocationRequestResponder from "./shared/notifications/LocationRequestResponder";
import PushOptInPrompt from "./shared/notifications/PushOptInPrompt";
import AppRoutes from "./routes/AppRoutes";
import { ENV } from "./config/env";

// Maya sits on every page but is closed on arrival, and she pulls in a whole
// markdown renderer to display answers. Loading her lazily keeps react-markdown
// and remark-gfm out of the first paint of every route.
const ChatbotWidget = lazy(() => import("./shared/components/ChatbotWidget"));

function App() {
  return (
    <GlobalAlertProvider>
      <GoogleOAuthProvider clientId={ENV.GOOGLE_CLIENT_ID}>
        <AuthContextProvider>
          {/* The organisation's people, read once per session and shared by
              every dropdown, avatar and name lookup. Inside the auth provider
              because it is keyed by the session; it requests nothing until a
              screen asks, so the marketing site never fires it. */}
          <EmployeeDirectoryProvider>
            <ModalContextProvider>
              <Router>
                {/* The badge, the bell panel and the Notifications page all read
                    one store, so they can never disagree after a read. It polls
                    nothing until somebody is signed in to an organisation, and
                    goes quiet for good if ops switch the engine off. */}
                <NotificationsProvider>
                  {/* Renders nothing: it routes a tapped desktop alert to the
                      right page for whichever workspace this person is in. */}
                  <NotificationDeepLink />
                  {/* "Where are you right now" can arrive on any screen, so it
                      is answered from here rather than from one page. Outside
                      the error boundary on purpose: a crashed page must not
                      take the only way to answer a live request with it. */}
                  <LocationRequestResponder />
                  {/* Asks once, a week apart, and only of a browser that
                      hasn't been asked. It is here rather than on a dashboard
                      because the person it is for never opens the pages that
                      offer the same switch quietly. */}
                  <PushOptInPrompt />
                  {/* A render crash in a lazy page, or a stale chunk after a
                      deploy, used to blank the whole app. The boundary turns both
                      into a recoverable screen and resets itself on navigation. */}
                  <ErrorBoundary>
                    <SidebarProvider>
                      <AppRoutes />
                    </SidebarProvider>
                  </ErrorBoundary>
                  {/* Inside the router so it can close itself on navigation.
                      No fallback: nothing should occupy the corner until she loads. */}
                  <Suspense fallback={null}>
                    <ChatbotWidget />
                  </Suspense>
                </NotificationsProvider>
              </Router>
            </ModalContextProvider>
          </EmployeeDirectoryProvider>
        </AuthContextProvider>
      </GoogleOAuthProvider>
    </GlobalAlertProvider>
  );
}

export default App;
