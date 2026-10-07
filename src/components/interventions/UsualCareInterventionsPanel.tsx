import { FormEvent, useEffect, useMemo, useState } from 'react';

import { createIntervention, listInterventionsByVisit, updateIntervention, type Intervention } from '../../services/interventionService';
import {
  USUAL_CARE_CATALOG_VERSION,
  USUAL_CARE_CATEGORY_LABEL,
  availableUsualCareOptions,
  listUsualCareCatalog,
  type UsualCareActivity,
} from '../../services/usualCareService';
import { ErrorState } from '../common/ErrorState';
import { Notice } from '../ui/Notice';
import { SectionHeader } from '../ui/SectionHeader';

/**
 * Registro de intervenciones en centros de atención farmacéutica estándar (decisión IP 2026-10-07):
 * el farmacéutico selecciona del listado neutro lo que ha hecho, sin texto libre. La BD sella texto,
 * código, versión y categoría, impide repetir actividad y hace excluyente «Sin intervención».
 */
export function UsualCareInterventionsPanel({ visitId }: { visitId: string }) {
  const [catalog, setCatalog] = useState<UsualCareActivity[]>([]);
  const [items, setItems] = useState<Intervention[]>([]);
  const [choice, setChoice] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadItems() {
    const result = await listInterventionsByVisit(visitId);
    setItems(result.data);
    if (result.errorMessage) setErrorMessage(result.errorMessage);
  }

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [catalogResult, itemsResult] = await Promise.all([listUsualCareCatalog(), listInterventionsByVisit(visitId)]);
      if (!mounted) return;
      setCatalog(catalogResult.data);
      setItems(itemsResult.data);
      setErrorMessage(catalogResult.errorMessage ?? itemsResult.errorMessage ?? null);
      setLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, [visitId]);

  const editingItem = editingId ? items.find((item) => item.id === editingId) ?? null : null;
  const options = useMemo(
    () => availableUsualCareOptions(catalog, items.map((item) => item.usual_care_item_id), editingItem?.usual_care_item_id ?? null),
    [catalog, items, editingItem],
  );
  const isNoIntervention = items.some((item) => catalog.find((c) => c.id === item.usual_care_item_id)?.is_no_intervention);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!choice) return;
    setSaving(true);
    setErrorMessage(null);
    const selected = catalog.find((item) => item.id === choice);
    const payload = { intervention_type: selected?.label ?? '', usual_care_item_id: choice };
    const result = editingId
      ? await updateIntervention(editingId, payload)
      : await createIntervention({
          ...payload,
          visit_id: visitId,
          intervention_domain: null,
          priority_level: null,
          delivered: true,
          linked_to_cmo_level: null,
          outcome: null,
          notes: null,
        });
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }
    setChoice('');
    setEditingId(null);
    setSaving(false);
    await loadItems();
  };

  if (!loaded) return null;

  return (
    <section className="card" aria-labelledby="usual-care-title">
      <SectionHeader
        id="usual-care-title"
        title={editingItem ? 'Corregir actividad registrada' : 'Actividades realizadas en esta visita'}
        description={`Seleccione cada actividad realizada (una por registro). Listado ${USUAL_CARE_CATALOG_VERSION}, pendiente de validación IP.`}
      />

      {errorMessage ? <ErrorState title="No se pudo registrar la actividad" message={errorMessage} /> : null}

      {items.length === 0 ? (
        <Notice tone="warning">
          <p>Esta visita aún no tiene registro. Si no se realizó ninguna actividad, seleccione «Sin intervención en esta visita».</p>
        </Notice>
      ) : null}

      {options.length > 0 || editingItem ? (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Actividad
            <select required value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">Seleccionar actividad</option>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <div className="actions-inline">
            <button type="submit" disabled={!choice || saving}>
              {saving ? 'Guardando…' : editingItem ? 'Guardar corrección' : 'Registrar'}
            </button>
            {editingItem ? (
              <button type="button" className="button-secondary" onClick={() => { setEditingId(null); setChoice(''); }}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      ) : isNoIntervention ? (
        <p className="help-text">Visita registrada como «Sin intervención». Para añadir actividades, corrija ese registro.</p>
      ) : (
        <p className="help-text">Todas las actividades del listado están registradas en esta visita.</p>
      )}

      {items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Actividad</th>
                <th>Categoría</th>
                <th>Registrada</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const activity = catalog.find((c) => c.id === item.usual_care_item_id);
                return (
                  <tr key={item.id}>
                    <td>{item.intervention_type}</td>
                    <td>{activity?.category ? USUAL_CARE_CATEGORY_LABEL[activity.category] : '—'}</td>
                    <td className="numeric">{item.created_at ? item.created_at.slice(0, 10) : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => {
                          setEditingId(item.id);
                          setChoice(item.usual_care_item_id ?? '');
                        }}
                      >
                        Corregir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
