export async function fhirFetchRaw(path: string, accessToken: string) {
  const res = await fetch(`${process.env.EPIC_FHIR_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/fhir+json",
    },
  });

  const contentType = res.headers.get("content-type") ?? "";
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch {
    // ignore
  }

  let bodyJson: unknown = undefined;
  if (contentType.includes("json")) {
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
      bodyJson = undefined;
    }
  }

  const trimmedText = bodyText ? bodyText.slice(0, 800) : "";

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    contentType,
    bodyText: trimmedText,
    bodyJson,
  };
}

export async function fhirFetch(path: string, accessToken: string) {
  const raw = await fhirFetchRaw(path, accessToken);
  if (!raw.ok) {
    throw new Error(
      `FHIR error: ${raw.status} ${raw.statusText} (${raw.contentType}) - ${raw.bodyText} (${path})`
    );
  }

  return raw.bodyJson ?? {};
}

