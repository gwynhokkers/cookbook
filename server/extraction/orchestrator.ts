import { getWorkersAi } from '../utils/workersAi'
import type { AIClient } from '../utils/workersAi'
import type { ExtractedRecipe, ExtractionConfig, TranscribedRecipeText } from './types'
import {
  EXTRACTION_SEED,
  EXTRACTION_TEMPERATURE,
  EXTRACTION_TOP_P,
  RECIPE_RESPONSE_SCHEMA,
  REGION_INGREDIENTS_SCHEMA,
  REGION_METHOD_SCHEMA,
  REGION_TITLE_SCHEMA,
  TRANSCRIPTION_SCHEMA
} from './types'
import {
  normalizeErrorDetail,
  normalizeExtractedRecipe,
  parseIngredientLine,
  parseMethodTextToSteps,
  safeTrim,
  sanitizeTriRegionMethodText,
  splitLines
} from './normalize'
import { mergeTranscripts, parseTranscriptFromPlainText } from './transcript'
import {
  getExtractionQualityScore,
  hasMeaningfulExtraction,
  isMeaningfulStep,
  parseAiRecipeJson,
  pickStringField,
  runStructureModel,
  shouldRunCorrectionPass,
  structureFromTranscript
} from './structure'
import {
  ingredientsTextFromRegionParsed,
  normalizeImageMimeType,
  resolveRegionMethodText,
  resolveRegionTitleFromParsed,
  runVisionPrompt,
  runVisionTranscription,
  sanitizeRegionTitle
} from './vision'

export function getExtractionConfig(event?: { context?: unknown }): ExtractionConfig {
  const config = useRuntimeConfig(event as Parameters<typeof useRuntimeConfig>[0])
  const pipeline = String(config.extractionPipeline || 'two-stage').toLowerCase()
  return {
    useTwoStage: pipeline === 'two-stage',
    ocrModel: String(config.extractionOcrModel || '@cf/google/gemma-3-12b-it'),
    structureModel: String(
      config.extractionStructureModel || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
    )
  }
}

const acceptMetaLicenseIfNeeded = async (ai: AIClient, model: string) => {
  if (!model.includes('llama') && !model.includes('meta')) {
    return
  }
  try {
    await ai.run(model, { messages: [{ role: 'user', content: 'agree' }] })
  } catch {
    /* license may already be accepted */
  }
}

const FULL_PAGE_TRANSCRIBE_PROMPT = `Transcribe every character visible in this cookbook recipe image.
Preserve line breaks and list structure. Copy quantities and units exactly as printed.
Do not summarize, interpret, or output JSON.
Use these section headings in your response:
TITLE:
DESCRIPTION:
SERVINGS:
INGREDIENTS:
METHOD:
If a section is not visible, omit that heading.`

const REGION_TITLE_TRANSCRIBE_PROMPT = `Transcribe the recipe title and any short introduction visible in this image.
Include a separate line for servings or yield if visible (e.g. "Serves 4" or "Makes 6").
Preserve line breaks. Copy text exactly as printed. Do not summarize or output JSON.
Put the recipe name on the first line; any intro paragraph on following lines.`

const REGION_INGREDIENTS_TRANSCRIBE_PROMPT = `Transcribe only the ingredient lines visible in this image.
One ingredient per line. Copy quantities and units exactly as printed. Do not summarize or output JSON.`

const REGION_METHOD_TRANSCRIBE_PROMPT = `Transcribe only the cooking method / instructions visible in this image.
Preserve numbered steps (1. 2. 3.) if present. Use newlines between steps. Do not summarize or output JSON.`

const METHOD_ONLY_TRANSCRIBE_PROMPT = `Transcribe only the cooking method / instructions from this image (ignore ingredient lists).
On two-column layouts, read the method column. Preserve step numbering. Do not output JSON.`

async function finalizeTwoStageExtraction(
  transcript: TranscribedRecipeText,
  ai: AIClient,
  structureModel: string,
  emptyDetail: string
): Promise<ExtractedRecipe> {
  transcript.methodText = sanitizeTriRegionMethodText(String(transcript.methodText || ''))
  const deterministic = normalizeExtractedRecipe(structureFromTranscript(transcript))

  let structured: ExtractedRecipe | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const candidate = normalizeExtractedRecipe(await runStructureModel(ai, transcript, structureModel))
      if (hasMeaningfulExtraction(candidate)) {
        structured = candidate
        break
      }
      structured = candidate
    } catch {
      /* retry once */
    }
  }

  let normalized = deterministic
  if (structured) {
    const detScore = getExtractionQualityScore(deterministic)
    const strScore = getExtractionQualityScore(structured)
    if (strScore.total >= detScore.total && hasMeaningfulExtraction(structured)) {
      normalized = structured
    } else if (hasMeaningfulExtraction(structured) && !hasMeaningfulExtraction(deterministic)) {
      normalized = structured
    }
  }

  if (!hasMeaningfulExtraction(normalized)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'No extractable recipe content found in this image.',
      data: { detail: emptyDetail }
    })
  }

  return normalized
}

function rethrowExtractionError(error: unknown) {
  const err = error as {
    statusCode?: number
    statusMessage?: string
    message?: string
    data?: { detail?: string }
  }
  if (err?.statusCode === 422 || err?.statusCode === 429 || err?.statusCode === 402) {
    throw error
  }
  const originalErrorDetail = normalizeErrorDetail(
    err?.data?.detail || err?.statusMessage || err?.message,
    'Unknown error',
    4000
  )
  const statusCode = Number.isInteger(err?.statusCode) && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500
  throw createError({
    statusCode,
    statusMessage: 'Failed to extract recipe',
    data: { detail: originalErrorDetail }
  })
}

async function extractRecipeFromRegionImagesTwoStage(
  titleBase64: string,
  ingredientsBase64: string,
  methodBase64: string,
  event: Parameters<typeof getExtractionConfig>[0],
  titleMime?: string,
  ingredientsMime?: string,
  methodMime?: string
): Promise<ExtractedRecipe> {
  const cfg = getExtractionConfig(event)
  const ai = await getWorkersAi(event).client()
  const titleUrl = `data:${normalizeImageMimeType(titleMime)};base64,${titleBase64}`
  const ingredientsUrl = `data:${normalizeImageMimeType(ingredientsMime)};base64,${ingredientsBase64}`
  const methodUrl = `data:${normalizeImageMimeType(methodMime)};base64,${methodBase64}`

  await acceptMetaLicenseIfNeeded(ai, cfg.ocrModel)

  const transcribeRegion = async (
    prompt: string,
    imageUrl: string,
    region: 'title' | 'ingredients' | 'method' | 'full',
    maxTokens: number
  ) => {
    let text = await runVisionTranscription(ai, cfg.ocrModel, prompt, imageUrl, maxTokens)
    if (!text.trim()) {
      text = await runVisionTranscription(ai, cfg.ocrModel, prompt, imageUrl, maxTokens)
    }
    return parseTranscriptFromPlainText(text, region)
  }

  try {
    const [titlePart, ingredientsPart, methodPart] = await Promise.all([
      transcribeRegion(REGION_TITLE_TRANSCRIBE_PROMPT, titleUrl, 'title', 2000),
      transcribeRegion(REGION_INGREDIENTS_TRANSCRIBE_PROMPT, ingredientsUrl, 'ingredients', 2400),
      transcribeRegion(REGION_METHOD_TRANSCRIBE_PROMPT, methodUrl, 'method', 2600)
    ])

    let transcript = mergeTranscripts(titlePart, ingredientsPart, methodPart)
    let title = safeTrim(transcript.title)
    if (/^(recipe information|ingredients?|method|instructions?)$/i.test(title)) {
      transcript.title = ''
    }

    if (!safeTrim(transcript.methodText)) {
      const methodRetryText = await runVisionTranscription(
        ai,
        cfg.ocrModel,
        REGION_METHOD_TRANSCRIBE_PROMPT,
        methodUrl,
        2600
      )
      if (methodRetryText.trim()) {
        transcript = mergeTranscripts(transcript, parseTranscriptFromPlainText(methodRetryText, 'method'))
      }
    }

    return await finalizeTwoStageExtraction(
      transcript,
      ai,
      cfg.structureModel,
      'AI could not confidently read one or more regions. Try tighter crops with even lighting.'
    )
  } catch (error) {
    rethrowExtractionError(error)
  }
}

async function extractRecipeFromImageTwoStage(
  imageBase64: string,
  event: Parameters<typeof getExtractionConfig>[0],
  imageMimeType?: string
): Promise<ExtractedRecipe> {
  const cfg = getExtractionConfig(event)
  const ai = await getWorkersAi(event).client()
  const imageDataUrl = `data:${normalizeImageMimeType(imageMimeType)};base64,${imageBase64}`

  await acceptMetaLicenseIfNeeded(ai, cfg.ocrModel)

  try {
    let text = await runVisionTranscription(
      ai,
      cfg.ocrModel,
      FULL_PAGE_TRANSCRIBE_PROMPT,
      imageDataUrl,
      2800
    )
    if (!text.trim()) {
      text = await runVisionTranscription(ai, cfg.ocrModel, FULL_PAGE_TRANSCRIBE_PROMPT, imageDataUrl, 2800)
    }

    let transcript = parseTranscriptFromPlainText(text, 'full')

    transcript.methodText = sanitizeTriRegionMethodText(String(transcript.methodText || ''))
    const hasMethod = safeTrim(transcript.methodText).length > 0
    const hasIngredients = safeTrim(transcript.ingredientsText).length > 0

    if (hasIngredients && !hasMethod) {
      const methodText = await runVisionTranscription(
        ai,
        cfg.ocrModel,
        METHOD_ONLY_TRANSCRIBE_PROMPT,
        imageDataUrl,
        2200
      )
      if (methodText.trim()) {
        transcript = mergeTranscripts(
          transcript,
          parseTranscriptFromPlainText(methodText, 'method')
        )
      }
    }

    return await finalizeTwoStageExtraction(
      transcript,
      ai,
      cfg.structureModel,
      'AI could not confidently extract ingredients or steps. Try scanning ingredients and method separately (two crops), with flat framing and even lighting.'
    )
  } catch (error) {
    const err = error as { statusCode?: number; statusMessage?: string; message?: string; data?: { detail?: string } }
    if (err?.statusCode === 429) {
      throw createError({ statusCode: 429, statusMessage: 'AI rate limit exceeded. Please try again later.' })
    }
    if (err?.statusCode === 402) {
      throw createError({ statusCode: 402, statusMessage: 'AI quota exceeded. Please check your plan limits.' })
    }
    if (err?.statusCode === 422) {
      throw createError({
        statusCode: 422,
        statusMessage: err.statusMessage || 'No extractable recipe content found in this image.',
        data: {
          detail: err?.data?.detail || 'AI could not confidently extract ingredients or steps from this image.'
        }
      })
    }
    rethrowExtractionError(error)
  }
}

/**
 * Extract from three pre-cropped images (title block, ingredients list, method).
 * Three focused vision calls; merged via the same transcript pipeline as full-page extraction.
 */
export async function extractRecipeFromRegionImages(
  titleBase64: string,
  ingredientsBase64: string,
  methodBase64: string,
  event?: Parameters<typeof getExtractionConfig>[0],
  titleMime?: string,
  ingredientsMime?: string,
  methodMime?: string
): Promise<ExtractedRecipe> {
  if (getExtractionConfig(event).useTwoStage) {
    return extractRecipeFromRegionImagesTwoStage(
      titleBase64,
      ingredientsBase64,
      methodBase64,
      event,
      titleMime,
      ingredientsMime,
      methodMime
    )
  }
  return extractRecipeFromRegionImagesLegacy(
    titleBase64,
    ingredientsBase64,
    methodBase64,
    event,
    titleMime,
    ingredientsMime,
    methodMime
  )
}

async function extractRecipeFromRegionImagesLegacy(
  titleBase64: string,
  ingredientsBase64: string,
  methodBase64: string,
  event?: Parameters<typeof getExtractionConfig>[0],
  titleMime?: string,
  ingredientsMime?: string,
  methodMime?: string
): Promise<ExtractedRecipe> {
  const ai = await getWorkersAi(event).client()
  const visionModel = '@cf/meta/llama-3.2-11b-vision-instruct'
  const titleMimeNorm = normalizeImageMimeType(titleMime)
  const ingredientsMimeNorm = normalizeImageMimeType(ingredientsMime)
  const methodMimeNorm = normalizeImageMimeType(methodMime)
  const titleUrl = `data:${titleMimeNorm};base64,${titleBase64}`
  const ingredientsUrl = `data:${ingredientsMimeNorm};base64,${ingredientsBase64}`
  const methodUrl = `data:${methodMimeNorm};base64,${methodBase64}`

  const titlePrompt = `OCR task: read the recipe title and any short introduction visible in this crop.

Output requirements (strict):
- Respond with ONLY a single JSON object matching the schema. No markdown, no bullet lists, no headings, no text before or after the JSON.
- title: the recipe name exactly as printed (plain text). Never use generic section labels such as "Recipe Information", "Ingredients", or "Method" as the title unless those words are literally the recipe name on the page.
- description: the introductory paragraph if present, otherwise "".
- tags: short strings or [].
- Do not wrap values in ** or *.`

  const ingredientsPrompt = `OCR task: read only the ingredient lines in this image.

Output requirements (strict):
- Respond with ONLY a single JSON object matching the schema. No commentary, no markdown, no text outside the JSON.
- ingredientsText must be a single string. Put each ingredient on its own line using newline characters inside that string (not an array of strings).
- Copy quantities and units as printed.`

  const methodPrompt = `OCR task: read only the cooking method / instructions in this image.

Output requirements (strict):
- Your entire reply must be ONLY one JSON object that matches the schema — nothing else. No assistant message, no markdown, no code fences, no text before or after the object.
- Do not write "Sure", "Here is", "Below is", "JSON format", or any similar phrase anywhere.
- methodText must be plain prose only: the recipe instructions as printed. Newlines between steps. Keep 1. 2. 3. prefixes if the book uses them.
- methodText must NOT contain another JSON object, escaped JSON, or the words schema or methodText inside the string — only the actual cooking steps.`

  try {
    try {
      await ai.run(visionModel, {
        messages: [{ role: 'user', content: 'agree' }]
      })
    } catch {
      // ignore
    }

    const [titleResponse, ingredientsResponse, methodResponse] = await Promise.all([
      runVisionPrompt(ai, visionModel, titlePrompt, titleUrl, { type: 'json_schema', json_schema: REGION_TITLE_SCHEMA }, 2000),
      runVisionPrompt(ai, visionModel, ingredientsPrompt, ingredientsUrl, { type: 'json_schema', json_schema: REGION_INGREDIENTS_SCHEMA }, 2400),
      runVisionPrompt(ai, visionModel, methodPrompt, methodUrl, { type: 'json_schema', json_schema: REGION_METHOD_SCHEMA }, 2600)
    ])

    const titleData = parseAiRecipeJson(titleResponse) as unknown as Record<string, unknown>
    const ingredientsData = parseAiRecipeJson(ingredientsResponse) as unknown as Record<string, unknown>
    const methodData = parseAiRecipeJson(methodResponse) as unknown as Record<string, unknown>

    const resolvedTitle = resolveRegionTitleFromParsed(titleData, titleResponse)
    let titleForTranscript = sanitizeRegionTitle(resolvedTitle, titleResponse)
    if (
      !titleForTranscript.trim()
      && resolvedTitle.trim()
      && !/^(recipe information|ingredients?|method|instructions?)$/i.test(resolvedTitle.trim())
    ) {
      titleForTranscript = resolvedTitle.trim()
    }

    let transcript: TranscribedRecipeText = {
      title: titleForTranscript,
      description: pickStringField(titleData, 'description', 'intro', 'introduction'),
      servings: typeof titleData.servings === 'number' ? titleData.servings : undefined,
      ingredientsText: ingredientsTextFromRegionParsed(ingredientsData),
      methodText: resolveRegionMethodText(methodData, methodResponse),
      tags: Array.isArray(titleData.tags) ? titleData.tags.filter((t): t is string => typeof t === 'string') : []
    }

    let structured = structureFromTranscript(transcript)
    let normalized = normalizeExtractedRecipe(structured)

    if ((normalized.steps || []).filter(isMeaningfulStep).length === 0) {
      const methodRetry = await runVisionPrompt(
        ai,
        visionModel,
        `${methodPrompt}\nIf nothing is readable, return exactly {"methodText":""} with no other keys or text.`,
        methodUrl,
        { type: 'json_schema', json_schema: REGION_METHOD_SCHEMA },
        2600
      )
      const retryData = parseAiRecipeJson(methodRetry) as unknown as Record<string, unknown>
      const retryMethod = resolveRegionMethodText(retryData, methodRetry)
      if (retryMethod.trim()) {
        transcript = { ...transcript, methodText: retryMethod }
        structured = structureFromTranscript(transcript)
        normalized = normalizeExtractedRecipe(structured)
      }
    }

    if (!hasMeaningfulExtraction(normalized)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'No extractable recipe content found in this image.',
        data: {
          detail: 'AI could not confidently read one or more regions. Try tighter crops with even lighting.'
        }
      })
    }

    return normalized
  } catch (error: any) {
    if (error?.statusCode === 422 || error?.statusCode === 429 || error?.statusCode === 402) {
      throw error
    }
    const originalErrorDetail = normalizeErrorDetail(
      error?.data?.detail || error?.statusMessage || error?.message,
      'Unknown error',
      4000
    )
    throw createError({
      statusCode: Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500,
      statusMessage: 'Failed to extract recipe',
      data: { detail: originalErrorDetail }
    })
  }
}

export async function extractRecipeFromImage(
  imageBase64: string,
  event?: Parameters<typeof getExtractionConfig>[0],
  imageMimeType?: string
): Promise<ExtractedRecipe> {
  if (getExtractionConfig(event).useTwoStage) {
    return extractRecipeFromImageTwoStage(imageBase64, event, imageMimeType)
  }
  return extractRecipeFromImageLegacy(imageBase64, event, imageMimeType)
}

async function extractRecipeFromImageLegacy(
  imageBase64: string,
  event?: Parameters<typeof getExtractionConfig>[0],
  imageMimeType?: string
): Promise<ExtractedRecipe> {
  const ai = await getWorkersAi(event).client()
  const normalizedMimeType = normalizeImageMimeType(imageMimeType)
  const imageDataUrl = `data:${normalizedMimeType};base64,${imageBase64}`
  const visionModel = '@cf/meta/llama-3.2-11b-vision-instruct'

  const transcriptionPrompt = `You are an OCR recipe transcription assistant for cookbook pages.
Return ONLY one JSON object matching the schema — no markdown, no commentary, no text outside the JSON.
Read the image and extract:
- title (plain text, no markdown asterisks)
- short description/introduction text if present
- ingredientsText: one ingredient per line, including quantities and units as printed (e.g. 250 g green beans, not only "g green beans" if the number is visible)
- methodText: ALL text from the METHOD / instructions section only — not the ingredients list. Plain prose with newlines between steps; no nested JSON, no "Sure/Here is", no schema repetition. On two-column pages, read the method column (often right-hand). Number each step as 1. 2. 3. if the book does, otherwise one paragraph per line; separate steps with newlines
- servings when visible
- tags as array if visible, otherwise []
Do not convert ingredients into structured fields yet; copy lines faithfully.`

  const ingredientsOnlyPrompt = `Extract only ingredient lines from this image.
Return JSON with keys: ingredientsText, title.
- ingredientsText must be newline-separated ingredient lines exactly as printed.
- title: short recipe title if visible at the top, else empty string.
- If nothing is readable, return ingredientsText as empty string.`

  const stepsOnlyPrompt = `Extract only cooking method / instructions from this image (ignore ingredients lists).
Return ONLY one JSON object with keys methodText and title — no preamble, no markdown, no assistant wording.
- methodText: plain prose only — every numbered or paragraph step, newline-separated. Preserve 1. 2. 3. prefixes if present. Do not put JSON, schema text, or phrases like "Sure" or "Here is" inside methodText.
- title: short recipe title if visible, else empty string.
- On two-column layouts, transcribe the method column in full.
- If nothing is readable, return exactly {"methodText":"","title":""}.`

  try {
    try {
      await ai.run(visionModel, {
        messages: [{ role: 'user', content: 'agree' }]
      })
    } catch {
      // ignore: agreement may already be accepted
    }

    const transcriptionResponse = await runVisionPrompt(
      ai,
      visionModel,
      transcriptionPrompt,
      imageDataUrl,
      { type: 'json_schema', json_schema: TRANSCRIPTION_SCHEMA },
      2600
    )

    const transcribed = parseAiRecipeJson(transcriptionResponse) as TranscribedRecipeText
    transcribed.methodText = sanitizeTriRegionMethodText(String(transcribed.methodText || ''))
    let structured = structureFromTranscript(transcribed)
    let normalized = normalizeExtractedRecipe(structured)

    // Ingredients present but no method: common on two-column scans — run a focused steps pass.
    {
      const meaningfulStepCount = (normalized.steps || []).filter(isMeaningfulStep).length
      if (normalized.ingredients.length > 0 && meaningfulStepCount === 0) {
        const stepsRetry = await runVisionPrompt(
          ai,
          visionModel,
          stepsOnlyPrompt,
          imageDataUrl,
          {
            type: 'json_schema',
            json_schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                title: { type: 'string', maxLength: 240 },
                methodText: { type: 'string', maxLength: 18000 }
              },
              required: ['methodText', 'title']
            }
          },
          1800
        )
        const sData = parseAiRecipeJson(stepsRetry) as TranscribedRecipeText
        sData.methodText = sanitizeTriRegionMethodText(String(sData.methodText || ''))
        const mergedSteps = parseMethodTextToSteps(String(sData.methodText || ''))
        if (mergedSteps.filter(isMeaningfulStep).length > 0) {
          structured = {
            ...structured,
            title: structured.title || String(sData.title || '').replace(/\*\*/g, '').trim(),
            steps: mergedSteps
          }
          normalized = normalizeExtractedRecipe(structured)
        }
      }
    }

    if (!hasMeaningfulExtraction(normalized)) {
      const ingredientsRetry = await runVisionPrompt(
        ai,
        visionModel,
        ingredientsOnlyPrompt,
        imageDataUrl,
        {
          type: 'json_schema',
          json_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', maxLength: 240 },
              ingredientsText: { type: 'string', maxLength: 12000 }
            },
            required: ['ingredientsText', 'title']
          }
        },
        1800
      )
      const iData = parseAiRecipeJson(ingredientsRetry) as TranscribedRecipeText
      structured = {
        ...structured,
        title: structured.title || iData.title,
        ingredients: splitLines(String(iData.ingredientsText || '')).map(parseIngredientLine)
      }
      normalized = normalizeExtractedRecipe(structured)
    }

    if (!hasMeaningfulExtraction(normalized)) {
      const stepsRetry = await runVisionPrompt(
        ai,
        visionModel,
        stepsOnlyPrompt,
        imageDataUrl,
        {
          type: 'json_schema',
          json_schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', maxLength: 240 },
              methodText: { type: 'string', maxLength: 18000 }
            },
            required: ['methodText', 'title']
          }
        },
        1800
      )
      const sData = parseAiRecipeJson(stepsRetry) as TranscribedRecipeText
      sData.methodText = sanitizeTriRegionMethodText(String(sData.methodText || ''))
      structured = {
        ...structured,
        title: structured.title || sData.title,
        steps: parseMethodTextToSteps(String(sData.methodText || ''))
      }
      normalized = normalizeExtractedRecipe(structured)
    }

    if (!hasMeaningfulExtraction(normalized)) {
      // Last-chance retry with looser JSON object response.
      const fallbackStructuredResponse = await runVisionPrompt(
        ai,
        visionModel,
        `Extract recipe fields from this image. Return ONLY a JSON object with keys title, description, ingredients, steps, tags, servings. No assistant preamble. For steps use plain instruction text in each step's content — not nested JSON or meta-commentary.`,
        imageDataUrl,
        { type: 'json_object' },
        2200
      )
      const fallbackStructured = parseAiRecipeJson(fallbackStructuredResponse)
      const fallbackNormalized = normalizeExtractedRecipe(fallbackStructured)
      if (getExtractionQualityScore(fallbackNormalized).total > getExtractionQualityScore(normalized).total) {
        normalized = fallbackNormalized
      }
    }

    if (shouldRunCorrectionPass(normalized)) {
      try {
        const correctionPrompt = `Repair this extracted recipe JSON so ingredient fields are consistent.
Return only corrected JSON with the same schema keys.
Rules:
- ingredientName must not contain page references (e.g. see page 25)
- amount should contain quantity only when possible
- unit should be canonical (cups, tbsp, tsp, grams, kg, oz, lb, ml, l, pieces)
- notes should carry references/preparation/extra qualifiers
- keep original meaning and ordering
JSON to repair:
${JSON.stringify(normalized)}`

        const correctionResponse = await ai.run(visionModel, {
          messages: [{ role: 'user', content: correctionPrompt }],
          max_tokens: 1800,
          temperature: EXTRACTION_TEMPERATURE,
          top_p: EXTRACTION_TOP_P,
          seed: EXTRACTION_SEED,
          response_format: {
            type: 'json_schema',
            json_schema: RECIPE_RESPONSE_SCHEMA
          }
        })

        const corrected = parseAiRecipeJson(correctionResponse)
        const correctedNormalized = normalizeExtractedRecipe(corrected)
        const baseScore = getExtractionQualityScore(normalized)
        const correctedScore = getExtractionQualityScore(correctedNormalized)
        if (correctedScore.total > baseScore.total) {
          normalized = correctedNormalized
        }
      } catch {
        // keep existing output
      }
    }

    if (!hasMeaningfulExtraction(normalized)) {
      throw createError({
        statusCode: 422,
        statusMessage: 'No extractable recipe content found in this image.',
        data: {
          detail: 'AI could not confidently extract ingredients or steps. Try scanning ingredients and method separately (two crops), with flat framing and even lighting.'
        }
      })
    }

    return normalized
  } catch (error: any) {
    const originalErrorDetail = normalizeErrorDetail(
      error?.data?.detail || error?.statusMessage || error?.message,
      'Unknown error',
      4000
    )

    if (error.statusCode === 429) {
      throw createError({ statusCode: 429, statusMessage: 'AI rate limit exceeded. Please try again later.' })
    }
    if (error.statusCode === 402) {
      throw createError({ statusCode: 402, statusMessage: 'AI quota exceeded. Please check your plan limits.' })
    }
    if (error.statusCode === 422) {
      throw createError({
        statusCode: 422,
        statusMessage: error.statusMessage || 'No extractable recipe content found in this image.',
        data: {
          detail: error?.data?.detail || 'AI could not confidently extract ingredients or steps from this image.'
        }
      })
    }

    const statusCode = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600
      ? error.statusCode
      : 500

    throw createError({
      statusCode,
      statusMessage: 'Failed to extract recipe',
      data: { detail: originalErrorDetail }
    })
  }
}

/**
 * Extract recipe from URL (for future use)
 * This would fetch the webpage, extract text, and use AI to parse
 */
export async function extractRecipeFromURL(url: string): Promise<ExtractedRecipe> {
  // TODO: Implement URL extraction
  // 1. Fetch webpage content
  // 2. Extract text content (remove HTML)
  // 3. Use AI text model to parse recipe information
  // 4. Return structured data

  throw createError({
    statusCode: 501,
    statusMessage: 'URL extraction not yet implemented'
  })
}
