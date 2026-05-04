import { Inter, JetBrains_Mono } from "next/font/google";
import { RulesScene } from "./RulesScene";
import "../scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-scene",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-scene-mono",
  display: "swap",
});

export const metadata = {
  title: "Rules — pitch-pit",
  description: "How submissions are judged. How winners are chosen.",
};

export default function RulesRoute() {
  return (
    <div
      className={`${inter.variable} ${jetbrains.variable}`}
      style={{ display: "contents" }}
    >
      <RulesScene />
    </div>
  );
}
