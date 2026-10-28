import { Suspense } from "react";

import { Page } from "../../ui";
import SessionClient from "./SessionClient";

async function Resolved({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionClient id={id} />;
}

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Page><p className="text-muted">Cargando…</p></Page>}>
      <Resolved params={params} />
    </Suspense>
  );
}
