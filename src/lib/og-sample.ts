/**
 * Sample values for the example Render URL a push prints. Text variables get
 * their declared default, or a readable stand-in derived from the name. An
 * image slot is a project-relative serve path, so there is no plausible
 * stand-in: it is filled only from a default, and a slot without one is
 * reported so the caller can say what to add.
 */

export function titleCase(variableName: string): string {
  return variableName
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function sampleValues(summary: {
  variables: Record<string, 'text' | 'image'>;
  defaults: Record<string, string>;
}): { values: Record<string, string>; missingSlots: string[] } {
  const values: Record<string, string> = {};
  const missingSlots: string[] = [];
  for (const name of Object.keys(summary.variables).sort()) {
    // Own-property only: 'constructor' and 'toString' both match the variable
    // grammar, and an inherited hit would put a function where a string belongs.
    const declared = Object.hasOwn(summary.defaults, name) ? summary.defaults[name] : undefined;
    if (declared !== undefined) {
      values[name] = declared;
      continue;
    }
    if (summary.variables[name] === 'image') {
      missingSlots.push(name);
      continue;
    }
    values[name] = titleCase(name);
  }
  return { values, missingSlots };
}

/** Appends `values` to `url` as a sorted, encoded query. `url` is the Render URL the edge returned. */
export function withQuery(url: string, values: Record<string, string>): string {
  const pairs = Object.keys(values)
    .sort()
    .map((name) => `${name}=${encodeURIComponent(values[name]!)}`);
  return pairs.length === 0 ? url : `${url}?${pairs.join('&')}`;
}
