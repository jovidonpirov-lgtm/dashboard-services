import { NextResponse } from "next/server";
import { isAdmin, sameOrigin } from "@/lib/auth";
import { completeUpload, deleteFile, fileUrl } from "@/lib/files";
import { z } from "zod";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new NextResponse(null, { status: 404 });
  try {
    const url = await fileUrl(
      id,
      new URL(request.url).searchParams.get("download") === "1",
    );
    return url
      ? NextResponse.redirect(url, {
          status: 302,
          headers: {
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer",
          },
        })
      : new NextResponse(null, { status: 404 });
  } catch {
    return NextResponse.json(
      { error: "Не удалось открыть файл." },
      { status: 503 },
    );
  }
}
async function mutate(request: Request, context: Context, remove: boolean) {
  if (!(await isAdmin()))
    return NextResponse.json(
      { error: "Войдите как администратор." },
      { status: 401 },
    );
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return new NextResponse(null, { status: 404 });
  try {
    if (remove) await deleteFile(id);
    else await completeUpload(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && /формат|размер|найдена/.test(e.message)
            ? e.message
            : "Не удалось завершить операцию с файлом. Повторите попытку.",
      },
      { status: 400 },
    );
  }
}
export const POST = (r: Request, c: Context) => mutate(r, c, false);
export const DELETE = (r: Request, c: Context) => mutate(r, c, true);
