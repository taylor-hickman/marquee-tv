import localFont from "next/font/local";

// Archivo, the latin subset of the variable font the mockups embed (weight
// 100-900, width 62-125%). Self-hosted so the build reaches no third party.
export const archivo = localFont({
  src: "./fonts/archivo-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-archivo",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});
