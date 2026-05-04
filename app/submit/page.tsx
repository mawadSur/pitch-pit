import { Inter, JetBrains_Mono } from "next/font/google";
import { SubmitScene } from "./SubmitScene";
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
  title: "Pitch your idea — pitch-pit",
  description: "Submit your idea. The hourglass is running.",
};

export default function SubmitRoute() {
  return (
    <div
      className={`${inter.variable} ${jetbrains.variable}`}
      style={{ display: "contents" }}
    >
      <SubmitScene />
    </div>
  );
}
