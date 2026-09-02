import Link from "next/link";
import { ConnectWallet } from "@/components/connect-wallet";

export function Nav() {
  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          mandate
        </Link>
        <div className="flex items-center gap-5 text-sm text-muted">
          <Link href="/outcomes">Outcomes</Link>
          <Link href="/agents">Agents</Link>
          <Link href="/find/goal">Find</Link>
          <Link href="/my-outcomes">My Outcomes</Link>
          <ConnectWallet />
        </div>
      </nav>
    </header>
  );
}
