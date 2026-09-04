import { MyActivity } from "@/components/connected";
export default function MyOutcomeDetail({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main className="shell">
      <div className="page-top">
        <p className="eyebrow">MY OUTCOMES</p>
        <h1>Your saved setup.</h1>
      </div>
      <MyActivity id={params.id} />
    </main>
  );
}
