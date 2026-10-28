# DERMAPEX · Guía de la exportación de datos para investigación

Para el equipo investigador y los responsables del análisis estadístico. Formato `dermapex-export-2.0`.

## 1. Cómo exportar

1. **Dashboard** → elija el formato de los CSV:
   - **CSV estándar** (separador coma, decimal punto): para SPSS, R, Stata o Python. **Recomendado.**
   - **CSV Excel España** (separador punto y coma, decimal coma): para abrir el CSV con doble clic en un Excel configurado en español.
2. Pulse **Exportar datos**. Se descarga **un único ZIP**: `dermapex_export_<fecha>_<hora>.zip`.

**Alcance:** se exporta todo lo que su usuario puede ver. Un investigador ve su centro; coordinación ve todos los centros. El alcance real (centros incluidos) consta en `manifest.json`.

**Garantía de completitud:**
- Cada tabla se lee por páginas y se compara con el recuento exacto de la base de datos.
- Si falta una sola fila, si alguien modifica datos durante la exportación o si hay cualquier error, **la exportación se cancela y no se descarga nada**. En ese caso, repítala cuando nadie esté registrando datos.
- Antes de entregar el ZIP, cada CSV se relee y se compara celda a celda, y se comprueban las huellas del ZIP.

## 2. Contenido del ZIP

| Fichero | Qué es | Una fila = |
|---|---|---|
| `LEEME.txt` | Resumen del paquete | — |
| `manifest.json` | Fecha, versión, alcance, **recuento por tabla (BD frente a exportado)**, huella SHA-256 de cada fichero, columnas excluidas, incidencias y avisos | — |
| `diccionario_variables.csv` | **Diccionario de datos**: variable, etiqueta, definición, tipo, unidad, valores admitidos, instrumento, visita, origen, regla de cálculo, valores perdidos, formato SPSS | una variable |
| `analisis/long_visitas` | **Formato longitudinal**: datos de la visita, CMO, puntuaciones de cuestionarios, intervenciones y tratamientos vigentes | paciente × visita |
| `analisis/wide_pacientes` | **Formato transversal**: variables de cada visita con sufijo `_v0` (basal), `_v3`, `_v6`, `_v9`, `_v12` (meses); ítems de IEXPAC; cambios v12 − v0 | paciente |
| `analisis/cuestionarios_items` | **Respuestas individuales** de todos los cuestionarios | ítem de un cuestionario |
| `analisis/estratificaciones_cmo` | Estratificaciones CMO codificadas | estratificación |
| `analisis/medicacion_por_visita` | Tratamientos vigentes en la fecha de cada visita | tratamiento × visita |
| `analisis/incidencias_integridad` | Errores e inconsistencias detectados en la extracción | incidencia |
| `raw/*` | **Cada tabla tal como está almacenada** (13 tablas o vistas) | registro |
| `*.sps` | Sintaxis SPSS de importación, junto a cada CSV | — |
| `*_spss.csv` | Copia para SPSS cuando hay textos con saltos de línea (ver §4) | — |
| `dermapex_export.xlsx` | Todas las tablas en hojas, más diccionario y metadatos | — |
| `dermapex_export.json` | Todas las tablas con los valores originales | — |

## 3. Reglas de los datos

- **Paciente:** se identifica por `study_code`, el código seudonimizado del estudio. Es **estable entre extracciones** y permite enlazar ficheros de fechas distintas. Los demás registros se identifican por su UUID.
- **Valores perdidos:** celda vacía = dato no registrado. **Nunca se convierte en 0.** Un 0 es un 0 registrado.
- **Fechas:**
  - Las fechas clínicas van como `AAAA-MM-DD`, sin hora ni zona horaria.
  - `created_at` y `updated_at` son la fecha y hora (UTC) de introducción del dato, **no** la fecha clínica.
- **Booleanos:** 1 = sí, 0 = no, vacío = no consta.
- **Textos:** se exportan exactamente como están almacenados, incluidos saltos de línea, comillas, tildes y emoji.
- **Visita en el formato WIDE:** se toma la visita **no cancelada** de cada tipo. Si solo existe una cancelada, `estado_vX = cancelled` y el resto de variables de esa visita quedan vacías.
- **«No registrado» frente a «sin intervención»:** `registro_intervenciones` distingue `sin_registro` de `sin_intervencion`.
- **Puntuaciones de cuestionarios:** se recalculan a partir de las respuestas originales con el algoritmo que figura en `manifest.json`. **Las reglas de IEXPAC, EVASAF, Morisky-Green, EQ-5D-5L y PAM-10 son provisionales** hasta validarlas con los manuales oficiales; las respuestas individuales permiten recalcularlas.

## 4. Abrir en SPSS

1. Descomprima el ZIP.
2. Abra el `.sps` del conjunto que necesite, por ejemplo `analisis/wide_pacientes.sps`.
3. Si SPSS no está trabajando en esa carpeta, ajuste la ruta con `CD 'ruta'` y ejecute el `.sps`. Se importan tipos, formatos, etiquetas de variable y de valores.
4. Para guardar en formato SPSS, ejecute la línea `SAVE OUTFILE` comentada al final del `.sps`.

Limitaciones del formato SPSS (no de los datos):
- SPSS **no admite saltos de línea** dentro de un campo. Cuando un conjunto los tiene (notas, observaciones), el `.sps` lee una copia `*_spss.csv` en la que el salto de línea está escrito como `\n` y la barra invertida como `\\`. El valor exacto está en el CSV sin sufijo.
- SPSS **elimina los espacios al final** de los textos.

Esta ruta de importación está **verificada con GNU PSPP** en cada cambio del código (CI `export`). La verificación con **IBM SPSS** está pendiente (ver el informe de validación).

## 5. Abrir en Excel, R o Stata

- **Excel:** abra `dermapex_export.xlsx`. Las fechas van como texto `AAAA-MM-DD`, para evitar desfases y conversiones automáticas.
- **R:**

  ```r
  readr::read_csv("analisis/wide_pacientes.csv", na = "")
  ```

  Con el formato español, use `read_csv2`.
- **Stata:**

  ```stata
  import delimited "analisis/wide_pacientes.csv", encoding(utf8) varnames(1) clear
  ```

## 6. Comprobar que un paquete no se ha alterado

`manifest.json → files` contiene la huella SHA-256 de cada fichero. Para comprobarla:

```bash
sha256sum analisis/wide_pacientes.csv
```

En Windows:

```powershell
certutil -hashfile <fichero> SHA256
```

## 7. Columnas que no se exportan, y por qué

| Columnas | Motivo |
|---|---|
| Identificadores de profesionales (`created_by`, `delivered_by`…) | No son variables del estudio; constan en `audit_log` |
| `patient_medications.selected_source_payload` | Copia técnica del catálogo, no dato clínico |
| Nombre y ruta de los ficheros PDF | Pueden contener identificadores directos del paciente. Los PDF no se exportan |
| `cmo_scores.factors` y `recommendations` | La estratificación se exporta desde la vista que aplica el enmascaramiento por cohorte |

La lista está también en `manifest.json → excluded_columns`.

## 8. Protección de datos

- El paquete contiene **datos seudonimizados de salud**. Guárdelo en ubicaciones institucionales cifradas, no lo envíe por correo sin cifrar y elimínelo cuando deje de necesitarlo.
- `study_code`, el centro, la edad, el sexo y las fechas exactas son **cuasi-identificadores** en un estudio pequeño. Para compartir fuera del equipo investigador, valore con el delegado de protección de datos agregar edades o fechas, o sustituir las fechas por días desde la inclusión (`dias_desde_inclusion`).
- **CSV y fórmulas de Excel:** un texto que empiece por `=`, `+`, `-` o `@` puede interpretarse como fórmula si el CSV se abre con doble clic en Excel. No se modifica el dato. Use el `.xlsx`, donde se guarda como texto, o importe el CSV indicando que las columnas son texto.
