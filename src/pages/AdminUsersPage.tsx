// Administración de usuarios → Restablecer contraseña (solo coordinación).
// La autorización real la verifica la Edge Function `admin-reset-password` en el servidor; aquí el rol
// solo decide qué se muestra.

import { useCallback, useEffect, useState } from 'react';

import { ErrorState } from '../components/common/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { Notice } from '../components/ui/Notice';
import { PageHeader } from '../components/ui/PageHeader';
import {
  listResettableInvestigators,
  resetInvestigatorPassword,
  type PasswordResetResult,
  type ResettableInvestigator,
} from '../services/adminUserService';
import { getCurrentProfile, type CurrentProfile } from '../services/profileService';

function label(user: ResettableInvestigator): string {
  const name = user.full_name?.trim();
  const centers = user.center_codes.length ? ` · ${user.center_codes.join(', ')}` : '';
  return `${name ? `${name} — ` : ''}${user.email ?? 'sin correo'}${centers}`;
}

export function AdminUsersPage() {
  const [profile, setProfile] = useState<CurrentProfile | null | undefined>(undefined);
  const [users, setUsers] = useState<ResettableInvestigator[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [verified, setVerified] = useState(false);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Contraseña temporal: solo en memoria de esta pantalla, una vez, nunca en almacenamiento del navegador.
  const [result, setResult] = useState<PasswordResetResult | null>(null);
  const [copied, setCopied] = useState(false);

  const isCoordinator = profile?.role === 'coordinator';

  const load = useCallback(async () => {
    setLoading(true);
    const response = await listResettableInvestigators();
    setUsers(response.data);
    setLoadError(response.errorMessage);
    setLoading(false);
  }, []);

  useEffect(() => {
    void getCurrentProfile().then((r) => setProfile(r.data));
  }, []);

  useEffect(() => {
    if (isCoordinator) void load();
    else if (profile !== undefined) setLoading(false);
  }, [isCoordinator, profile, load]);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  const handleReset = async () => {
    if (!selected || !verified) return;
    setWorking(true);
    setActionError(null);
    const response = await resetInvestigatorPassword(selected.id);
    setWorking(false);
    if (response.errorMessage || !response.data) {
      setActionError(response.errorMessage ?? 'No se pudo restablecer la contraseña.');
      return;
    }
    setResult(response.data);
    setCopied(false);
    setSelectedId('');
    setVerified(false);
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.temporary_password);
      setCopied(true);
    } catch {
      setActionError('No se pudo copiar automáticamente: selecciona la contraseña y cópiala a mano.');
    }
  };

  const handleDismiss = () => {
    setResult(null);
    setCopied(false);
    void load();
  };

  if (profile === undefined) return <LoadingState label="Comprobando permisos..." />;

  if (!isCoordinator) {
    return (
      <div className="page-stack">
        <ErrorState title="Acceso restringido" message="Esta sección es exclusiva de coordinación." />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="DERMAPEX · Administración de usuarios"
        title="Restablecer contraseña"
        description="Genera una contraseña temporal para un investigador que ha perdido el acceso. La cuenta, sus centros, permisos y registros clínicos no se modifican; en su primer acceso deberá fijar una contraseña propia."
      />

      <Notice tone="warning" title="Antes de continuar">
        Confirma la identidad de la persona por un canal independiente de la aplicación y del correo afectado (llamada, mensajería
        corporativa, en persona). Entrégale la contraseña temporal por ese mismo canal; no la envíes por correo.
      </Notice>

      {result ? (
        <section className="card" aria-labelledby="temp-password-title">
          <h2 id="temp-password-title">Contraseña temporal generada</h2>
          <p>Cuenta: <strong>{result.email}</strong></p>
          <p>
            <code style={{ fontSize: '1.4rem', userSelect: 'all' }} data-testid="temporary-password">{result.temporary_password}</code>
          </p>
          <Notice tone="danger" title="Se muestra una sola vez">
            Al cerrar este aviso no podrá recuperarse; si se pierde, habrá que restablecerla de nuevo. Todas las sesiones abiertas de
            la cuenta se han cerrado.
          </Notice>
          <div className="radio-row" style={{ marginTop: 'var(--sp-4)' }}>
            <button type="button" onClick={handleCopy}>{copied ? 'Copiada ✓' : 'Copiar contraseña'}</button>
            <button type="button" className="button-secondary" onClick={handleDismiss}>He terminado; ocultar contraseña</button>
          </div>
          {actionError ? <ErrorState title="Aviso" message={actionError} /> : null}
        </section>
      ) : (
        <section className="card" aria-labelledby="reset-title">
          <h2 id="reset-title">Investigador</h2>
          {loading ? <LoadingState label="Cargando investigadores..." /> : null}
          {loadError ? <ErrorState title="No se pudo cargar el listado" message={loadError} /> : null}
          {!loading && !loadError ? (
            <form className="form-grid" onSubmit={(event) => { event.preventDefault(); void handleReset(); }}>
              <label>
                Investigador activo de DERMAPEX
                <select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setVerified(false); setActionError(null); }} disabled={working}>
                  <option value="">Selecciona…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id} disabled={!u.eligible}>
                      {label(u)}{u.eligible ? '' : ' (no restablecible)'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="radio-inline">
                <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} disabled={!selected || working} />
                He confirmado la identidad de esta persona por un canal independiente.
              </label>
              <button type="submit" disabled={!selected || !verified || working}>
                {working ? 'Restableciendo...' : 'Restablecer contraseña'}
              </button>
              {actionError ? <ErrorState title="No se pudo restablecer la contraseña" message={actionError} /> : null}
            </form>
          ) : null}
        </section>
      )}
    </div>
  );
}
