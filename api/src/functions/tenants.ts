import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { TableClient, odata } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

type ClientPrincipal = {
  userDetails?: string;
  userRoles?: string[];
};

type TenantEntity = {
  rowKey: string;
  CustomerName?: string;
  CustomerTenantId?: string;
  DefaultDomain?: string;
  Enabled?: boolean;
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

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function fetchTenants(): Promise<TenantEntity[]> {
  const account = getEnv("STORAGE_ACCOUNT_NAME");   // stmspadminportaldev01
  const table = getEnv("TENANTS_TABLE_NAME");       // Tenants
  const endpoint = `https://${account}.table.core.windows.net`;

  const client = new TableClient(endpoint, table, new DefaultAzureCredential());

  const items: TenantEntity[] = [];
  const filter = odata`PartitionKey eq ${"tenant"}`;

  for await (const e of client.listEntities<any>({ queryOptions: { filter } })) {
    items.push({
      rowKey: e.rowKey ?? e.RowKey,
      CustomerName: e.CustomerName,
      CustomerTenantId: e.CustomerTenantId,
      DefaultDomain: e.DefaultDomain,
      Enabled: e.Enabled
    });
  }
  return items;
}

app.http("tenants", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "tenants",
  handler: async (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const principal = decodeClientPrincipal(req);
    if (!principal) {
      return { status: 401, jsonBody: { error: "Unauthorized: missing client principal." } };
    }

    const roles = normalizeRoles(principal.userRoles);
    const { isAdmin, shortcodes } = getAuthorizedShortcodes(roles);

    if (!isAdmin && shortcodes.size === 0) {
      return { status: 403, jsonBody: { error: "Forbidden: no tenant access roles assigned." } };
    }

    const all = await fetchTenants();

    const enabledOnly = all.filter(t => String(t.Enabled).toLowerCase() === "true");

    const authorized = isAdmin
      ? enabledOnly
      : enabledOnly.filter(t => shortcodes.has((t.rowKey ?? "").toUpperCase()));

    const response = authorized
      .sort((a, b) => (a.CustomerName ?? "").localeCompare(b.CustomerName ?? ""))
      .map(t => ({
        shortcode: t.rowKey,
        customerName: t.CustomerName,
        customerTenantId: t.CustomerTenantId,
        defaultDomain: t.DefaultDomain,
        enabled: t.Enabled === true
      }));

    context.log(`tenants: user=${principal.userDetails} roles=${roles.join(",")} returned=${response.length}`);

    return { status: 200, jsonBody: { tenants: response } };
  }
});
