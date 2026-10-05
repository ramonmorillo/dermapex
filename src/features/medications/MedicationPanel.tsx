import { FormEvent, useEffect, useMemo, useState } from 'react';

import { ErrorState } from '../../components/common/ErrorState';
import { StatusBadge, type StatusTone } from '../../components/ui/StatusBadge';
import {
  createMedicationCatalogItem,
  importExternalMedicationToVisit,
  listVisitMedicationEvents,
  listVisitMedicationSnapshot,
  saveVisitMedicationChanges,
  searchExternalMedicationCatalog,
  type ExternalMedicationSearchItem,
} from './medicationsService';
import { resolveMedicationOrigin } from './catalogSource';
import { normalizeMedicationDisplayName } from './displayFormat';
import type { MedicationCatalogItem, PatientMedicationDraft, VisitMedicationEvent } from './types';

type MedicationPanelProps = {
  visitId: string;
  patientId: string;
};

type CreateCatalogFormState = {
  display_name: string;
  active_ingredient: string;
  strength: string;
  form: string;
  route: string;
};

type MedicationFormRow = PatientMedicationDraft & {
  display_name: string;
  source_label: string;
  source_badge: 'internal' | 'cima' | 'external';
  source_code: string;
  dose_amount: string;
  dose_unit_hint: DoseUnitOptionValue | '';
};

type MedicationChangeStatus = 'unchanged' | 'modified' | 'stopped' | 'new';

const ROUTE_OPTIONS = [
  { value: 'oral', label: 'Oral' },
  { value: 'subcutánea', label: 'Subcutánea' },
  { value: 'intravenosa', label: 'Intravenosa' },
  { value: 'inhalada', label: 'Inhalada' },
  { value: 'tópica', label: 'Tópica' },
  { value: 'otra', label: 'Otra' },
] as const;

type RouteOptionValue = (typeof ROUTE_OPTIONS)[number]['value'];

const FREQUENCY_SUGGESTIONS = [
  '1 vez/día',
  'cada 12 h',
  'cada 8 h',
  'cada 24 h',
  'desayuno',
  'comida',
  'cena',
  'desayuno y cena',
  'según necesidad',
  'otra',
] as const;
const INDICATION_SUGGESTIONS = [
  'prevención secundaria',
  'HTA',
  'diabetes',
  'dislipidemia',
  'insuficiencia cardiaca',
  'fibrilación auricular',
  'dolor',
  'otra',
] as const;
const DOSE_UNIT_OPTIONS = ['mg', 'g', 'UI', 'ml', 'comprimido(s)', 'cápsula(s)', 'gota(s)', 'puff(s)', 'otra'] as const;

type DoseUnitOptionValue = (typeof DOSE_UNIT_OPTIONS)[number];

const STATUS_META: Record<MedicationChangeStatus, { label: string; tone: StatusTone }> = {
  unchanged: { label: 'Sin cambios', tone: 'neutral' },
  modified: { label: 'Modificado', tone: 'warning' },
  stopped: { label: 'Suspendido', tone: 'neutral' },
  new: { label: 'Nuevo', tone: 'info' },
};

function normalizeRouteValue(route: string | null | undefined): RouteOptionValue | '' {
  const normalized = (route ?? '').trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const knownRoute = ROUTE_OPTIONS.find((option) => option.value === normalized);
  return knownRoute ? knownRoute.value : 'otra';
}

function emptyDraft(catalog: MedicationCatalogItem): MedicationFormRow {
  const origin = resolveMedicationOrigin(catalog);
  const sourceBadge = origin.kind === 'external' ? (origin.source === 'external_cima' ? 'cima' : 'external') : 'internal';
  return {
    medication_catalog_id: catalog.id,
    display_name: normalizeMedicationDisplayName(catalog.display_name),
    source_label: sourceBadge === 'cima' ? 'CIMA' : sourceBadge === 'external' ? 'Catálogo externo' : 'Catálogo interno',
    source_badge: sourceBadge,
    source_code: origin.kind === 'external' ? origin.source_code ?? '' : '',
    dose_text: '',
    dose_amount: '',
    frequency_text: '',
    route_text: normalizeRouteValue(catalog.route),
    indication: '',
    start_date: '',
    notes: '',
    is_active: true,
    dose_unit_hint: '',
  };
}

function normalizeTextValue(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function inferDoseUnitHint(doseText: string | null | undefined): DoseUnitOptionValue | '' {
  const normalized = normalizeTextValue(doseText).toLowerCase();
  const matched = DOSE_UNIT_OPTIONS.find((unit) => unit !== 'otra' && normalized.includes(unit.toLowerCase()));
  return matched ?? '';
}

function inferDoseAmount(doseText: string | null | undefined): string {
  const normalized = normalizeTextValue(doseText).replace(',', '.');
  const matched = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\b/);
  return matched?.[1]?.replace('.', ',') ?? '';
}

function buildDoseTextForSave(row: MedicationFormRow): string {
  const freeDoseText = normalizeTextValue(row.dose_text);
  const normalizedAmount = normalizeTextValue(row.dose_amount);

  if (normalizedAmount) {
    if (!row.dose_unit_hint || row.dose_unit_hint === 'otra') {
      return normalizedAmount;
    }
    return `${normalizedAmount} ${row.dose_unit_hint}`;
  }

  if (!freeDoseText) {
    return '';
  }

  if (!row.dose_unit_hint || row.dose_unit_hint === 'otra') {
    return freeDoseText;
  }

  const isMostlyNumeric = /^[0-9]+([.,][0-9]+)?$/.test(freeDoseText);
  const hasKnownUnit = DOSE_UNIT_OPTIONS.some((unit) => unit !== 'otra' && freeDoseText.toLowerCase().includes(unit.toLowerCase()));
  if (isMostlyNumeric && !hasKnownUnit) {
    return `${freeDoseText} ${row.dose_unit_hint}`;
  }
  return freeDoseText;
}

function getSemanticWarnings(row: MedicationFormRow): string[] {
  const warnings: string[] = [];
  const frequency = normalizeTextValue(row.frequency_text).toLowerCase();
  const route = normalizeTextValue(row.route_text).toLowerCase();
  const dose = normalizeTextValue(row.dose_amount || row.dose_text);
  const isDoseNumeric = /^[0-9]+([.,][0-9]+)?$/.test(dose);

  const routeKeywords = ROUTE_OPTIONS.map((option) => option.value);
  if (frequency && routeKeywords.some((keyword) => frequency === keyword || frequency.includes(`${keyword} `))) {
    warnings.push('La frecuencia parece una vía de administración. Revisa la diferenciación entre frecuencia y vía.');
  }

  if (isDoseNumeric && !row.dose_unit_hint) {
    warnings.push('La dosis parece numérica sin unidad. Sugerencia: añade unidad (mg, g, UI, ml, comprimido(s), etc.).');
  }

  if (frequency && route && frequency === route) {
    warnings.push('Frecuencia y vía tienen el mismo valor. Verifica si el dato está en el campo correcto.');
  }

  return warnings;
}

function normalizeSuggestionToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toSuggestionSet(values: readonly string[]): Set<string> {
  return new Set(values.filter((value) => value !== 'otra').map(normalizeSuggestionToken));
}

const FREQUENCY_SET = toSuggestionSet(FREQUENCY_SUGGESTIONS);
const INDICATION_SET = toSuggestionSet(INDICATION_SUGGESTIONS);

function isSuggestedValue(value: string, suggestionSet: ReadonlySet<string>): boolean {
  const normalized = normalizeSuggestionToken(value);
  return normalized.length === 0 || suggestionSet.has(normalized);
}

function eventTypeToStatus(eventType: VisitMedicationEvent['event_type']): MedicationChangeStatus {
  if (eventType === 'added') return 'new';
  if (eventType === 'modified') return 'modified';
  if (eventType === 'stopped') return 'stopped';
  return 'unchanged';
}

function getMedicationStatus(row: MedicationFormRow): MedicationChangeStatus {
  if (!row.previous || row.isInitialCompletion) {
    return 'new';
  }

  if (!row.is_active) {
    return 'stopped';
  }

  const hasChanged =
    normalizeTextValue(row.dose_text) !== normalizeTextValue(row.previous.dose_text) ||
    normalizeTextValue(row.frequency_text) !== normalizeTextValue(row.previous.frequency_text) ||
    normalizeTextValue(row.route_text) !== normalizeTextValue(row.previous.route_text) ||
    normalizeTextValue(row.indication) !== normalizeTextValue(row.previous.indication) ||
    normalizeTextValue(row.start_date) !== normalizeTextValue(row.previous.start_date) ||
    normalizeTextValue(row.notes) !== normalizeTextValue(row.previous.notes) ||
    row.is_active !== row.previous.is_active;

  return hasChanged ? 'modified' : 'unchanged';
}

export function MedicationPanel({ visitId, patientId }: MedicationPanelProps) {
  const [rows, setRows] = useState<MedicationFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [externalCatalogQuery, setExternalCatalogQuery] = useState('');
  const [externalCatalogOptions, setExternalCatalogOptions] = useState<ExternalMedicationSearchItem[]>([]);
  const [externalCatalogLoading, setExternalCatalogLoading] = useState(false);
  const [externalCatalogError, setExternalCatalogError] = useState<string | null>(null);
  const [importingExternalItemId, setImportingExternalItemId] = useState<string | null>(null);
  const [eventSummary, setEventSummary] = useState<VisitMedicationEvent[]>([]);
  const [showCreateCatalogForm, setShowCreateCatalogForm] = useState(false);
  const [creatingCatalogItem, setCreatingCatalogItem] = useState(false);
  const [catalogInfoMessage, setCatalogInfoMessage] = useState<string | null>(null);
  const [catalogDuplicateSuggestion, setCatalogDuplicateSuggestion] = useState<MedicationCatalogItem | null>(null);
  const [createCatalogForm, setCreateCatalogForm] = useState<CreateCatalogFormState>({
    display_name: '',
    active_ingredient: '',
    strength: '',
    form: '',
    route: '',
  });
  const showTechnicalMetadata = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('debug') === '1' || searchParams.get('admin') === '1') {
      return true;
    }
    return window.localStorage.getItem('cmorcv:medication-debug') === '1';
  }, []);

  const hydrateRowsFromSnapshot = (
    items: Awaited<ReturnType<typeof listVisitMedicationSnapshot>>['data'],
    justCreatedId?: string | null,
  ) => {
    setRows(
      items.map((item) => ({
        ...(item.medication_catalog
          ? (() => {
              const origin = resolveMedicationOrigin(item.medication_catalog);
              const sourceBadge = origin.kind === 'external' ? (origin.source === 'external_cima' ? 'cima' : 'external') : 'internal';
              return {
                source_label: sourceBadge === 'cima' ? 'CIMA' : sourceBadge === 'external' ? 'Catálogo externo' : 'Catálogo interno',
                source_badge: sourceBadge,
                source_code: origin.kind === 'external' ? origin.source_code ?? '' : '',
              };
            })()
          : { source_label: 'Catálogo interno', source_badge: 'internal', source_code: '' }),
        id: item.id,
        medication_catalog_id: item.medication_catalog_id,
        display_name: normalizeMedicationDisplayName(item.medication_catalog?.display_name ?? 'Medicamento'),
        dose_text: item.dose_text ?? '',
        dose_amount: inferDoseAmount(item.dose_text),
        frequency_text: item.frequency_text ?? '',
        route_text: item.route_text ?? '',
        indication: item.indication ?? '',
        start_date: item.start_date ?? '',
        notes: item.notes ?? '',
        is_active: item.is_active,
        dose_unit_hint: inferDoseUnitHint(item.dose_text),
        previous: item,
        isInitialCompletion: Boolean(justCreatedId) && item.id === justCreatedId,
      })),
    );
  };

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setErrorMessage(null);
      const result = await listVisitMedicationSnapshot(visitId);

      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
        setLoading(false);
        return;
      }

      hydrateRowsFromSnapshot(result.data);
      setLoading(false);
    })();
  }, [visitId]);

  useEffect(() => {
    void (async () => {
      const result = await listVisitMedicationEvents(visitId);
      if (!result.errorMessage) {
        setEventSummary(result.data);
      }
    })();
  }, [visitId]);

  useEffect(() => {
    const trimmedQuery = externalCatalogQuery.trim();

    if (trimmedQuery.length < 3) {
      setExternalCatalogOptions([]);
      setExternalCatalogLoading(false);
      setExternalCatalogError(null);
      return;
    }

    setExternalCatalogLoading(true);
    setExternalCatalogError(null);

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const result = await searchExternalMedicationCatalog(trimmedQuery);
        if (result.errorMessage) {
          setExternalCatalogOptions([]);
          setExternalCatalogError(result.errorMessage);
          setExternalCatalogLoading(false);
          return;
        }

        setExternalCatalogOptions(result.data);
        setExternalCatalogError(null);
        setExternalCatalogLoading(false);
      })();
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [externalCatalogQuery]);

  const activeCount = useMemo(() => rows.filter((row) => row.is_active).length, [rows]);
  const hasInheritedTreatments = useMemo(() => rows.some((row) => Boolean(row.previous)), [rows]);
  const visitEventStats = useMemo(
    () => ({
      added: eventSummary.filter((event) => event.event_type === 'added'),
      modified: eventSummary.filter((event) => event.event_type === 'modified'),
      stopped: eventSummary.filter((event) => event.event_type === 'stopped'),
      unchanged: eventSummary.filter((event) => event.event_type === 'confirmed_no_change'),
    }),
    [eventSummary],
  );

  const handleImportExternalMedication = async (externalId: string) => {
    if (!externalId) {
      return;
    }

    const selected = externalCatalogOptions.find((item) => item.id === externalId);
    if (!selected) {
      return;
    }

    setImportingExternalItemId(externalId);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCatalogInfoMessage(null);

    const result = await importExternalMedicationToVisit({
      visitId,
      patientId,
      selectedLabel: selected.label,
      sourcePayload: selected.payload,
    });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setImportingExternalItemId(null);
      return;
    }

    hydrateRowsFromSnapshot(result.data, result.newMedicationId);
    const eventResult = await listVisitMedicationEvents(visitId);
    if (!eventResult.errorMessage) {
      setEventSummary(eventResult.data);
    }

    setCatalogInfoMessage(`"${normalizeMedicationDisplayName(selected.label)}" importado desde CIMA y añadido a la visita actual.`);
    setExternalCatalogQuery('');
    setExternalCatalogOptions([]);
    setExternalCatalogLoading(false);
    setExternalCatalogError(null);
    setImportingExternalItemId(null);
  };

  const handleSelectDuplicateSuggestion = () => {
    if (!catalogDuplicateSuggestion) {
      return;
    }
    setRows((prev) => [...prev, emptyDraft(catalogDuplicateSuggestion)]);
    setCatalogInfoMessage(`Se ha seleccionado "${normalizeMedicationDisplayName(catalogDuplicateSuggestion.display_name)}" del catálogo existente.`);
    setCatalogDuplicateSuggestion(null);
    setShowCreateCatalogForm(false);
  };

  const handleCreateCatalogMedication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCatalogInfoMessage(null);
    setCatalogDuplicateSuggestion(null);
    setErrorMessage(null);
    setSuccessMessage(null);
    setCreatingCatalogItem(true);

    const result = await createMedicationCatalogItem(createCatalogForm);
    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setCreatingCatalogItem(false);
      return;
    }

    if (result.data.duplicate) {
      setCatalogDuplicateSuggestion(result.data.duplicate);
      setCatalogInfoMessage(`Ya existe un medicamento muy parecido: "${normalizeMedicationDisplayName(result.data.duplicate.display_name)}".`);
      setCreatingCatalogItem(false);
      return;
    }

    if (!result.data.item) {
      setErrorMessage('No se pudo crear el medicamento en catálogo.');
      setCreatingCatalogItem(false);
      return;
    }

    const createdItem = result.data.item;

    setRows((prev) => [...prev, emptyDraft(createdItem)]);
    setCatalogInfoMessage(`Medicamento "${normalizeMedicationDisplayName(createdItem.display_name)}" creado en catálogo interno y añadido a la visita.`);
    setShowCreateCatalogForm(false);
    setCreateCatalogForm({
      display_name: '',
      active_ingredient: '',
      strength: '',
      form: '',
      route: '',
    });
    setCreatingCatalogItem(false);
  };

  const handleChange = <K extends keyof MedicationFormRow>(index: number, key: K, value: MedicationFormRow[K]) => {
    setSuccessMessage(null);
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };

  const handleToggleActive = (index: number) => {
    const selectedRow = rows[index];
    if (!selectedRow) {
      return;
    }

    const nextIsActive = !selectedRow.is_active;
    setSuccessMessage(
      nextIsActive
        ? `Tratamiento "${selectedRow.display_name}" marcado como activo. Guarda para confirmar.`
        : `Tratamiento "${selectedRow.display_name}" marcado como suspendido. Guarda para confirmar.`,
    );
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, is_active: nextIsActive } : row)));
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const suspendedCount = rows.filter((row) => row.previous?.is_active && !row.is_active).length;

    const payload = rows.map((row) => ({
      id: row.id,
      medication_catalog_id: row.medication_catalog_id,
      dose_text: buildDoseTextForSave(row),
      frequency_text: row.frequency_text,
      route_text: row.route_text,
      indication: row.indication,
      start_date: row.start_date,
      notes: row.notes,
      is_active: row.is_active,
      previous: row.previous,
      isInitialCompletion: row.isInitialCompletion,
    }));

    const result = await saveVisitMedicationChanges({
      visitId,
      patientId,
      rows: payload,
    });

    if (result.errorMessage) {
      setErrorMessage(result.errorMessage);
      setSaving(false);
      return;
    }

    hydrateRowsFromSnapshot(result.data);

    const eventResult = await listVisitMedicationEvents(visitId);
    if (!eventResult.errorMessage) {
      setEventSummary(eventResult.data);
    }

    const saveMessage =
      suspendedCount > 0
        ? `Cambios guardados correctamente. ${suspendedCount} tratamiento(s) suspendido(s).`
        : 'Cambios de medicación guardados correctamente.';
    setSuccessMessage(saveMessage);
    setSaving(false);
  };

  return (
    <section className="card">
      <h2>Medicación longitudinal</h2>
      <p className="help-text">
        Se precarga la medicación activa del paciente. Puedes añadir, ajustar dosis/frecuencia y suspender tratamientos.
      </p>
      {!loading && hasInheritedTreatments ? (
        <p className="notice notice-info panel-notice">
          Tratamiento heredado de seguimiento previo
        </p>
      ) : null}
      {successMessage ? (
        <p className="notice notice-success panel-notice">
          ✓ {successMessage}
        </p>
      ) : null}

      <div className="grid-2 panel-block">
        <label>
          Buscar en catálogo externo (CIMA)
          <input
            value={externalCatalogQuery}
            onChange={(event) => {
              setExternalCatalogError(null);
              setExternalCatalogQuery(event.target.value);
            }}
            placeholder="Ej. atorvastatina, CN..."
          />
        </label>

        <label>
          Importar medicamento externo
          <select
            value=""
            onChange={(event) => {
              void handleImportExternalMedication(event.target.value);
            }}
            disabled={importingExternalItemId !== null}
          >
            <option value="">
              {importingExternalItemId ? 'Importando medicamento CIMA...' : 'Seleccionar resultado CIMA'}
            </option>
            {externalCatalogOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {normalizeMedicationDisplayName(item.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {externalCatalogLoading ? (
        <p className="notice notice-info panel-notice">
          Buscando en CIMA...
        </p>
      ) : null}
      {!externalCatalogLoading && externalCatalogError ? (
        <p className="notice notice-danger panel-notice">
          Error en búsqueda externa: {externalCatalogError}
        </p>
      ) : null}
      {!externalCatalogLoading && !externalCatalogError && externalCatalogQuery.trim().length >= 3 && externalCatalogOptions.length === 0 ? (
        <p className="help-text panel-block">
          Sin resultados en catálogo externo (CIMA).
        </p>
      ) : null}
      {catalogInfoMessage ? (
        <p className="notice notice-info panel-notice">
          {catalogInfoMessage}
        </p>
      ) : null}
      <div className="panel-subsection">
        <p className="help-text">
          ¿No encuentras el medicamento en CIMA? Puedes añadirlo al catálogo interno.
        </p>
        <button type="button" className="button-secondary" onClick={() => setShowCreateCatalogForm((prev) => !prev)}>
          {showCreateCatalogForm ? 'Cancelar alta en catálogo' : 'Añadir al catálogo interno'}
        </button>

        {catalogDuplicateSuggestion ? (
          <p className="notice notice-warning panel-notice">
            Ya existe "{catalogDuplicateSuggestion.display_name}". Evita duplicados y selecciona el existente.
            <button type="button" className="button-secondary button-sm inline-action" onClick={handleSelectDuplicateSuggestion}>
              Seleccionar existente
            </button>
          </p>
        ) : null}

        {showCreateCatalogForm ? (
          <form onSubmit={handleCreateCatalogMedication} className="form-grid">
            <div className="grid-2">
              <label>
                Nombre del medicamento *
                <input
                  value={createCatalogForm.display_name}
                  onChange={(event) => setCreateCatalogForm((prev) => ({ ...prev, display_name: event.target.value }))}
                  placeholder="Ej. Enalapril"
                  required
                />
              </label>
              <label>
                Principio activo
                <input
                  value={createCatalogForm.active_ingredient}
                  onChange={(event) => setCreateCatalogForm((prev) => ({ ...prev, active_ingredient: event.target.value }))}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Concentración
                <input
                  value={createCatalogForm.strength}
                  onChange={(event) => setCreateCatalogForm((prev) => ({ ...prev, strength: event.target.value }))}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Forma farmacéutica
                <input
                  value={createCatalogForm.form}
                  onChange={(event) => setCreateCatalogForm((prev) => ({ ...prev, form: event.target.value }))}
                  placeholder="Opcional"
                />
              </label>
              <label>
                Vía
                <input
                  value={createCatalogForm.route}
                  onChange={(event) => setCreateCatalogForm((prev) => ({ ...prev, route: event.target.value }))}
                  placeholder="Opcional"
                />
              </label>
            </div>
            <div className="actions-inline">
              <button type="submit" disabled={creatingCatalogItem}>
                {creatingCatalogItem ? 'Creando medicamento...' : 'Guardar en catálogo interno'}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <form onSubmit={handleSave} className="form-grid">
        {loading ? <p>Cargando medicación activa...</p> : null}

        {!loading && rows.length === 0 ? (
          <p className="help-text">No hay medicación activa. Usa CIMA o el alta al catálogo interno para añadir tratamientos.</p>
        ) : null}

        {rows.map((row, index) => (
          <article key={`${row.id ?? 'new'}-${index}`} className={row.is_active ? 'medication-row' : 'medication-row is-inactive'}>
            <div className="medication-row-header">
              <div className="medication-row-title">
                <strong>{row.display_name}</strong>
                <StatusBadge tone={row.source_badge === 'cima' ? 'info' : 'neutral'}>{row.source_label}</StatusBadge>
                {(() => {
                  const status = getMedicationStatus(row);
                  const meta = STATUS_META[status];
                  return (
                    <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                  );
                })()}
                {showTechnicalMetadata && row.source_code ? <span className="help-text">Código técnico: {row.source_code}</span> : null}
              </div>
              <button type="button" className="button-secondary button-sm" onClick={() => handleToggleActive(index)}>
                {row.is_active ? 'Suspender' : 'Reactivar'}
              </button>
            </div>

            <div className="grid-2">
              <label>
                Dosis (cantidad)
                <input
                  value={row.dose_amount}
                  onChange={(event) => handleChange(index, 'dose_amount', event.target.value)}
                  inputMode="decimal"
                  placeholder="Ej. 850"
                />
              </label>
              <label>
                Unidad
                <select
                  value={row.dose_unit_hint}
                  onChange={(event) => handleChange(index, 'dose_unit_hint', event.target.value as DoseUnitOptionValue | '')}
                >
                  <option value="">Seleccionar unidad</option>
                  {DOSE_UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Dosis (texto libre, opcional)
                <input
                  value={row.dose_text}
                  onChange={(event) => handleChange(index, 'dose_text', event.target.value)}
                  placeholder="Si necesitas más detalle: 1 comprimido tras desayuno"
                />
              </label>
              <label>
                Frecuencia
                <input
                  list="medication-frequency-options"
                  value={row.frequency_text}
                  onChange={(event) => handleChange(index, 'frequency_text', event.target.value)}
                  placeholder="Ej. 1 vez/día o cada 12 h"
                />
                {!isSuggestedValue(row.frequency_text, FREQUENCY_SET) ? (
                  <span className="help-text text-warning">
                    ⚠ Valor fuera de sugerencias. Se guardará como texto libre.
                  </span>
                ) : null}
              </label>
              <label>
                Vía
                <select
                  value={normalizeRouteValue(row.route_text)}
                  onChange={(event) => handleChange(index, 'route_text', event.target.value)}
                >
                  <option value="">Seleccionar vía de administración</option>
                  {ROUTE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Indicación
                <input
                  list="medication-indication-options"
                  value={row.indication}
                  onChange={(event) => handleChange(index, 'indication', event.target.value)}
                  placeholder="Ej. prevención secundaria"
                />
                {!isSuggestedValue(row.indication, INDICATION_SET) ? (
                  <span className="help-text text-warning">
                    ⚠ Indicación no estandarizada. Se permite texto libre.
                  </span>
                ) : null}
              </label>
              <label>
                Fecha inicio
                <input type="date" value={row.start_date} onChange={(event) => handleChange(index, 'start_date', event.target.value)} />
              </label>
            </div>

            <label className="panel-field">
              Notas
              <textarea rows={2} value={row.notes} onChange={(event) => handleChange(index, 'notes', event.target.value)} />
            </label>
            {(() => {
              const preview = buildDoseTextForSave(row);
              return preview ? (
                <p className="help-text">
                  Dosis final a guardar: <strong>{preview}</strong>
                </p>
              ) : null;
            })()}
            {getSemanticWarnings(row).map((warning) => (
              <p key={`${row.medication_catalog_id}-${index}-${warning}`} className="help-text text-warning">
                ⚠ {warning}
              </p>
            ))}
          </article>
        ))}

        <datalist id="medication-frequency-options">
          {FREQUENCY_SUGGESTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <datalist id="medication-indication-options">
          {INDICATION_SUGGESTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <div className="actions-inline">
          <button type="submit" disabled={saving || loading || rows.length === 0}>
            {saving ? 'Guardando cambios...' : 'Guardar cambios de medicación'}
          </button>
          <span className="help-text">Tratamientos activos: {activeCount}</span>
        </div>
      </form>

      <article className="panel-summary">
        <h3>Resumen de cambios de medicación en esta visita</h3>
        {eventSummary.length === 0 ? (
          <p className="help-text">Aún no hay eventos guardados para esta visita.</p>
        ) : (
          <>
            <p className="help-text">
              Nuevos: {visitEventStats.added.length} · Modificados: {visitEventStats.modified.length} · Suspendidos:{' '}
              {visitEventStats.stopped.length} · Sin cambios: {visitEventStats.unchanged.length}
            </p>
            <div className="grid-2 panel-block">
              <div>
                <p className="help-text text-strong">Nuevos</p>
                <p className="help-text">{visitEventStats.added.slice(0, 3).map((event) => event.patient_medication?.medication_catalog?.display_name ?? 'Medicamento').join(' · ') || '—'}</p>
              </div>
              <div>
                <p className="help-text text-strong">Modificados</p>
                <p className="help-text">{visitEventStats.modified.slice(0, 3).map((event) => event.patient_medication?.medication_catalog?.display_name ?? 'Medicamento').join(' · ') || '—'}</p>
              </div>
              <div>
                <p className="help-text text-strong">Suspendidos</p>
                <p className="help-text">{visitEventStats.stopped.slice(0, 3).map((event) => event.patient_medication?.medication_catalog?.display_name ?? 'Medicamento').join(' · ') || '—'}</p>
              </div>
              <div>
                <p className="help-text text-strong">Sin cambios</p>
                <p className="help-text">{visitEventStats.unchanged.slice(0, 3).map((event) => event.patient_medication?.medication_catalog?.display_name ?? 'Medicamento').join(' · ') || '—'}</p>
              </div>
            </div>
            <ul className="simple-list">
              {eventSummary.slice(0, 8).map((event) => (
                <li key={event.id}>
                  <span>
                    {event.patient_medication?.medication_catalog?.display_name ?? 'Medicamento'}
                    {' · '}
                    {STATUS_META[eventTypeToStatus(event.event_type)].label}
                  </span>
                  <span className="help-text">{new Date(event.created_at).toLocaleString('es-ES')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </article>

      {errorMessage ? <ErrorState title="No se pudo gestionar la medicación" message={errorMessage} /> : null}
    </section>
  );
}
