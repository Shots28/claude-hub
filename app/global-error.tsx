"use client";

// Minimal global error boundary
// Note: global-error must include its own <html> and <body> tags
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>
        <h2>Something went wrong</h2>
        <button
          onClick={() => reset()}
          style={{
            padding: '0.5rem 1rem',
            marginTop: '1rem',
            cursor: 'pointer'
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
