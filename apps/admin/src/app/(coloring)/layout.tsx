import "@vx/coloring/styles.css";
import { ColoringProviders } from "./providers";

export default function ColoringLayout({ children }: { children: React.ReactNode }) {
  return <ColoringProviders>{children}</ColoringProviders>;
}
