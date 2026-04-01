import path from "node:path";

import type { SpaceInfo } from "./types.js";

export const DEFAULT_OUTPUT_TEMPLATE = "(%(creator_name)s)%(title)s-%(id)s";

const TEMPLATE_FIELD_MAP = {
  title: "title",
  id: "id",
  start_date: "startDate",
  creator_name: "creatorName",
  creator_screen_name: "creatorScreenName",
  url: "url",
  creator_id: "creatorId",
} as const;

export function sterilizeFilename(value: string): string {
  let base = value;
  let extension = "";
  const extname = path.extname(value);

  if (extname) {
    extension = extname;
    base = value.slice(0, -extname.length);
  }

  base = base.replace(/\0/g, "");
  if (base.startsWith(".")) {
    base = `_${base}`;
  }

  base = base.replace(/[\\/:*?"<>|]/g, "_").trim();

  const invalidFilenames = new Set([
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ]);

  if (invalidFilenames.has(base)) {
    base = `_${base}`;
  }

  return `${base}${extension}`;
}

export function formatOutputPath(
  template: string | undefined,
  space?: Partial<SpaceInfo>,
): string {
  const actualTemplate = template ?? DEFAULT_OUTPUT_TEMPLATE;
  const templateBasename = path.basename(actualTemplate);
  const templateDir = path.dirname(actualTemplate);
  const renderedDir =
    templateDir === "."
      ? ""
      : renderTemplate(templateDir, space ?? { id: "", title: "" });
  const renderedBase = renderTemplate(templateBasename, space ?? {});
  const safeBase = sterilizeFilename(renderedBase);

  if (safeBase.trim()) {
    return renderedDir ? path.join(renderedDir, safeBase) : safeBase;
  }

  const fallback =
    sterilizeFilename(space?.id || "") ||
    sterilizeFilename(space?.title || "") ||
    "twitter-space";
  return renderedDir ? path.join(renderedDir, fallback) : fallback;
}

function renderTemplate(
  template: string,
  space: Partial<SpaceInfo>,
): string {
  return template.replace(/%\(([^)]+)\)s/g, (_match, rawField: string) => {
    const mappedField =
      TEMPLATE_FIELD_MAP[rawField as keyof typeof TEMPLATE_FIELD_MAP];
    if (!mappedField) {
      return "";
    }

    const value = space[mappedField];
    return typeof value === "string" ? value : "";
  });
}
