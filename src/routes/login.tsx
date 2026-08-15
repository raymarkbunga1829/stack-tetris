import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="login-page">
      <div className="login-card">
        <h1>Sign in</h1>
        <p>Optional. The game works without an account.</p>
        {authEnabled ? (
          GROK_PROVIDERS.map((p) => (
            <button
              key={p.providerId}
              type="button"
              className="login-btn"
              onClick={() => signIn(p.providerId, { callbackURL: "/" })}
            >
              Continue with {p.label}
            </button>
          ))
        ) : (
          <p>Sign-in is disabled.</p>
        )}
        <Link to="/" className="login-back">
          Back to Stack
        </Link>
      </div>
    </main>
  );
}
