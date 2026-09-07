import { NextResponse } from "next/server";
import {
  configured,
  cookieName,
  cookieOptions,
  isAdmin,
  sameOrigin,
  sessionToken,
  validPassword,
} from "@/lib/auth";
import { allowLogin } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(
    { admin: await isAdmin(), configured: configured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  if (!configured())
    return NextResponse.json(
      {
        error:
          "Вход ещё не настроен. Укажите пароль администратора и ключ сессии на сервере.",
      },
      { status: 503 },
    );
  try {
    const body = await request.text();
    if (body.length > 2048)
      return NextResponse.json(
        { error: "Слишком длинный запрос." },
        { status: 413 },
      );
    const { password } = JSON.parse(body);
    if (typeof password !== "string")
      return NextResponse.json({ error: "Введите пароль." }, { status: 400 });
    if (!(await allowLogin()))
      return NextResponse.json(
        { error: "Слишком много попыток входа. Повторите через 15 минут." },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    if (!validPassword(password))
      return NextResponse.json({ error: "Неверный пароль." }, { status: 401 });
    const response = NextResponse.json({ admin: true });
    response.cookies.set(cookieName, sessionToken(), cookieOptions);
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof SyntaxError
            ? "Некорректный запрос."
            : "Не удалось войти. Проверьте подключение к базе данных.",
      },
      { status: error instanceof SyntaxError ? 400 : 503 },
    );
  }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "Недопустимый источник запроса." },
      { status: 403 },
    );
  const response = NextResponse.json({ admin: false });
  response.cookies.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
