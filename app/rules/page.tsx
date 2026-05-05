import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/jetbrains-mono";
import { RulesScene } from "./RulesScene";
import "../scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
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
