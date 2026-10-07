# COAMO · Especificación del modelo CMO de coagulopatías congénitas para la herramienta

Versión 1.0 · 7 de octubre de 2026 · Estado: **aprobada por el IP para implementación** (decisiones en §5).

**Fuente única del modelo (M):** *Adaptación del Modelo de Atención Farmacéutica CMO al paciente con coagulopatías congénitas.* Juárez Giménez JC, Morillo Verdugo R (coords.). SEFH, febrero 2026. ISBN 978-84-09-80912-7. Páginas = numeración impresa del documento.
**Protocolo (P):** Memoria de proyecto COAMO, IIS La Fe, IP Tomás Palanques Pastor, firmada 30/08/2026.

Nada de este documento procede de otros modelos CMO (dermatitis, migraña) ni de herramientas externas.

## 1. Variables y puntuación (M pp. 11-16)

23 variables, pesos 1-4. Puntuación global = suma (M p. 17).

### Demográficas (Tabla 1, M p. 12) · máx. 3

| Código | Variable | Opción | Puntos |
|---|---|---|---|
| D_EDAD | Edad | 18-50 años | 1 |
| | | >50 años | 2 |
| | | <18 años → modelo pediátrico (fuera del estudio: P exige ≥18) | — |
| D_PESO | Peso | Obesidad (IMC ≥30 kg/m²) | 1 |

### Clínicas (Tabla 2, M pp. 13-14) · máx. 25

| Código | Variable | Opción | Puntos |
|---|---|---|---|
| C_INHIB | Desarrollo de inhibidores frente a FVIII o FIX | Ha desarrollado inhibidores | 3 |
| C_DOLOR | Dolor (excluyentes) | Leve/moderado | 1 |
| | | Persistente asociado a daño articular crónico por sangrados repetidos | 2 |
| | | Agudo por hemartrosis o hematoma muscular por hemorragia activa | 3 |
| C_ARTIC | Estado/salud articular | Complicaciones musculoesqueléticas por hemorragias (artropatía, contracturas permanentes, deformidad, discapacidad, prótesis) | 3 |
| C_GRAV_HEM | Gravedad según tipo de hemorragia (excluyentes) | Hemorragias que requieren ingreso hospitalario | 2 |
| | | Hemorragias manejadas de forma ambulatoria o en domicilio | 3 |
| C_GRAV_HF | Gravedad hemofilia (solo HA/HB; excluyentes) | Leve: FVIII:C/FIX:C 0,06-0,40 UI/mL (>5% - <40%) | 0 |
| | | Moderada: 0,01-0,05 UI/mL (1-5%) | 1 |
| | | Grave: <0,01 UI/mL (<1%) | 3 |
| C_GRAV_EVW | Gravedad EVW (solo EVW; excluyentes) | Tipo 1 | 0 |
| | | Tipo 2 | 1 |
| | | Tipo 3 | 3 |
| C_HEMORR | Número de hemorragias | >2 hemorragias espontáneas al año que han requerido tratamiento | 4 |
| C_COMORB | Comorbilidades (**acumulables**, decisión 5.1) | Comorbilidades además de la patología de base (VIH, VHC, cáncer, ACV, ECV, DM, osteoporosis, enfermedad renal…) | 1 |
| | | Patología articular degenerativa | 2 |
| C_PSICO | Problemas psicológicos | Problemas de salud mental (ansiedad, depresión) | 3 |

### Farmacoterapéuticas (Tabla 3, M p. 15) · máx. 15

| Código | Variable | Opción | Puntos |
|---|---|---|---|
| T_AGENTE | Agente hemostásico | Terapia génica y/o cualquier otra terapia avanzada | **Prioridad 1 directa** (regla especial) |
| T_VIA | Vía de administración (excluyentes) | Subcutánea combinada con intravenosa | 1 |
| | | Intravenosa | 2 |
| T_CAMBIOS | Cambios en el régimen desde la última dispensación (**acumulables**, decisión 5.1) | Cambio de dosis o pauta posológica | 2 |
| | | Dosis adicionales o modificaciones puntuales de pauta | 3 |
| T_DOMIC | Dispensación domiciliaria | No acude presencialmente; recibe la medicación a domicilio u oficina de farmacia | 1 |
| T_REGIMEN | Régimen | Profilaxis (primaria, secundaria, terciaria) | 3 |
| T_ADH | Falta de adherencia | Adherencia y/o persistencia subóptima (registro de dispensación + HCE) — **juicio profesional Sí/No** (decisión 5.3) | 4 |

### Sociosanitarias (Tabla 4, M p. 16) · máx. 16 (15 sin calidad de vida)

| Código | Variable | Opción | Puntos |
|---|---|---|---|
| S_SOCIO | Entorno familiar y situación socioeconómica | Condiciones socioeconómicas desfavorables (definición literal M p. 16) | 3 |
| S_ESTILO | Estilo de vida (**acumulables**, decisión 5.1) | Actividad física intensa | 1 |
| | | ≥1 factor de riesgo cardiovascular (HTA, obesidad, tabaquismo…) | 2 |
| S_ACCESO | Dificultades de acceso a la atención hospitalaria | Sí | 2 |
| S_CONOC | Nivel de conocimiento de la enfermedad | Conocimiento limitado | 3 |
| S_TRANS | Transición al régimen de adulto | En transición pediátrico → adulto | 4 |
| S_QOL | Calidad de vida | Baja calidad de vida — **juicio profesional Sí/No** a la vista del EQ-5D-3L (decisión 5.2) | 1 |

## 2. Niveles de prioridad (M p. 17, Figura 4)

- **Prioridad 1:** ≥28 puntos · **Prioridad 2:** 20-27 · **Prioridad 3:** ≤19.
- Cortes validados en el pretest (81 pacientes, 5 hospitales) **sin** la variable de calidad de vida (máx. 58). Con S_QOL el máximo es 59.
- Interpretación de límites: «28 puntos para el nivel de Prioridad 1» y «20 puntos para Prioridad 2» se leen como umbrales inclusivos (≥).

## 3. Reglas especiales (M pp. 17-18)

1. Terapia génica u otra terapia avanzada → Prioridad 1 con independencia de la puntuación.
2. Menores de 18 años → modelo pediátrico (no aplica en COAMO: criterio de inclusión ≥18).
3. El farmacéutico puede situar al paciente en un nivel **superior** por circunstancias particulares (M p. 18). La herramienta lo registra como ajuste profesional con motivo, sin alterar la puntuación calculada.

## 4. Actuaciones por prioridad (M pp. 18-25)

Tablas 5 (P3), 6 (P2) y 7 (P1), acumulativas, en tres ámbitos: seguimiento farmacoterapéutico, educación/formación/seguimiento del paciente y coordinación con el equipo asistencial. Texto literal a cargar como catálogo versionado. Periodicidad de valoración del modelo: P1 mensual, P2 semestral, P3 anual, y al inicio/cambio de tratamiento o ante cambios clínicos.

## 5. Decisiones del IP (Ramón Morillo-Verdugo, 2026-10-07)

1. **Opciones acumulables** en C_COMORB, T_CAMBIOS y S_ESTILO: es la única lectura que reproduce los máximos publicados (25, 15, 16). Resto de variables: opciones excluyentes.
2. **C_GRAV_HEM literal:** ingreso = 2; ambulatorio/domicilio = 3.
3. **S_QOL:** juicio profesional Sí/No, viendo el EQ-5D-3L basal. Advertencia: los cortes se validaron sin esta variable.
4. **T_ADH:** juicio profesional Sí/No; la herramienta muestra al lado el % de dispensaciones recogidas/previstas y el resultado de Morisky-Green.
5. **Reestratificación:** basal obligatoria (la que define la prioridad del análisis del estudio); reestratificaciones opcionales registradas aparte con motivo, sin sustituir la basal.
6. **Visita final:** 12 meses desde la basal de cada paciente, ventana ±1 mes (P p. 14).
7. **Cuestionarios asistidos:** permitidos, registrando si fueron autocumplimentados o asistidos y por quién.

## 6. Contradicciones protocolo ↔ modelo registradas

- Reestratificación: P p. 14 solo visita inicial; M p. 18 periódica → resuelto con decisión 5.5.
- Adherencia en seguimiento: P p. 12 (inicio y final) vs P p. 14 (inicial, seguimiento y final) → la tabla de P p. 14 se toma como referencia.
- Seguimiento: P p. 15 indica que P3 no tiene visita de seguimiento; M p. 18 fija valoración anual para P3 → coherentes en un estudio de 12 meses.
