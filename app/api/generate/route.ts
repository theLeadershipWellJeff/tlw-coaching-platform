import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSession, readJson, toErrorResponse } from '@/lib/api-handler'
import { generatePrepContent } from '@/lib/prep-sheets/content'

const GenerateSchema = z.object({
  clientName: z.string().trim().min(1, 'clientName required'),
  clientId: z.string().optional(),
  notes: z
    .array(z.object({ date: z.union([z.string(), z.number()]).optional(), content: z.string() }))
    .default([]),
  actions: z.array(z.any()).optional(),
  zoomSummaries: z.array(z.any()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    await requireSession()
    const input = await readJson(req, GenerateSchema)

    // The generator itself lives in lib/prep-sheets/content.ts so the background
    // pipeline (lib/prep-sheets/generate.ts) reuses the exact same prompt + goal
    // overlay rather than forking a second generator.
    try {
      const { content } = await generatePrepContent(input)
      return NextResponse.json({ content })
    } catch (e) {
      console.error('[generate] prep content generation failed', e)
      return NextResponse.json({ error: 'Failed to generate prep content' }, { status: 500 })
    }
  } catch (e) {
    return toErrorResponse(e)
  }
}
