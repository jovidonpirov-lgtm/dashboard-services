import { NextResponse } from "next/server";
import { isAdmin, sameOrigin } from "@/lib/auth";
import { listFiles, prepareUpload } from "@/lib/files";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return NextResponse.json(
      await listFiles(
        new URL(request.url).searchParams.get("serviceId") || undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Не удалось загрузить список файлов." },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
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
  try {
    const text = await request.text();
    if (text.length > 4096)
      return NextResponse.json(
        { error: "Слишком большой запрос." },
        { status: 413 },
      );
    return NextResponse.json(await prepareUpload(JSON.parse(text)));
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? e.issues[0].message
            : e instanceof Error &&
                /услуг|файл|Лимит|сохраните/i.test(e.message)
              ? e.message
              : "Не удалось подготовить загрузку.",
      },
      { status: 400 },
    );
  }
}
