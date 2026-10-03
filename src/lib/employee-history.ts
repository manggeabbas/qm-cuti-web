/** Pencatatan histori perubahan karyawan berversion (PRD §1A.14). */
import db from "./db";
import { toISODate } from "./dates";

interface TrackedChange {
  field: string;
  fieldLabel: string;
  oldValue: string | null;
  oldLabel: string | null;
  newValue: string | null;
  newLabel: string | null;
}

const FK_LABELS: Record<string, { label: string; model: "position" | "team" | "section" | "division" | "department" | "employee" }> = {
  positionId: { label: "Jabatan", model: "position" },
  teamId: { label: "Regu", model: "team" },
  sectionId: { label: "Seksi", model: "section" },
  divisionId: { label: "Divisi", model: "division" },
  departmentId: { label: "Departemen", model: "department" },
  supervisorId: { label: "Atasan", model: "employee" },
};

async function resolveLabel(
  model: "position" | "team" | "section" | "division" | "department" | "employee",
  id: number | null,
): Promise<string | null> {
  if (id == null) return null;
  try {
    if (model === "employee") {
      const e = await db.employee.findUnique({ where: { id }, select: { name: true, nik: true } });
      return e ? `${e.name} (${e.nik})` : `#${id}`;
    }
    const row = await (db[model] as never as { findUnique: (a: unknown) => Promise<{ name: string } | null> }).findUnique({
      where: { id },
      select: { name: true },
    });
    return row?.name ?? `#${id}`;
  } catch {
    return `#${id}`;
  }
}

/**
 * Bandingkan data lama vs body update; simpan baris histori untuk tiap
 * field yang berubah. `body` = hasil parse zod (partial).
 */
export async function recordEmployeeHistory(
  employeeId: number,
  existing: Record<string, unknown>,
  body: Record<string, unknown>,
  changedBy: number | null,
  effectiveDate?: Date | null,
): Promise<number> {
  const changes: TrackedChange[] = [];

  for (const [field, cfg] of Object.entries(FK_LABELS)) {
    const next = body[field] as number | null | undefined;
    if (next === undefined) continue;
    const prev = existing[field] as number | null;
    if ((prev ?? null) === (next ?? null)) continue;
    const [oldLabel, newLabel] = await Promise.all([
      resolveLabel(cfg.model, prev),
      resolveLabel(cfg.model, next),
    ]);
    changes.push({
      field, fieldLabel: cfg.label,
      oldValue: prev != null ? String(prev) : null, oldLabel,
      newValue: next != null ? String(next) : null, newLabel,
    });
  }

  // field sederhana
  const simple: Record<string, string> = {
    status: "Status", level: "Level", name: "Nama", nik: "NIK",
  };
  for (const [field, label] of Object.entries(simple)) {
    const next = body[field] as string | undefined;
    if (next === undefined) continue;
    const prev = existing[field] as string | null;
    if ((prev ?? null) === (next ?? null)) continue;
    changes.push({
      field, fieldLabel: label,
      oldValue: prev, oldLabel: prev,
      newValue: next, newLabel: next,
    });
  }

  if (body.effectiveDate !== undefined) {
    const nextD = body.effectiveDate as string;
    const prevD = existing.effectiveDate ? toISODate(existing.effectiveDate as Date) : null;
    if (prevD !== nextD) {
      changes.push({
        field: "effectiveDate", fieldLabel: "Tanggal Efektif",
        oldValue: prevD, oldLabel: prevD, newValue: nextD, newLabel: nextD,
      });
    }
  }

  if (changes.length === 0) return 0;
  await db.employeeHistory.createMany({
    data: changes.map((c) => ({
      employeeId,
      field: c.field,
      fieldLabel: c.fieldLabel,
      oldValue: c.oldValue,
      oldLabel: c.oldLabel,
      newValue: c.newValue,
      newLabel: c.newLabel,
      effectiveDate: effectiveDate ?? null,
      changedBy,
    })),
  });
  return changes.length;
}
