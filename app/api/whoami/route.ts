import { NextResponse } from "next/server";

type ClientPrincipal = {
  identityProvider?: string;
  userId?: string;
  userDetails?: string;
  userRoles?: string[];
};

function decodeClientPrincipal(header: string | null): ClientPrincipal | null {
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(decoded) as ClientPrincipal;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const principalHeader = req.headers.get("x-ms-client-principal");
  const principal = decodeClientPrincipal(principalHeader);

  if (!principal) {
    return NextResponse.json(
      { error: "Unauthorized: missing client principal." },
      { status: 401 }
    );
  }

  return NextResponse.json(
    {
      buildSource: "next-route",
      identityProvider: principal.identityProvider ?? null,
      userId: principal.userId ?? null,
      userDetails: principal.userDetails ?? null,
      userRoles: principal.userRoles ?? []
    },
    { status: 200 }
  );
}

