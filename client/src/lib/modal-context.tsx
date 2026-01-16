import { createContext, useContext, useState, ReactNode } from "react";

interface ModalContextType {
  topUpOpen: boolean;
  cashOutOpen: boolean;
  openTopUp: () => void;
  openCashOut: () => void;
  closeTopUp: () => void;
  closeCashOut: () => void;
}

const ModalContext = createContext<ModalContextType | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [cashOutOpen, setCashOutOpen] = useState(false);

  return (
    <ModalContext.Provider
      value={{
        topUpOpen,
        cashOutOpen,
        openTopUp: () => setTopUpOpen(true),
        openCashOut: () => setCashOutOpen(true),
        closeTopUp: () => setTopUpOpen(false),
        closeCashOut: () => setCashOutOpen(false),
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModals() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error("useModals must be used within a ModalProvider");
  }
  return context;
}
