import { generateJson } from "@/lib/gemini/client";
import { buildMetaPrompt, type MetaOutput } from "@/lib/gemini/prompts";

export const TITLE_LIMIT = 60;
export const DESCRIPTION_LIMIT = 150;

export interface MetaVariationChecked {
  title: string;
  description: string;
  titleLength: number;
  descriptionLength: number;
  valid: boolean;
}

function check(variations: MetaOutput["variations"]): MetaVariationChecked[] {
  return variations.map((v) => {
    const tl = [...v.title].length;
    const dl = [...v.description].length;
    return { ...v, titleLength: tl, descriptionLength: dl, valid: tl <= TITLE_LIMIT && dl <= DESCRIPTION_LIMIT };
  });
}

/**
 * Generate 3 variasi meta untuk satu keyword.
 * Jika hasil melebihi batas editorial, dilakukan SATU retry terkontrol.
 * Tidak pernah memotong string secara membabi buta — hasil tak valid ditandai.
 */
export async function generateMetaForKeyword(params: {
  userId: string;
  projectId?: string;
  keyword: string;
  audience?: string;
  businessName?: string;
  pageUrl?: string;
  style?: string;
}): Promise<{ variations: MetaVariationChecked[]; retried: boolean }> {
  const promptOpts = {
    userId: params.userId,
    projectId: params.projectId,
    keyword: params.keyword,
    audience: params.audience,
    businessName: params.businessName,
    pageUrl: params.pageUrl,
    style: params.style,
  };
  const first = await generateJson({ tool: "meta_generation", ...buildMetaPrompt(promptOpts) });
  let checked = check(first.data.variations);
  let retried = false;

  if (checked.some((v) => !v.valid)) {
    retried = true;
    const retry = await generateJson({
      tool: "meta_generation",
      ...buildMetaPrompt(promptOpts),
      prompt:
        buildMetaPrompt(promptOpts).prompt +
        `\n\nHasil sebelumnya melewati batas karakter. Title harus <= ${TITLE_LIMIT} karakter, description <= ${DESCRIPTION_LIMIT} karakter. Tulis ulang lebih ringkas tanpa memotong kata di tengah.`,
    });
    checked = check(retry.data.variations);
  }
  return { variations: checked, retried };
}
