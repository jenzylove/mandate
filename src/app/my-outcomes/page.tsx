import { MyActivity } from "@/components/connected";
export default function MyOutcomes() {
  return (
    <main className="shell">
      <div className="page-top">
        <p className="eyebrow">YOUR PERSONAL SPACE</p>
        <h1>My outcomes.</h1>
        <p>
          Your intentions, in one place. Review saved setups and plan your next
          move.
        </p>
      </div>
      <MyActivity />
    </main>
  );
}
