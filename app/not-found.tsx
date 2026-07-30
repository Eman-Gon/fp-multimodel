import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="not-found">
      <p className="not-found__code">404</p>
      <h1>That review item is not available.</h1>
      <p>Return to the queue to choose an available clip.</p>
      <Link href="/queue" className="button button--primary">
        Open coding queue
      </Link>
    </main>
  );
}
