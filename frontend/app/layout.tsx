import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Predictive 5G Handover System | Live Dashboard",
  description:
    "Real-time 5G handover prediction and beamforming control dashboard. " +
    "Visualises vehicle trajectory, tower state transitions and network metrics.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
