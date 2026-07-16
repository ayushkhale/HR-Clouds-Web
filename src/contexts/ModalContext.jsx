import { createContext, useContext, useState } from "react";

const ModalContext = createContext();

export function ModalContextProvider({ children }) {
  const [currentModal, setCurrentModal] = useState("");

  return (
    <ModalContext.Provider value={{ currentModal, setCurrentModal }}>
      {children}
    </ModalContext.Provider>
  );
}

export function UseModalContext() {
  return useContext(ModalContext);
}
