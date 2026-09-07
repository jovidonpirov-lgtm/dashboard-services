import { NextResponse } from "next/server";
import { isAdmin, sameOrigin } from "@/lib/auth";
import { readStore, saveStore } from "@/lib/storage";
import { registrySaveSchema, registryStore } from "@/lib/model";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await isAdmin()))
    return NextResponse.json(
      { error: "Войдите как администратор." },
      { status: 401 },
    );
  try {
    return NextResponse.json(registryStore(await readStore()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Не удалось загрузить данные. Проверьте подключение к базе данных.",
      },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  if (!(await isAdmin()))
    return NextResponse.json(
      { error: "Сессия истекла. Войдите снова." },
      { status: 401 },
    );
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 2_000_000)
      return NextResponse.json(
        { error: "Объём отчёта превышает 2 МБ." },
        { status: 413 },
      );
    const parsed = registrySaveSchema.safeParse(JSON.parse(text));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    return NextResponse.json(registryStore(await saveStore(parsed.data)));
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT")
      return NextResponse.json(
        {
          error:
            "Данные изменились в другой вкладке. Закройте редактор, обновите страницу и повторите изменения.",
        },
        { status: 409 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Некорректный запрос." },
        { status: 400 },
      );
    return NextResponse.json(
      {
        error:
          "Не удалось сохранить отчёт. Ваши изменения остались в редакторе. Попробуйте ещё раз.",
      },
      { status: 503 },
    );
  }
}
