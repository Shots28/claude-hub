"use client";

// Minimal error boundary - avoid hooks to prevent SSR issues
export default function GlobalError(props: {
  error: Error;
  reset: () => void;
}) {
  // Use inline handler to avoid closure issues
  const handleReset = () => props.reset();

  return (
    <html>
      <body>
        <h2>Something went wrong</h2>
        <button onClick={handleReset}>Try again</button>
      </body>
    </html>
  );
}
