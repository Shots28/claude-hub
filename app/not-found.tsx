import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-hub-bg text-hub-text">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-hub-text-muted mb-6">Page not found</p>
      <Link
        href="/"
        className="px-4 py-2 bg-hub-accent hover:bg-hub-accent-hover text-white rounded-lg transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
