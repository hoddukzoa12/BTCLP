import type { Metadata } from "next";
import { StarknetProvider } from "@/components/providers/StarknetProvider";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BTCFi Vault | Auto LP & Lending on Starknet",
  description:
    "Smart BTC vault that automatically switches between Ekubo LP and Vesu lending based on market conditions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-vault-dark text-gray-100 min-h-screen antialiased font-body">
        <StarknetProvider>
          <div className="noise-bg min-h-screen">
            {children}
          </div>
          <Toaster
            theme="dark"
            richColors
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#111827",
                border: "1px solid #1F2937",
                color: "#E5E7EB",
              },
            }}
          />
        </StarknetProvider>
      </body>
    </html>
  );
}
