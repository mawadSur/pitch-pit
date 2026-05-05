import { Inter } from "next/font/google";
import { jetbrains } from "@/lib/fonts/jetbrains-mono";
import { LoginScene } from "./LoginScene";
import "../scene.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-scene",
  display: "swap",
});

export const metadata = {
  title: "Sign in — pitch-pit",
};

export default function LoginRoute() {
  return (
    <div
      className={`${inter.variable} ${jetbrains.variable}`}
      style={{ display: "contents" }}
    >
      <LoginScene />
    </div>
  );
}
