import { supabase } from '../lib/supabase';
import { type CmoPillar } from '../constants/interventionCatalog';
import { calculateLongitudinalDashboardMetrics, type DashboardScore } from './dashboardAnalytics';

export type DashboardData = {
  pro: {
    cohort: {
      totalPatients: number;
      averageAge: number;
      womenPercentage: number;
      levelPercentage: { 1: number; 2: number; 3: number };
    };
    followup: {
      baselineVisits: number;
      month3Visits: number;
      month6Visits: number;
      extraordinaryVisits: number;
      patientsWithoutFollowup90d: number;
    };
    clinicalEvolution: {
      improved: number;
      worsened: number;
      averageBaselineScore: number;
      averageLatestScore: number;
    };
    pharmaceuticalActivity: {
      totalInterventions: number;
      avgInterventionsPerPatient: number;
      interventionsByPillar: Record<CmoPillar, number>;
      interventionsByLevel: { 1: number; 2: number; 3: number };
    };
  };
  totalPatients: number;
  patientsByPriority: { 1: number; 2: number; 3: number };
  patientEvolutionVsBaseline: { improved: number; worsened: number; stable: number };
  totalInterventions: number;
  avgInterventionsPerPatient: number;
  patientsWithoutFollowup90d: number;
  averageScoreByVisitType: Array<{ visitType: string | null; averageScore: number; visitsWithScore: number }>;
  interventionsByPillar: Record<CmoPillar, number>;
  interventionsByLevel: { 1: number; 2: number; 3: number };
  dataQuality: {
    patientsWithoutBaselineStratification: number;
    visitsWithoutScore: number;
    visitsWithoutInterventions: number;
    level1PatientsWithoutIntervention: number;
  };
  kpiFallbackNotes: string[];
  upcomingVisits: Array<{ id: string; patient_id: string; study_code: string | null; visit_type: string | null; scheduled_date: string | null }>;
  recentVisits: Array<{ id: string; patient_id: string; study_code: string | null; visit_type: string | null; visit_date: string | null }>;
  recentInterventions: Array<{ id: string; visit_id: string; patient_id: string; intervention_type: string; created_at: string | null }>;
};

function normalizeCmoPillar(value: string | null | undefined): CmoPillar | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'capacidad') return 'capacidad';
  if (normalized === 'motivación' || normalized === 'motivacion') return 'motivacion';
  if (normalized === 'oportunidad') return 'oportunidad';
  return null;
}

function getPillarFromIntervention(row: { intervention_type: string | null; intervention_domain: string | null }): CmoPillar | null {
  const savedDomainPillar = normalizeCmoPillar(row.intervention_domain);
  if (savedDomainPillar) return savedDomainPillar;

  return null;
}

export async function loadDashboardData(): Promise<{ data: DashboardData | null; errorMessage: string | null }> {
  if (!supabase) {
    return { data: null, errorMessage: 'Supabase no está configurado. No se puede cargar el dashboard.' };
  }

  const now = new Date().toISOString().slice(0, 10);

  const [
    patientsRes,
    visitsForQualityRes,
    scoresByVisitTypeRes,
    upcomingRes,
    visitsRes,
    interventionsRes,
    interventionsAggRes,
  ] = await Promise.all([
    supabase.from('patients').select('id,age_at_inclusion,sex'),
    supabase
      .from('visits')
      .select('id,patient_id,visit_type,visit_date,scheduled_date,visit_status,created_at,cmo_scores(id,score,priority),clinical_assessments(id),interventions(id)'),
    supabase
      .from('cmo_scores')
      .select('score,visits!inner(visit_type)'),
    supabase
      .from('visits')
      .select('id,patient_id,visit_type,scheduled_date,patients!inner(study_code)')
      .gte('scheduled_date', now)
      .order('scheduled_date', { ascending: true })
      .limit(8),
    supabase
      .from('visits')
      .select('id,patient_id,visit_type,visit_date,patients!inner(study_code)')
      .not('visit_date', 'is', null)
      .order('visit_date', { ascending: false })
      .limit(8),
    supabase
      .from('interventions')
      .select('id,visit_id,intervention_type,created_at,visits!inner(patient_id)')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase.from('interventions').select('linked_to_cmo_level,intervention_type,intervention_domain', { count: 'exact' }),
  ]);

  const errors = [
    patientsRes.error,
    visitsForQualityRes.error,
    scoresByVisitTypeRes.error,
    upcomingRes.error,
    visitsRes.error,
    interventionsRes.error,
    interventionsAggRes.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return { data: null, errorMessage: errors[0]?.message ?? 'No se pudo cargar dashboard.' };
  }

  const byPillar: Record<CmoPillar, number> = {
    capacidad: 0,
    motivacion: 0,
    oportunidad: 0,
  };
  const byLevel = { 1: 0, 2: 0, 3: 0 } as { 1: number; 2: number; 3: number };

  type InterventionAggRow = {
    linked_to_cmo_level: number | null;
    intervention_type: string | null;
    intervention_domain: string | null;
  };

  for (const item of (interventionsAggRes.data ?? []) as InterventionAggRow[]) {
    const level = Number(item.linked_to_cmo_level) as 1 | 2 | 3;
    if (level === 1 || level === 2 || level === 3) byLevel[level] += 1;

    const pillar = getPillarFromIntervention(item);
    if (pillar) byPillar[pillar] += 1;
  }

  const allPatients = (patientsRes.data ?? []) as Array<{ id: string; age_at_inclusion: number | null; sex: string | null }>;
  const visitsForQuality = (visitsForQualityRes.data ?? []) as Array<{
    id: string;
    patient_id: string;
    visit_type: string | null;
    visit_date: string | null;
    scheduled_date: string | null;
    visit_status: string | null;
    created_at: string | null;
    cmo_scores: ({ id: string } & DashboardScore) | Array<{ id: string } & DashboardScore> | null;
    clinical_assessments: { id: string } | Array<{ id: string }> | null;
    interventions: { id: string } | Array<{ id: string }> | null;
  }>;
  const scoresByVisitType = (scoresByVisitTypeRes.data ?? []) as Array<{
    score: number | string | null;
    visits: { visit_type: string | null } | Array<{ visit_type: string | null }>;
  }>;
  const longitudinalMetrics = calculateLongitudinalDashboardMetrics(
    allPatients.map((patient) => patient.id),
    visitsForQuality,
    now,
  );
  const priorities = { 1: 0, 2: 0, 3: 0 } as { 1: number; 2: number; 3: number };
  for (const currentPriority of longitudinalMetrics.latestPriorityByPatient.values()) {
    priorities[currentPriority] += 1;
  }

  const baselineStratifiedPatientIds = new Set<string>();
  for (const visit of visitsForQuality) {
    if (visit.visit_type !== 'baseline' && visit.visit_type !== 'basal') {
      continue;
    }

    const scoreRows = Array.isArray(visit.cmo_scores) ? visit.cmo_scores : (visit.cmo_scores ? [visit.cmo_scores] : []);
    const assessmentRows = Array.isArray(visit.clinical_assessments)
      ? visit.clinical_assessments
      : (visit.clinical_assessments ? [visit.clinical_assessments] : []);

    if (scoreRows.length > 0 || assessmentRows.length > 0) {
      baselineStratifiedPatientIds.add(visit.patient_id);
    }
  }

  const patientsWithoutBaselineStratification = allPatients.reduce((count, patient) => {
    return count + (baselineStratifiedPatientIds.has(patient.id) ? 0 : 1);
  }, 0);
  const kpiFallbackNotes: string[] = [];

  if (baselineStratifiedPatientIds.size === 0 && allPatients.length > 0) {
    kpiFallbackNotes.push(
      "KPI 'Pacientes sin estratificación basal' calculado con fallback: se considera estratificado un paciente con visita basal y score CMO o evaluación clínica registrada.",
    );
  }

  const interventionsByPatient = new Map<string, number>();
  let visitsWithoutScore = 0;
  let visitsWithoutInterventions = 0;
  for (const visit of visitsForQuality) {
    const scoreRows = Array.isArray(visit.cmo_scores) ? visit.cmo_scores : (visit.cmo_scores ? [visit.cmo_scores] : []);
    const interventionRows = Array.isArray(visit.interventions)
      ? visit.interventions
      : (visit.interventions ? [visit.interventions] : []);

    if (scoreRows.length === 0) visitsWithoutScore += 1;
    if (interventionRows.length === 0) visitsWithoutInterventions += 1;
    interventionsByPatient.set(visit.patient_id, (interventionsByPatient.get(visit.patient_id) ?? 0) + interventionRows.length);
  }

  const totalPatients = allPatients.length;
  const avgInterventionsPerPatient = totalPatients === 0 ? 0 : Number(((interventionsAggRes.count ?? 0) / totalPatients).toFixed(2));

  let level1PatientsWithoutIntervention = 0;
  longitudinalMetrics.latestPriorityByPatient.forEach((priority, patientId) => {
    if (priority === 1 && (interventionsByPatient.get(patientId) ?? 0) === 0) {
      level1PatientsWithoutIntervention += 1;
    }
  });

  const scoreAggregation = new Map<string, { total: number; count: number }>();
  for (const row of scoresByVisitType) {
    const numericScore = Number(row.score);
    if (!Number.isFinite(numericScore)) continue;
    const visitType = Array.isArray(row.visits) ? row.visits[0]?.visit_type : row.visits?.visit_type;
    const key = visitType ?? 'unknown';
    const aggregate = scoreAggregation.get(key) ?? { total: 0, count: 0 };
    aggregate.total += numericScore;
    aggregate.count += 1;
    scoreAggregation.set(key, aggregate);
  }
  const averageScoreByVisitType = Array.from(scoreAggregation.entries())
    .map(([visitType, aggregate]) => ({
      visitType: visitType === 'unknown' ? null : visitType,
      averageScore: Number((aggregate.total / aggregate.count).toFixed(2)),
      visitsWithScore: aggregate.count,
    }))
    .sort((a, b) => (a.visitType ?? '').localeCompare(b.visitType ?? ''));

  const ages = allPatients
    .map((patient) => Number(patient.age_at_inclusion))
    .filter((age) => Number.isFinite(age) && age > 0);
  const averageAge = ages.length === 0 ? 0 : Number((ages.reduce((acc, age) => acc + age, 0) / ages.length).toFixed(1));
  const womenCount = allPatients.reduce((count, patient) => count + (patient.sex === 'female' ? 1 : 0), 0);
  const womenPercentage = totalPatients === 0 ? 0 : Number(((womenCount / totalPatients) * 100).toFixed(1));
  const levelPercentage = {
    1: totalPatients === 0 ? 0 : Number(((priorities[1] / totalPatients) * 100).toFixed(1)),
    2: totalPatients === 0 ? 0 : Number(((priorities[2] / totalPatients) * 100).toFixed(1)),
    3: totalPatients === 0 ? 0 : Number(((priorities[3] / totalPatients) * 100).toFixed(1)),
  } as { 1: number; 2: number; 3: number };

  const visitTypeCount = { baseline: 0, month_3: 0, month_6: 0, extra: 0 };
  for (const visit of visitsForQuality) {
    if (visit.visit_type === 'baseline' || visit.visit_type === 'basal') visitTypeCount.baseline += 1;
    if (visit.visit_type === 'month_3') visitTypeCount.month_3 += 1;
    if (visit.visit_type === 'month_6') visitTypeCount.month_6 += 1;
    if (visit.visit_type === 'extra' || visit.visit_type === 'extraordinary') visitTypeCount.extra += 1;
  }

  const {
    improved,
    worsened,
    stable,
    averageBaselineScore,
    averageLatestScore,
    patientsWithoutFollowup90d,
  } = longitudinalMetrics;

  return {
    data: {
      pro: {
        cohort: {
          totalPatients,
          averageAge,
          womenPercentage,
          levelPercentage,
        },
        followup: {
          baselineVisits: visitTypeCount.baseline,
          month3Visits: visitTypeCount.month_3,
          month6Visits: visitTypeCount.month_6,
          extraordinaryVisits: visitTypeCount.extra,
          patientsWithoutFollowup90d,
        },
        clinicalEvolution: {
          improved,
          worsened,
          averageBaselineScore,
          averageLatestScore,
        },
        pharmaceuticalActivity: {
          totalInterventions: interventionsAggRes.count ?? 0,
          avgInterventionsPerPatient,
          interventionsByPillar: byPillar,
          interventionsByLevel: byLevel,
        },
      },
      totalPatients,
      patientsByPriority: priorities,
      patientEvolutionVsBaseline: { improved, worsened, stable },
      totalInterventions: interventionsAggRes.count ?? 0,
      avgInterventionsPerPatient,
      patientsWithoutFollowup90d,
      averageScoreByVisitType,
      interventionsByPillar: byPillar,
      interventionsByLevel: byLevel,
      dataQuality: {
        patientsWithoutBaselineStratification,
        visitsWithoutScore,
        visitsWithoutInterventions,
        level1PatientsWithoutIntervention,
      },
      kpiFallbackNotes,
      upcomingVisits: ((upcomingRes.data ?? []) as Array<{
        id: string; patient_id: string; visit_type: string | null; scheduled_date: string | null;
        patients: { study_code: string | null } | Array<{ study_code: string | null }>;
      }>).map((r) => ({
        id: r.id, patient_id: r.patient_id, visit_type: r.visit_type, scheduled_date: r.scheduled_date,
        study_code: (Array.isArray(r.patients) ? r.patients[0]?.study_code : r.patients?.study_code) ?? null,
      })),
      recentVisits: ((visitsRes.data ?? []) as Array<{
        id: string; patient_id: string; visit_type: string | null; visit_date: string | null;
        patients: { study_code: string | null } | Array<{ study_code: string | null }>;
      }>).map((r) => ({
        id: r.id, patient_id: r.patient_id, visit_type: r.visit_type, visit_date: r.visit_date,
        study_code: (Array.isArray(r.patients) ? r.patients[0]?.study_code : r.patients?.study_code) ?? null,
      })),
      recentInterventions: ((interventionsRes.data ?? []) as Array<{
        id: string; visit_id: string; intervention_type: string; created_at: string | null;
        visits: { patient_id: string } | Array<{ patient_id: string }>;
      }>).map((r) => ({
        id: r.id,
        visit_id: r.visit_id,
        patient_id: Array.isArray(r.visits) ? (r.visits[0]?.patient_id ?? '') : (r.visits?.patient_id ?? ''),
        intervention_type: r.intervention_type,
        created_at: r.created_at,
      })),
    },
    errorMessage: null,
  };
}
