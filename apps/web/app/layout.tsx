import "./globals.css";

export const metadata = {
  title: "Entangled Body",
  description: "Tile cloud body driven by simulator-backed quantum measurements.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
