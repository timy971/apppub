import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { SetupSheet } from "./setup-sheet";

interface SetupAssistantApi {
  /** Ouvre l'assistant sur la première étape non satisfaite (ou sur `stepId`). */
  open: (stepId?: string) => void;
  close: () => void;
  isOpen: boolean;
}

const SetupAssistantContext = createContext<SetupAssistantApi | null>(null);

export function SetupAssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialStep, setInitialStep] = useState<string | undefined>();

  const api = useMemo<SetupAssistantApi>(
    () => ({
      open: (stepId?: string) => {
        setInitialStep(stepId);
        setOpen(true);
      },
      close: () => setOpen(false),
      isOpen: open,
    }),
    [open],
  );

  const handleOpenChange = useCallback((next: boolean) => setOpen(next), []);

  return (
    <SetupAssistantContext.Provider value={api}>
      {children}
      <SetupSheet
        open={open}
        onOpenChange={handleOpenChange}
        initialStepId={initialStep}
      />
    </SetupAssistantContext.Provider>
  );
}

export function useSetupAssistant(): SetupAssistantApi {
  const ctx = useContext(SetupAssistantContext);
  if (!ctx) {
    // Fallback silencieux : autorise l'usage même si le provider n'est pas
    // encore monté (par ex. pendant SSR / lors de tests unitaires isolés).
    return {
      open: () => {},
      close: () => {},
      isOpen: false,
    };
  }
  return ctx;
}
