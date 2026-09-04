import Link from "next/link";
import { notFound } from "next/navigation";
import { data } from "@/lib/data/live-adapter";
import {
  SymbolArt,
  EvidencePanel,
  categoryNames,
} from "@/components/market-ui";
export default async function OutcomeDetail({
  params,
}: {
  params: { id: string };
}) {
  const o = await data.getOutcome(params.id);
  if (!o) notFound();
  return (
    <main className="shell">
      <div className="page-top">
        <div className="breadcrumbs">
          <Link href="/outcomes">Outcomes</Link> / {o.name}
        </div>
        <p className="eyebrow">A CLEAR GOAL. A MATCHED TEAM.</p>
        <h1>{o.name}</h1>
        <p>{o.description}</p>
      </div>
      <div className="detail-grid">
        <div className="detail-stack">
          <div className="detail-visual">
            <SymbolArt goal={o.goalType} large />
          </div>
          <section className="panel">
            <h2>A team with a purpose</h2>
            <p>
              These are the roles your setup needs. The guided flow matches
              compatible agents to each one.
            </p>
            {o.requiredRoles.map((r) => (
              <div className="role-row" key={r.role}>
                <Link href={`/agents/category/${r.category}`}>
                  {categoryNames[r.category]} ↗
                </Link>
                <p>{r.role}</p>
              </div>
            ))}
          </section>
          <EvidencePanel evidence={o.evidence} />
        </div>
        <aside className="panel detail-side">
          <p className="eyebrow">OUTCOME OVERVIEW · DEMO</p>
          <h3>Make it fit your life.</h3>
          <dl>
            <div>
              <dt>Risk preference</dt>
              <dd className="capitalize">{o.riskLevel}</dd>
            </div>
            <div>
              <dt>Supported assets</dt>
              <dd>{o.supportedAssets.join(" · ")}</dd>
            </div>
            <div>
              <dt>Works with</dt>
              <dd>{o.supportedProtocols.join(" · ")}</dd>
            </div>
            <div>
              <dt>Agent roles</dt>
              <dd>
                {o.requiredRoles.length} complementary{" "}
                {o.requiredRoles.length === 1 ? "role" : "roles"}
              </dd>
            </div>
          </dl>
          <Link
            className="button primary"
            href={`/find/context?goal=${o.goalType}&outcome=${o.id}&risk=${o.riskLevel}`}
          >
            Find my setup ↗
          </Link>
          <p>
            Browse and compare without a wallet. Connect only when you want to
            save your setup. Live execution is not available yet.
          </p>
        </aside>
      </div>
    </main>
  );
}
