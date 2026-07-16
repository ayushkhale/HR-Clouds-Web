// App.js
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

// Page Layout
import Page from "../src/components/sections/Page";

// Header
import Header from "../src/components/sections/Header";
import Navigation from "./components/sections/Navigation/Navigation";
import Hero from "../src/components/sections/Hero";

// Main
import Main from "../src/components/sections/Main";

// Footer
import Footer from "../src/components/sections/Footer";

// Context
import { ModalContextProvider } from "./contexts/ModalContext";

// Pages
import Home from "./pages/Home/Home";
import About from "./pages/About/About";
import Services from "./pages/Services/Services";
import PricingPage from "./pages/Pricing/Pricing";

function App() {
  return (
    <ModalContextProvider>
      <Router>
        <Page>
          <Header>
            <Navigation />
          </Header>

          <Main>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/services" element={<Services />} />
              <Route path="/pricing" element={<PricingPage />} />
            </Routes>
          </Main>

          <Footer />
        </Page>
      </Router>
    </ModalContextProvider>
  );
}

export default App;
