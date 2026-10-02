import { NextResponse } from "next/server";

/** Bentuk respons standar: { ok: true, data } / { ok: false, error: { code, message } } */

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(code: string, message: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Ubah error tak terduga menjadi respons 500 yang aman (tanpa bocor detail). */
export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) return fail(e.code, e.message, e.status);
  console.error("[api] unexpected error:", e);
  return fail("INTERNAL_ERROR", "Terjadi kesalahan pada server.", 500);
}

/** Helper paginasi query string: ?page=&limit= */
export function getPagination(searchParams: URLSearchParams): { page: number; limit: number; skip: number } {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export function paged<T>(items: T[], total: number, page: number, limit: number) {
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}
