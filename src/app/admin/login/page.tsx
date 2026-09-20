import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { adminLoginAction } from '@/app/actions';
import { isAdmin } from '@/lib/session';

export const metadata: Metadata = { title: 'Espace salon', robots: { index: false } };

const ERRORS: Record<string, string> = {
  invalid: 'Mot de passe incorrect.',
  rate: 'Trop de tentatives. Réessayez dans quelques minutes.',
};

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isAdmin()) redirect('/admin');
  const { error } = await searchParams;
  const message = error ? ERRORS[error] : undefined;
  const configured = Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 10);
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <h1 className="font-display text-3xl font-bold">Espace salon</h1>
      {!configured && (
        <p role="alert" className="mt-4 rounded-lg border border-amber-700 bg-amber-50 p-3 text-amber-950">
          ADMIN_PASSWORD n’est pas défini (10 caractères minimum). Renseignez-le dans l’environnement du
          serveur.
        </p>
      )}
      {message && (
        <p role="alert" className="mt-4 rounded-lg border border-red-700 bg-red-50 p-3 text-red-900">
          {message}
        </p>
      )}
      <form action={adminLoginAction} className="card mt-6 grid gap-4">
        <div>
          <label className="label" htmlFor="password">
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="field"
            required
            maxLength={200}
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="btn btn-solid">
          Se connecter
        </button>
      </form>
    </main>
  );
}
