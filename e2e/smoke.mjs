// SOLO PARA PRUEBAS LOCALES. Prueba de humo en Chromium del flujo de estratificación CMO-DERMAPEX en
// un centro de la cohorte CMO y en uno de la cohorte estándar, contra PostgreSQL + PostgREST locales
// (RLS real de las migraciones). Lo orquesta e2e/run-smoke.sh. Guarda capturas en
// docs/e2e-screenshots/. Cualquier aserción fallida termina con código ≠ 0.
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const STACK_URL = process.env.STACK_URL ?? 'http://127.0.0.1:54321';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dermapex-e2e-local-secret-not-for-production-000';
const SHOTS = resolve(process.env.SCREENSHOT_DIR ?? 'docs/e2e-screenshots');
mkdirSync(SHOTS, { recursive: true });

const CMO_VISIT = 'a1000000-e2e0-4000-8000-000000000001';
const CMO_PATIENT = 'a0000000-e2e0-4000-8000-000000000001';
const STD_VISIT = 'b1000000-e2e0-4000-8000-000000000001';
const STD_PATIENT = 'b0000000-e2e0-4000-8000-000000000001';

const VARIABLES = [
  'sexo_mujer', 'peso_obesidad', 'embarazada', 'deseo_embarazo',
  'alcoholismo_drogas', 'tabaquismo', 'barreras_comunicacion', 'sin_soporte_social', 'situacion_laboral_dificil',
  'calidad_vida_baja', 'problemas_psicologicos', 'deterioro_cognitivo_funcional',
  'comorbilidades_2mas', 'insuficiencia_renal_hepatica', 'multidisciplinariedad', 'hospitalizaciones_urgencias', 'actividad_enfermedad',
  'naive_terapia', 'polimedicacion', 'modificacion_regimen', 'medicamento_alto_riesgo', 'interacciones', 'reacciones_adversas',
  'falta_adherencia', 'medicamento_reciente',
];

let failures = 0;
function check(condition, message) {
  if (condition) {
    console.log(`OK  ${message}`);
  } else {
    failures += 1;
    console.error(`FALLO  ${message}`);
  }
}

function jwtFor(sub) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 600 })}`;
  return `${unsigned}.${createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url')}`;
}

async function rest(sub, path) {
  const response = await fetch(`${STACK_URL}/rest/v1/${path}`, { headers: { Authorization: `Bearer ${jwtFor(sub)}` } });
  return response.json();
}

async function login(page, email) {
  await page.goto(`${APP_URL}/#/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('e2e-password');
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(/#\/dashboard/, { timeout: 15000 });
}

async function answer(page, values) {
  for (const code of VARIABLES) {
    await page.locator(`[data-variable="${code}"] input[value="${values[code] ?? 'no'}"]`).check();
  }
  await page.locator(`[data-variable="comorbilidades_cv_diabetes"] input[value="${values.comorbilidades_cv_diabetes ?? 'ninguna'}"]`).check();
  await page.locator(`[data-variable="conservacion_especial"] input[value="${values.conservacion_especial ?? 'no'}"]`).check();
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const consoleErrors = [];

async function newPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: 'es-ES' });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  return { context, page };
}

// ── 1. Centro de la cohorte CMO ──────────────────────────────────────────────
{
  const { context, page } = await newPage();
  await login(page, 'cmo@e2e.test');
  await page.goto(`${APP_URL}/#/visits/${CMO_VISIT}/stratification`);
  await page.getByRole('heading', { name: 'Estratificación CMO-DERMAPEX' }).waitFor();

  check(await page.locator('[data-variable="sexo_mujer"] input[value="si"]').isChecked(), 'CMO: «Sexo femenino» precargado desde la ficha');
  check((await page.locator('[data-variable="edad_grupo"]').innerText()).includes('34 años → 18-69 años'), 'CMO: edad derivada de la ficha (34 → 18-69)');
  check(await page.locator('[data-variable="dolor_presente"], [data-variable="complicaciones_intestinales"]').count() === 0, 'CMO: no aparecen variables músculo-esqueléticas ni gastrointestinales');
  check(await page.getByRole('button', { name: 'Guardar estratificación' }).isDisabled(), 'CMO: no se puede guardar sin motivo ni respuestas');

  // 34 años (2) + mujer (1) + naïve (4) + adherencia (4) + polimedicación (3) + tabaquismo (2) + reciente (2)
  // + cardiometabólica «una» (1) = 19 → nivel 2; calidad de vida «desconocido» → incompleto.
  await answer(page, {
    sexo_mujer: 'si', naive_terapia: 'si', falta_adherencia: 'si', polimedicacion: 'si', tabaquismo: 'si', medicamento_reciente: 'si',
    calidad_vida_baja: 'unknown', comorbilidades_cv_diabetes: 'una', conservacion_especial: 'si',
  });
  await page.locator('.strat-reason select').selectOption('baseline');
  const previewText = await page.locator('section[aria-labelledby="strat-preview-title"]').innerText();
  check(previewText.includes('19') && previewText.includes('Nivel 2 · Prioridad 2'), 'CMO: vista previa 19 puntos · nivel 2');
  check(previewText.includes('Resultado incompleto: 1 variable'), 'CMO: aviso de resultado incompleto (D1)');
  await page.screenshot({ path: `${SHOTS}/01-cmo-formulario-vista-previa.png`, fullPage: true });

  await page.getByRole('button', { name: 'Guardar estratificación' }).click();
  await page.locator('section[aria-labelledby="strat-saved-title"]').waitFor();
  const saved = await page.locator('section[aria-labelledby="strat-saved-title"]').innerText();
  check(saved.includes('19') && saved.includes('Nivel 2 · Prioridad 2'), 'CMO: resultado guardado 19 puntos · nivel 2');
  check(saved.toLowerCase().includes('paquete mínimo · nivel 2') && saved.includes('Seguimiento reforzado'), 'CMO: paquete mínimo del protocolo del nivel 2 (anexo A)');
  check(saved.includes('Registro incompleto: 1 variable') && saved.includes('Calidad de vida disminuida'), 'CMO: registro incompleto con la variable desconocida');
  check(saved.includes('Requisitos especiales de conservación') && saved.includes('no puntúa'), 'CMO: variable informativa registrada sin puntuar');
  check(!saved.includes('semestral') && !saved.includes('anual'), 'CMO: no se muestra la periodicidad de la fuente (D4)');
  await page.screenshot({ path: `${SHOTS}/02-cmo-resultado-guardado.png`, fullPage: true });

  // Intervenciones: catálogo filtrado por nivel 2 (17 de 20 tarjetas) y «ver todas».
  await page.goto(`${APP_URL}/#/visits/${CMO_VISIT}/interventions`);
  await page.getByRole('heading', { name: 'Nueva intervención' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('select[required] optgroup option').length > 0);
  const filtered = await page.locator('select[required] optgroup option').count();
  check(filtered === 17, `CMO: catálogo filtrado para nivel 2 = 17 tarjetas (obtenido ${filtered})`);
  await page.getByLabel('Ver todas las intervenciones del catálogo').check();
  const all = await page.locator('select[required] optgroup option').count();
  check(all === 20, `CMO: «ver todas» muestra las 20 tarjetas (obtenido ${all})`);
  await page.locator('select[required]').first().selectOption({ label: 'Control de adherencia y desarrollo de intervenciones específicas' });
  await page.getByRole('button', { name: 'Guardar intervención' }).click();
  await page.locator('.intervention-list li').first().waitFor();
  const listed = await page.locator('.intervention-list').innerText();
  check(listed.includes('seg-control-adherencia · cmoinmunomediadas@227e444-draft') && listed.includes('Motivación'), 'CMO: intervención guardada con código, versión de catálogo y pilar');
  await page.screenshot({ path: `${SHOTS}/03-cmo-intervenciones.png`, fullPage: true });

  await page.goto(`${APP_URL}/#/patients/${CMO_PATIENT}`);
  await page.getByRole('heading', { name: 'Historial de estratificaciones CMO' }).waitFor();
  const history = await page.locator('section[aria-labelledby="patient-stratification-history"]').innerText();
  check(history.includes('Basal') && history.includes('19') && history.includes('N2 · P2') && history.includes('cmo-dermapex-1.0.0+src.227e444'), 'CMO: historial con fecha, motivo, puntuación, nivel y versión del motor');
  await page.screenshot({ path: `${SHOTS}/04-cmo-ficha-historial.png`, fullPage: true });

  // Vista móvil (ancho de teléfono).
  const mobile = await newPage({ width: 390, height: 844 });
  await login(mobile.page, 'cmo@e2e.test');
  await mobile.page.goto(`${APP_URL}/#/visits/${CMO_VISIT}/stratification`);
  await mobile.page.locator('section[aria-labelledby="strat-saved-title"]').waitFor();
  const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `CMO: sin desplazamiento horizontal a 390 px (exceso ${overflow}px)`);
  await mobile.page.screenshot({ path: `${SHOTS}/05-cmo-movil.png`, fullPage: false });
  await mobile.context.close();
  await context.close();
}

// ── 2. Centro de la cohorte estándar ─────────────────────────────────────────
{
  const { context, page } = await newPage();
  await login(page, 'estandar@e2e.test');
  await page.goto(`${APP_URL}/#/visits/${STD_VISIT}/stratification`);
  await page.getByRole('heading', { name: 'Estratificación CMO-DERMAPEX' }).waitFor();
  check(await page.locator('[data-variable="sexo_mujer"] input[value="no"]').isChecked(), 'Estándar: «Sexo femenino» = No precargado (varón)');
  check(await page.locator('section[aria-labelledby="strat-preview-title"]').count() === 0, 'Estándar: sin vista previa de puntuación');
  check(await page.locator('.strat-points').count() === 0, 'Estándar: no se muestran los puntos de cada opción');

  // 58 años (2) + naïve 4 + adherencia 4 + polimedicación 3 + interacciones 3 + RAM 3 + modificación 3
  //   + alcohol 3 + barreras 3 + comorbilidades 2 + cardiometabólica más de una 2 = 32 → nivel 1 (no debe mostrarse).
  await answer(page, {
    naive_terapia: 'si', falta_adherencia: 'si', polimedicacion: 'si', interacciones: 'si', reacciones_adversas: 'si', modificacion_regimen: 'si',
    alcoholismo_drogas: 'si', barreras_comunicacion: 'si', comorbilidades_2mas: 'si', comorbilidades_cv_diabetes: 'mas-una',
  });
  await page.locator('.strat-reason select').selectOption('baseline');
  await page.getByRole('button', { name: 'Guardar estratificación' }).click();
  await page.getByText('Datos de estratificación registrados. Centro de atención farmacéutica estándar').first().waitFor();
  const body = await page.locator('main').innerText();
  check(body.includes('Datos de estratificación registrados. Centro de atención farmacéutica estándar'), 'Estándar: mensaje del brazo comparador tras guardar');
  check(!/Nivel [123] · Prioridad/.test(body) && !body.includes('32 puntos') && !body.toLowerCase().includes('paquete mínimo'), 'Estándar: no se muestran nivel, puntuación ni paquete');
  await page.screenshot({ path: `${SHOTS}/06-estandar-registrado.png`, fullPage: true });

  const scores = await rest('bbbbbbbb-e2e0-4000-8000-000000000001', 'cmo_scores?select=score,priority');
  const registry = await rest('bbbbbbbb-e2e0-4000-8000-000000000001', 'cmo_stratification_registry?select=score,priority,stratification_reason,results_visible');
  check(Array.isArray(scores) && scores.length === 0, 'Estándar (API): cmo_scores no devuelve filas');
  check(registry.length === 1 && registry[0].score === null && registry[0].priority === null && registry[0].stratification_reason === 'baseline', 'Estándar (API): registro enmascarado (puntuación y nivel NULL)');
  const catalog = await rest('bbbbbbbb-e2e0-4000-8000-000000000001', 'intervention_catalog?select=code');
  check(Array.isArray(catalog) && catalog.length === 0, 'Estándar (API): catálogo CMO no visible');

  await page.goto(`${APP_URL}/#/visits/${STD_VISIT}/interventions`);
  await page.getByText('solo están disponibles en los centros de la cohorte').waitFor();
  check(await page.locator('form select').count() === 0, 'Estándar: sin formulario ni catálogo de intervenciones');
  await page.screenshot({ path: `${SHOTS}/07-estandar-intervenciones.png`, fullPage: true });

  await page.goto(`${APP_URL}/#/patients/${STD_PATIENT}`);
  await page.getByRole('heading', { name: 'Historial de estratificaciones CMO' }).waitFor();
  const history = await page.locator('section[aria-labelledby="patient-stratification-history"]').innerText();
  check(history.includes('Basal') && history.includes('No visible') && !history.includes('32'), 'Estándar: historial con fecha y motivo, sin puntuación ni nivel');
  await page.screenshot({ path: `${SHOTS}/08-estandar-ficha-historial.png`, fullPage: true });
  await context.close();
}

// ── 3. Coordinación ve los resultados del brazo estándar ────────────────────
{
  const { context, page } = await newPage();
  await login(page, 'coordinacion@e2e.test');
  await page.goto(`${APP_URL}/#/visits/${STD_VISIT}/stratification`);
  await page.locator('section[aria-labelledby="strat-saved-title"]').waitFor();
  const saved = await page.locator('section[aria-labelledby="strat-saved-title"]').innerText();
  check(saved.includes('32') && saved.includes('Nivel 1 · Prioridad 1'), 'Coordinación: ve 32 puntos · nivel 1 del brazo estándar');
  await page.screenshot({ path: `${SHOTS}/09-coordinacion-ve-estandar.png`, fullPage: true });
  await context.close();
}

await browser.close();

const relevantErrors = consoleErrors.filter((e) => !e.includes('favicon'));
check(relevantErrors.length === 0, `sin errores de consola (${relevantErrors.length})${relevantErrors.length ? `: ${relevantErrors.slice(0, 3).join(' | ')}` : ''}`);

if (failures > 0) {
  console.error(`\n${failures} comprobación(es) fallida(s).`);
  process.exit(1);
}
console.log('\nPrueba de humo e2e superada. Capturas en', SHOTS);
