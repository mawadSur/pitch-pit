import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/jetbrains-mono";
import { HomeScene } from "./HomeScene";
import "./scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-scene",
  display: "swap",
});

export const metadata = {
  title: "pitch-pit — pitch your idea",
  description: "Submit your idea. The hourglass is running.",
};

export default function Home() {
  return (
    <div
      className={`${inter.variable} ${jetbrains.variable}`}
      style={{ display: "contents" }}
    >
      <HomeScene />
    </div>
  );
}
