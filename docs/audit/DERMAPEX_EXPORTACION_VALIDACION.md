# DERMAPEX · Informe de validación · Fase 3, bloque 1 (exportación) y copias de seguridad

Fecha: 2026-10-28.
Rama: `claude/determined-hopper-7fblji`.
Autorización del IP: bloque 1 (exportación) y script de copia ejecutado por el IP.
Los bloques 2, 3 y 4 del plan **no** están autorizados y **no** se han implementado.

Todas las pruebas usan **datos 100 % sintéticos**. No se ha leído ni exportado contenido clínico de producción.

## 1. Qué se ha cambiado

| Incidencia (diagnóstico) | Estado | Cómo |
|---|---|---|
| C1 · Truncado silencioso a 1000 filas | **Corregida y comprobada** | Lectura paginada con orden estable por clave única; avanza según las filas recibidas; conciliación con `count: exact` antes y después de leer |
| C2 · Sin manifiesto ni conciliación | **Corregida y comprobada** | `manifest.json`: recuentos BD frente a exportado, SHA-256, alcance, exclusiones, versiones. La exportación se aborta si algo no cuadra |
| C3 · Ítems de cuestionario solo como JSON | **Corregida y comprobada** | `analisis/cuestionarios_items` (una fila por ítem) e ítems de IEXPAC en WIDE |
| A5 · Seudónimo inestable | **Corregida** | Identificador = `study_code` y UUID; se eliminan los secuenciales `P0001`/`V00001` |
| A6 · Textos alterados | **Corregida y comprobada** | Sin normalización: los saltos de línea se conservan (RFC 4180) |
| A7 · Cabeceras inestables | **Corregida** | Cabeceras fijas definidas en el código (`spec.ts`) |
| A8 · Datos almacenados no exportados | **Corregida y comprobada** | Tablas raw de todas las tablas clínicas, incluidas `visit_status`, `extraordinary_reason`, notas, `visit_medication_events`, `consents`, metadatos de documentos y medicación no activa. Exclusiones explícitas y justificadas |
| B1 · `\r` sin entrecomillar | **Corregida y comprobada** | |
| M3 · Sin diccionario | **Corregida y comprobada** | `diccionario_variables.csv` generado desde la misma definición que las cabeceras; la prueba verifica que cubre todas las variables |
| C5 · Sin copias restaurables | **Mitigada; pendiente de ejecutar en producción** | Scripts de copia cifrada y de verificación de la restauración, probados en local (ver §3) |
| (nuevo) `.sps` heredados no válidos | **Corregida y comprobada** | La sintaxis anterior declaraba variables numéricas sin formato, leía fechas ISO con `EDATE` y usaba `MISSING VALUES ALL ("")`. Se sustituye por sintaxis generada y verificada con PSPP |
| (nuevo) `.sav` binario no verificado | **Retirado** | La ruta SPSS es CSV + `.sps`, verificada |

## 2. Resultados de las pruebas

**Cómo reproducirlas:**
- `npm test`;
- integración con BD: ver la cabecera de `tests/researchExport.db.test.ts`;
- SPSS: `scripts/validate-export-spss.py`;
- copias: `docs/audit/DERMAPEX_COPIAS_SEGURIDAD.md` §8.

En CI, el job `export` ejecuta automáticamente las de BD y SPSS.

| N.º (encargo) | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | Alta de paciente | Superada (previa) | `db-tests/10_*`, `30_*` |
| 2 | Prevención de duplicados | **Parcial** | Visitas: superada (`db-tests/90_*`). Pacientes por doble clic: **no ejecutada** (bloque 2) |
| 3-4 | Registro de visita basal y de seguimiento | **No ejecutada** en esta fase | Prueba de humo e2e existente, no ejecutada en esta sesión |
| 5 | Cuestionario completo | **Parcial** | Almacenamiento → exportación íntegra de todos los ítems: superada. Guardado desde el formulario: bloque 2 |
| 6 | Cuestionario incompleto | **No ejecutada** | Hoy no se puede guardar (C6): bloque 2 |
| 7 | Corrección de un dato | **Parcial** | `audit_log` guarda el antes y el después (db-tests). Motivo de corrección: bloque 3 |
| 8 | Edición simultánea | **No ejecutada** | Bloque 2 |
| 9-11 | Fallo de conexión, fallo de escritura y recuperación | **Superada para la exportación** | Corte, cambio concurrente y orden inestable simulados: la exportación se aborta sin entregar nada. Formularios: bloque 2 |
| 12 | Exportación Excel | **Superada** | Todas las hojas con todas las filas; notas con saltos de línea y fechas sin desfase |
| 13 | Exportación CSV | **Superada** | Relectura independiente; dialecto estándar y español |
| 14 | Formato longitudinal | **Superada** | Una fila por visita (= n.º de visitas) |
| 15 | Formato transversal | **Superada** | Una fila por paciente; cambio IEXPAC v12 − v0 correcto; visita cancelada |
| 16 | Relaciones uno-a-muchos | **Superada** | Más de 1000 intervenciones exportadas sin pérdida |
| 17 | Importación en SPSS mediante sintaxis | **Superada con PSPP 2.0** | 38/38 `.sps` (19 conjuntos × 2 dialectos) ejecutados sin errores ni avisos; `.sav` comparado **celda a celda** con el CSV (pyreadstat). **IBM SPSS: pendiente** de una ejecución manual por el IP |
| 18 | Conservación de valores nulos | **Superada** | Vacío ⇔ nulo en CSV, Excel y SPSS (perdido del sistema); nunca 0 |
| 19 | Caracteres especiales | **Superada** | Comas, punto y coma, comillas, CR/LF, ñ, tildes, «», emoji y ceros a la izquierda. En SPSS se pierden los espacios finales (limitación del formato) |
| 20 | Recuentos y valores frente al origen | **Superada** | Valor a valor en 11 tablas raw (origen simulado); recuentos frente a BD real en PostgreSQL local |
| 21 | Acceso no autorizado entre centros | **Superada** | Con la RLS real, un investigador exporta solo su centro: el paquete no contiene ni el código ni el UUID de pacientes del otro centro |
| 22 | Registro de auditoría | Superada (previa, parcial) | `db-tests`. El registro de exportaciones en `audit_log` es del bloque 6, no autorizado |
| 23 | Alto volumen | **Superada** | 600 pacientes (~5-8 s); 5 003 filas con límites de servidor de 1 000 y de 100 |
| 24 | Restauración desde copia | **Superada en local con datos sintéticos** | 39/39 tablas, 149 políticas RLS; frase incorrecta y fichero alterado rechazados. **Producción: pendiente** (la ejecuta el IP) |

Resumen: `vitest` 172/172 superadas (175 con las de BD); PSPP 38/38; restauración 39/39 tablas.

## 3. Comprobación contra el esquema real

`tests/researchExport.db.test.ts` ejecuta la exportación con las mismas consultas que la app sobre PostgreSQL 16 local, con las 28 migraciones, la RLS real y una estratificación CMO guardada con `save_cmo_stratification`. Comprueba tres cosas:
- todas las columnas pedidas existen en tablas y vistas;
- coordinación exporta 2 centros y más de 1 100 visitas, con recuentos idénticos a la BD;
- cada investigador exporta solo su centro.

**Límite:** no ejecuta la capa HTTP de PostgREST, cuyo límite de filas se prueba con el origen simulado. No se pudo instalar PostgREST en el entorno (descarga de binarios externos no permitida).

## 4. Riesgos residuales y pendientes

| Riesgo | Gravedad | Mitigación o siguiente paso |
|---|---|---|
| Copias aún no ejecutadas contra producción | **Crítica** hasta hacerlo | El IP ejecuta `dermapex-backup.sh` + `dermapex-restore-verify.sh` y lo registra |
| Los PDF de Storage no están en la copia | Alta | Descarga manual periódica (procedimiento §1); automatizarla requiere credencial de servicio |
| Plan gratuito (pausa por inactividad, sin copias gestionadas) | Alta | Decisión del promotor; las copias propias lo mitigan |
| Reglas de puntuación provisionales (IEXPAC = variable principal) | **Crítica para el análisis** | Manual oficial de IEXPAC. Las respuestas individuales se exportan, así que se pueden recalcular |
| IEXPAC ítems 12-15: «No aplica» **no se guarda** (se omite la clave) | Media | No se distingue «no aplica» de «no contestado». Corregir en el bloque 2 (guardar `"na"`) tras confirmar con el manual |
| Variables clínicas de DA, POEM, NRS y estado en el estudio inexistentes | **Crítica** | Bloque 5: protocolo v1.0 y CRD |
| Texto vacío `''` frente a nulo: indistinguibles en CSV y SPSS | Baja | El JSON los distingue. La app guarda `null` para los vacíos |
| Celdas de Excel > 32 767 caracteres | Baja | Esa hoja se omite con aviso en el manifiesto; el CSV y el JSON están completos |
| Fórmulas al abrir el CSV con doble clic en Excel | Baja | Documentado en la guía; usar el `.xlsx` |
| Verificación con IBM SPSS | Media | Validado con PSPP. Una ejecución manual en SPSS institucional cerraría el punto |

## 5. Estructura de datos antes y después

**Sin cambios de esquema en este bloque.** Ni migraciones ni cambios en producción. Solo cambian:
- el código de exportación (`src/services/researchExport/*`, `exportService.ts`, `DashboardPage.tsx`);
- un parámetro opcional en `stratificationExport.ts`;
- los scripts y la documentación;
- el job de CI `export`.
