export default function MyOutcomeDetail({ params }: { params: { id: string } }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Active outcome</h1>
      <p className="mt-2 text-muted">Status view for {params.id} arrives with activation.</p>
    </main>
  );
}
