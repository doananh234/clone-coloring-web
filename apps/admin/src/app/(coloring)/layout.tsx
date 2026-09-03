import "@vx/coloring/styles.css";
import "@vx/coloring/styles/components.css";
import { ColoringProviders } from "./providers";

export default function ColoringLayout({ children }: { children: React.ReactNode }) {
  return <ColoringProviders>{children}</ColoringProviders>;
}
