#!/usr/bin/env python3
"""Validación de la ruta CSV + sintaxis SPSS (.sps) de la exportación de DERMAPEX.

Para cada .sps de un paquete de exportación descomprimido:
  1. lo ejecuta con GNU PSPP (clon libre de SPSS) añadiendo SAVE OUTFILE;
  2. falla si PSPP informa de errores o avisos;
  3. lee el .sav resultante con pyreadstat y lo compara celda a celda con el CSV (leído con el
     módulo csv de Python, independiente del lector de la app): nº de casos, nº de variables,
     valores numéricos, fechas y textos.

Uso:  python3 scripts/validate-export-spss.py <carpeta_del_paquete> [<carpeta> ...]
Requisitos: pspp (apt install pspp) y pyreadstat (pip install pyreadstat).
Solo con datos sintéticos: no ejecutar sobre exportaciones con datos reales fuera del entorno seguro.
"""

import csv
import datetime
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

import pyreadstat

csv.field_size_limit(sys.maxsize)


def sps_meta(sps_text):
    """Delimitador, separador decimal y formato de cada variable según la propia sintaxis."""
    delimiter = ","
    decimal = "."
    formats = {}
    csv_name = None
    in_vars = False
    for line in sps_text.splitlines():
        s = line.strip()
        if s.startswith("/FILE="):
            csv_name = s.split("=", 1)[1].strip("'")
        if s.startswith("/DELIMITERS="):
            delimiter = s.split("=", 1)[1].strip("'")
        if s.startswith("SET DECIMAL="):
            decimal = "," if "COMMA" in s else "."
        if s == "/VARIABLES=":
            in_vars = True
            continue
        if in_vars:
            if s == ".":
                in_vars = False
                continue
            name, fmt = s.split()
            formats[name] = fmt
    return delimiter, decimal, formats, csv_name


def compare(csv_path, sav_path, delimiter, decimal, formats):
    with open(csv_path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.reader(fh, delimiter=delimiter))
    header, body = rows[0], rows[1:]
    df, meta = pyreadstat.read_sav(sav_path, disable_datetime_conversion=False)
    problems = []
    trailing_space_cells = 0
    if list(df.columns) != [h.lower() for h in header] and list(df.columns) != header:
        problems.append(f"variables distintas: {list(df.columns)[:5]}… frente a {header[:5]}…")
        return problems, trailing_space_cells
    if len(df) != len(body):
        problems.append(f"casos: CSV {len(body)} frente a SAV {len(df)}")
        return problems, trailing_space_cells
    for c_index, name in enumerate(header):
        fmt = formats[name]
        col = df.iloc[:, c_index]
        for r_index, row in enumerate(body):
            cell = row[c_index]
            value = col.iloc[r_index]
            if fmt.startswith("A"):
                got = "" if value is None or (isinstance(value, float) and math.isnan(value)) else str(value)
                # SPSS rellena las cadenas con espacios: los espacios finales no se conservan en el .sav.
                if got != cell:
                    if got == cell.rstrip(" ") :
                        trailing_space_cells += 1
                        continue
                    problems.append(f"{name} fila {r_index + 1}: texto {cell!r} → {got!r}")
            elif fmt == "SDATE10":
                if cell == "":
                    if not (value is None or (isinstance(value, float) and math.isnan(value)) or str(value) in ("NaT", "None")):
                        problems.append(f"{name} fila {r_index + 1}: vacío → {value!r}")
                else:
                    got = value.date().isoformat() if hasattr(value, "date") else str(value)[:10]
                    if got != cell:
                        problems.append(f"{name} fila {r_index + 1}: fecha {cell} → {got}")
            else:
                if cell == "":
                    if not (isinstance(value, float) and math.isnan(value)):
                        problems.append(f"{name} fila {r_index + 1}: vacío → {value!r} (¿vacío convertido en número?)")
                else:
                    expected = float(cell.replace(",", ".") if decimal == "," else cell)
                    if isinstance(value, float) and math.isnan(value):
                        problems.append(f"{name} fila {r_index + 1}: {cell} → perdido")
                    elif abs(float(value) - expected) > 1e-9 * max(1.0, abs(expected)):
                        problems.append(f"{name} fila {r_index + 1}: {cell} → {value}")
            if len(problems) > 20:
                return problems, trailing_space_cells
    return problems, trailing_space_cells


def unescape(text):
    out, i = [], 0
    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text) and text[i + 1] in "\\rn":
            out.append({"\\": "\\", "r": "\r", "n": "\n"}[text[i + 1]])
            i += 2
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


def check_escaped_copy(escaped_path, main_path, delimiter):
    """La copia para SPSS, al deshacer el escape, debe ser idéntica al CSV principal."""
    with open(escaped_path, encoding="utf-8-sig", newline="") as fh:
        esc = list(csv.reader(fh, delimiter=delimiter))
    with open(main_path, encoding="utf-8-sig", newline="") as fh:
        main = list(csv.reader(fh, delimiter=delimiter))
    if len(esc) != len(main):
        return [f"copia _spss: {len(esc)} filas frente a {len(main)}"]
    for r, (a, b) in enumerate(zip(esc, main)):
        if [unescape(x) for x in a] != b:
            return [f"copia _spss: la fila {r} no coincide con el CSV principal al deshacer el escape"]
    return []


def validate_folder(root):
    results = []
    for dirpath, _, files in os.walk(root):
        for f in sorted(files):
            if not f.endswith(".sps"):
                continue
            sps_path = os.path.join(dirpath, f)
            with open(sps_path, encoding="utf-8-sig") as fh:
                sps_text = fh.read()
            delimiter, decimal, formats, csv_name = sps_meta(sps_text)
            csv_path = os.path.join(dirpath, csv_name)
            escape_problems = []
            if csv_name.endswith("_spss.csv"):
                escape_problems = check_escaped_copy(csv_path, sps_path[:-4] + ".csv", delimiter)
            with tempfile.TemporaryDirectory() as tmp:
                shutil.copy(csv_path, os.path.join(tmp, os.path.basename(csv_path)))
                sav = os.path.join(tmp, "out.sav")
                runner = os.path.join(tmp, "run.sps")
                with open(runner, "w", encoding="utf-8") as fh:
                    fh.write(sps_text.replace("﻿", ""))
                    fh.write(f"SAVE OUTFILE='{sav}'.\n")
                proc = subprocess.run(["pspp", "-b", "-O", "format=txt", "-o", os.path.join(tmp, "out.txt"), runner], cwd=tmp, capture_output=True, text=True)
                log = proc.stdout + proc.stderr
                if os.path.exists(os.path.join(tmp, "out.txt")):
                    with open(os.path.join(tmp, "out.txt"), encoding="utf-8", errors="replace") as fh:
                        log += fh.read()
                pspp_issues = [l for l in log.splitlines() if "error" in l.lower() or "warning" in l.lower() or "aviso" in l.lower()]
                if proc.returncode != 0 or pspp_issues or not os.path.exists(sav):
                    results.append((os.path.relpath(sps_path, root), "FALLO", [f"PSPP rc={proc.returncode}"] + pspp_issues[:10]))
                    continue
                problems, trailing = compare(csv_path, sav, delimiter, decimal, formats)
                problems = escape_problems + problems
                note = [f"{trailing} celdas con espacios finales recortados por SPSS (limitación del formato)"] if trailing else []
                results.append((os.path.relpath(sps_path, root), "FALLO" if problems else "OK", problems + note))
    return results


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    failed = 0
    for root in sys.argv[1:]:
        print(f"== {root}")
        for path, status, detail in validate_folder(root):
            print(f"  [{status}] {path}")
            for d in detail:
                print(f"      {d}")
            failed += status != "OK"
    print(f"\nResultado: {'TODO CORRECTO' if failed == 0 else f'{failed} fichero(s) con fallos'}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
