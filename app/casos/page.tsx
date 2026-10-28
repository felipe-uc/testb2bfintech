import { Badge, Card, CardTitle, LinkButton, Page, PageHeader } from "../ui";

/**
 * Credenciales públicas del sandbox de Fintoc (docs.fintoc.com, "Test your
 * integration"). Son datos de prueba publicados por el proveedor, no de
 * personas (CLAUDE.md 12.3).
 */
const USERS = [
  { rut: "41614850-3", result: "Flujo normal (login y autorización)" },
  { rut: "40427672-7", result: "Flujo normal (login y autorización)" },
  { rut: "41579263-8", result: "Flujo normal (login y autorización)" },
  { rut: "41885440-5", result: "Solo para simular un pago que queda en pending" },
];

const ACCOUNTS = [
  { account: "422159212", mfa: "App móvil", code: "–", result: "Éxito", tone: "ok" },
  { account: "813990168", mfa: "Dispositivo de seguridad", code: "000000", result: "Éxito", tone: "ok" },
  { account: "170086177", mfa: "SMS", code: "0000", result: "Éxito", tone: "ok" },
  { account: "746326042", mfa: "Tarjeta de coordenadas", code: "00 · 00 · 00", result: "Éxito", tone: "ok" },
  { account: "4420245701", mfa: "Tarjeta de coordenadas", code: "00 · 00 · 00", result: "Éxito", tone: "ok" },
  { account: "5233137377", mfa: "App móvil", code: "–", result: "Falla", tone: "bad" },
  { account: "5233138811", mfa: "App móvil", code: "–", result: "Falla: límite de monto para contacto nuevo", tone: "bad" },
  { account: "512347890123", mfa: "App móvil", code: "–", result: "Pendiente, luego éxito", tone: "warn" },
  { account: "983214567890", mfa: "App móvil", code: "–", result: "Pendiente, luego falla", tone: "warn" },
] as const;

export default function CasesPage() {
  return (
    <Page wide>
      <PageHeader eyebrow="Banco de prueba" title="Casos a probar">
        <p>
          El sandbox decide el resultado según el usuario y la cuenta de origen que elijas. Elige cualquier banco en
          el widget. La clave de estos usuarios está en la{" "}
          <a
            href="https://docs.fintoc.com/docs/payment-initiation-test-your-integration"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            documentación pública del proveedor
          </a>
          ; no se muestra aquí.
        </p>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardTitle hint="paso 1">Usuario (RUT)</CardTitle>
          <table className="w-full text-sm">
            <tbody>
              {USERS.map((u) => (
                <tr key={u.rut} className="border-t border-line">
                  <td className="py-2 pr-3 font-mono">{u.rut}</td>
                  <td className="py-2 text-muted">{u.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardTitle hint="paso 2">Cuenta de origen y resultado</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 pr-3 font-medium">Cuenta</th>
                  <th className="pb-2 pr-3 font-medium">Confirmación</th>
                  <th className="pb-2 pr-3 font-medium">Código</th>
                  <th className="pb-2 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {ACCOUNTS.map((a) => (
                  <tr key={a.account} className="border-t border-line">
                    <td className="py-2 pr-3 font-mono">{a.account}</td>
                    <td className="py-2 pr-3">{a.mfa}</td>
                    <td className="py-2 pr-3 font-mono text-muted">{a.code}</td>
                    <td className="py-2"><Badge tone={a.tone}>{a.result}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <p className="text-xs text-muted">
        Fuente: documentación pública del proveedor, &quot;Test your integration&quot;. Cada escenario genera una sesión
        nueva y un diagnóstico distinto, visible en su línea de tiempo y en las métricas.
      </p>

      <div>
        <LinkButton href="/">Probar un escenario</LinkButton>
      </div>
    </Page>
  );
}
