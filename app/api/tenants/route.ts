import { NextResponse } from "next/server";

type ClientPrincipal = {
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

function normalizeRoles(roles: string[] | undefined): string[] {
  return (roles ?? []).map(r => (r ?? "").trim().toLowerCase()).filter(Boolean);
}

function getAuthorizedShortcodes(roles: string[]) {
  const isAdmin = roles.includes("admin");
  const shortcodes = new Set<string>();

  for (const role of roles) {
    if (role.startsWith("tenant-") && role.length > 7) {
      shortcodes.add(role.substring(7).toUpperCase());
    }
  }

  return { isAdmin, shortcodes };
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

  const roles = normalizeRoles(principal.userRoles);
  const { isAdmin, shortcodes } = getAuthorizedShortcodes(roles);

  if (!isAdmin && shortcodes.size === 0) {
    return NextResponse.json(
      { error: "Forbidden: no tenant access roles assigned." },
      { status: 403 }
    );
  }

  // v1 placeholder until we wire Table Storage:
  return NextResponse.json(
    {
      buildSource: "next-route",
      user: principal.userDetails ?? null,
      roles,
      authorizedTenantShortcodes: isAdmin ? ["*"] : Array.from(shortcodes).sort()
    },
    { status: 200 }
  );
}

