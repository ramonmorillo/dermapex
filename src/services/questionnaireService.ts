import { supabase } from '../lib/supabase';
import { CANONICAL_QUESTIONNAIRE_CODE, deriveQuestionnaireScores, normalizeQuestionnaireCode, type QuestionnaireType } from './questionnaireDomain';

export type { QuestionnaireType } from './questionnaireDomain';

type VisitRelationRow = {
  patient_id?: string | null;
  visit_type?: string | null;
};

type QuestionnaireResponseRow = {
  id: string;
  visit_id: string;
  questionnaire_code?: string | null;
  measurement_id?: string | null;
  responses: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  visits?: VisitRelationRow | VisitRelationRow[] | null;
};

export type QuestionnaireResponseRecord = {
  id: string;
  patient_id: string | null;
  visit_id: string;
  visit_type: string;
  questionnaire_type: QuestionnaireType;
  measurement_id: string | null;
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
  created_at: string;
  updated_at: string;
};

export type QuestionnaireResponseUpsertInput = {
  visit_id: string;
  questionnaire_type: QuestionnaireType;
  responses: Record<string, unknown>;
  total_score: number | null;
  secondary_score: number | null;
};

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  return 'No se pudo procesar el cuestionario.';
}

function getVisitRelation(row: QuestionnaireResponseRow): VisitRelationRow {
  if (Array.isArray(row.visits)) {
    return row.visits[0] ?? {};
  }

  return row.visits ?? {};
}

async function resolveQuestionnaireMeasurementMap(): Promise<{
  measurementIdByType: Map<QuestionnaireType, string>;
  questionnaireTypeByMeasurementId: Map<string, QuestionnaireType>;
  errorMessage: string | null;
}> {
  if (!supabase) {
    return {
      measurementIdByType: new Map(),
      questionnaireTypeByMeasurementId: new Map(),
      errorMessage: 'Supabase no está configurado.',
    };
  }

  const measurementIdByType = new Map<QuestionnaireType, string>();
  const questionnaireTypeByMeasurementId = new Map<string, QuestionnaireType>();

  for (const questionnaireType of Object.keys(CANONICAL_QUESTIONNAIRE_CODE) as QuestionnaireType[]) {
    const code = CANONICAL_QUESTIONNAIRE_CODE[questionnaireType];
    const { data, error } = await supabase.from('questionnaire_measurement_map').select('measurement_id').eq('questionnaire_code', code);

    console.debug('[questionnaire-map] lookup', {
      requestedCode: code,
      rowsReturned: data?.length ?? 0,
      supabaseError: error,
    });

    if (error) {
      return {
        measurementIdByType: new Map(),
        questionnaireTypeByMeasurementId: new Map(),
        errorMessage: extractErrorMessage(error),
      };
    }

    const measurementId = ((data ?? []) as Array<{ measurement_id: string }>)[0]?.measurement_id ?? null;

    if (!measurementId) {
      continue;
    }

    measurementIdByType.set(questionnaireType, measurementId);
    questionnaireTypeByMeasurementId.set(measurementId, questionnaireType);
  }

  return {
    measurementIdByType,
    questionnaireTypeByMeasurementId,
    errorMessage: null,
  };
}

function normalizeQuestionnaireRows(rows: QuestionnaireResponseRow[], questionnaireTypeByMeasurementId: Map<string, QuestionnaireType>): QuestionnaireResponseRecord[] {
  return rows.flatMap((row) => {
    const questionnaireType = normalizeQuestionnaireCode(row.questionnaire_code) ?? (row.measurement_id ? (questionnaireTypeByMeasurementId.get(row.measurement_id) ?? null) : null);

    if (!questionnaireType) {
      return [];
    }

    const visit = getVisitRelation(row);
    const scores = deriveQuestionnaireScores(questionnaireType, row.responses ?? {});

    return [
      {
        id: row.id,
        patient_id: visit.patient_id ?? null,
        visit_id: row.visit_id,
        visit_type: visit.visit_type ?? 'unknown',
        questionnaire_type: questionnaireType,
        measurement_id: row.measurement_id ?? null,
        responses: row.responses,
        total_score: scores.totalScore,
        secondary_score: scores.secondaryScore,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    ];
  });
}

export function isQuestionnaireVisitType(visitType: string | null | undefined): boolean {
  return visitType === 'baseline' || visitType === 'final' || visitType === 'month_12';
}

const QUESTIONNAIRE_BASE_SELECT = 'id,visit_id,questionnaire_code,measurement_id,responses,created_at,updated_at,visits!inner(patient_id,visit_type)';

export async function listQuestionnairesByVisit(visitId: string): Promise<{
  data: QuestionnaireResponseRecord[];
  errorMessage: string | null;
}> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.',
    };
  }

  const queryResult = await supabase.from('questionnaire_responses').select(QUESTIONNAIRE_BASE_SELECT).eq('visit_id', visitId);

  if (queryResult.error) {
    return { data: [], errorMessage: extractErrorMessage(queryResult.error) };
  }

  return {
    data: normalizeQuestionnaireRows((queryResult.data ?? []) as unknown as QuestionnaireResponseRow[], new Map()),
    errorMessage: null,
  };
}

export async function getQuestionnairesByPatient(patientId: string): Promise<{
  data: QuestionnaireResponseRecord[];
  errorMessage: string | null;
}> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.',
    };
  }

  const visitQueryResult = await supabase.from('visits').select('id').eq('patient_id', patientId);

  if (visitQueryResult.error) {
    return {
      data: [],
      errorMessage: extractErrorMessage(visitQueryResult.error),
    };
  }

  const visitIds = (visitQueryResult.data ?? []).map((row) => row.id).filter((id): id is string => typeof id === 'string');
  if (visitIds.length === 0) {
    return { data: [], errorMessage: null };
  }

  const { data, error } = await supabase
    .from('questionnaire_responses')
    .select(QUESTIONNAIRE_BASE_SELECT)
    .in('visit_id', visitIds)
    .eq('visits.patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return {
    data: normalizeQuestionnaireRows((data ?? []) as unknown as QuestionnaireResponseRow[], new Map()),
    errorMessage: null,
  };
}

export const listQuestionnairesByPatient = getQuestionnairesByPatient;

export async function saveQuestionnaireBundle(input: QuestionnaireResponseUpsertInput[]): Promise<{
  data: QuestionnaireResponseRecord[];
  errorMessage: string | null;
}> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden guardar cuestionarios.',
    };
  }

  const authResult = await supabase.auth.getUser();
  if (authResult.error) {
    return { data: [], errorMessage: extractErrorMessage(authResult.error) };
  }

  const authenticatedUser = authResult.data.user;
  if (!authenticatedUser) {
    return {
      data: [],
      errorMessage: 'No hay un usuario autenticado. Inicia sesión e inténtalo de nuevo.',
    };
  }

  const measurementMapResult = await resolveQuestionnaireMeasurementMap();
  if (measurementMapResult.errorMessage) {
    return { data: [], errorMessage: measurementMapResult.errorMessage };
  }

  const payload = [];

  for (const { visit_id, questionnaire_type, responses } of input) {
    let measurementId = measurementMapResult.measurementIdByType.get(questionnaire_type) ?? null;

    if (!measurementId) {
      if (questionnaire_type === 'pam10') {
        return {
          data: [],
          errorMessage: 'No existe un measurement_id configurado para PAM10 en questionnaire_measurement_map. Configura el mapeo antes de guardar cuestionarios.',
        };
      }

      return {
        data: [],
        errorMessage: `No existe una medición asociada en questionnaire_measurement_map para el cuestionario ${questionnaire_type.toUpperCase()}.`,
      };
    }

    payload.push({
      visit_id,
      user_id: authenticatedUser.id,
      measurement_id: measurementId,
      questionnaire_code: CANONICAL_QUESTIONNAIRE_CODE[questionnaire_type],
      responses,
    });
  }

  const { data, error } = await supabase.from('questionnaire_responses').upsert(payload, { onConflict: 'visit_id,questionnaire_code' }).select(QUESTIONNAIRE_BASE_SELECT);

  if (error) {
    return { data: [], errorMessage: extractErrorMessage(error) };
  }

  return {
    data: normalizeQuestionnaireRows((data ?? []) as unknown as QuestionnaireResponseRow[], measurementMapResult.questionnaireTypeByMeasurementId),
    errorMessage: null,
  };
}

export async function listAllQuestionnaires(): Promise<{
  data: QuestionnaireResponseRecord[];
  errorMessage: string | null;
}> {
  if (!supabase) {
    return {
      data: [],
      errorMessage: 'Supabase no está configurado. No se pueden cargar cuestionarios.',
    };
  }

  const queryResult = await supabase.from('questionnaire_responses').select(QUESTIONNAIRE_BASE_SELECT);

  if (queryResult.error) {
    return { data: [], errorMessage: extractErrorMessage(queryResult.error) };
  }

  return {
    data: normalizeQuestionnaireRows((queryResult.data ?? []) as unknown as QuestionnaireResponseRow[], new Map()),
    errorMessage: null,
  };
}
