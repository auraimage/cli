export interface Project {
  id: string;
  projectName: string;
  tier?: string;
}

async function authedJson<T>(url: string, token: string, init: RequestInit = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {})
    }
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function listProjects(apiUrl: string, token: string): Promise<Project[]> {
  const data = await authedJson<{ projects: Project[] }>(`${apiUrl}/v1/projects`, token);
  return data.projects;
}

export async function createProject(apiUrl: string, token: string, projectName: string): Promise<Project> {
  return authedJson<Project>(`${apiUrl}/v1/projects`, token, {
    method: 'POST',
    body: JSON.stringify({ projectName })
  });
}
