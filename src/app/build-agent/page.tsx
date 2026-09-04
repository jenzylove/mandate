import Link from "next/link";
import { WalletGate } from "@/components/connected";
export default function BuildAgent() {
  return (
    <main className="flow-shell">
      <div className="flow-heading">
        <p className="eyebrow">FOR THE BUILDERS</p>
        <h1>Build your own agent.</h1>
        <p>
          Mandate helps people discover agents. BNB Agent Studio helps you build
          them.
        </p>
      </div>
      <WalletGate>
        <section className="panel">
          <h2>Bring your idea to BNB Agent Studio.</h2>
          <p>
            You’ll continue on BNB Chain’s website. Publishing an agent there
            does not automatically list it on Mandate.
          </p>
          <div className="page-actions">
            <a
              className="button primary"
              href="https://www.bnbchain.org/en/agent-studio"
              target="_blank"
              rel="noreferrer"
            >
              Open BNB Agent Studio ↗
            </a>
            <Link className="button secondary" href="/agents">
              Explore agents
            </Link>
          </div>
        </section>
      </WalletGate>
    </main>
  );
}
