import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Whose Job Is It Anyway? | Temukan PIC yang tepat", description: "Satu tempat untuk menemukan PIC, SOP, dan bantuan operasional kantor." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="id"><body>{children}</body></html>; }
