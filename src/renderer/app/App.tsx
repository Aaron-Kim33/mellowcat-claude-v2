import { useEffect } from "react";
import { Shell } from "../components/Shell/Shell";
import { useAppStore } from "../store/app-store";

export function App() {
  const hydrate = useAppStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return <Shell />;
}
