import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

type ClientPrincipal = {
  identityProvider?: string;
  userId?: string;
  userDetails?: string;
  userRoles?: string[];
};

function decodeClientPrincipal(req: HttpRequest): ClientPrincipal | null {
  const header = req.headers.get("x-ms-client-principal");
  if (!header) return null;

  try {
    const decoded = Buffer.from(header, "base64").toString("utf8");
    return JSON.parse(decoded) as ClientPrincipal;
  } catch {
    return null;
  }
}

app.http("whoami", {
  methods: ["GET"],
  authLevel: "anonymous", // SWA handles auth; this endpoint trusts SWA header
  route: "whoami",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const principal = decodeClientPrincipal(req);

    if (!principal) {
      return { status: 401, jsonBody: { error: "Unauthorized: missing client principal." } };
    }

  return {
    status: 200,
    jsonBody: {
      buildSource: "repo-api",
      identityProvider: principal.identityProvider ?? null,
      userId: principal.userId ?? null,
      userDetails: principal.userDetails ?? null,
      userRoles: principal.userRoles ?? []
  }
};
