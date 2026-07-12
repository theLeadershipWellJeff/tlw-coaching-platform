import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { toErrorResponse, readJson, ApiError } from '@/lib/api-handler'
import { requireClientCoach } from '@/lib/client-access'
import { draftNudge } from '@/lib/nudges/draft'
import { loadFrameworkContext } from '@/lib/nudges/garden'

export const runtime = 'nodejs'
export const maxDuration = 60

const Schema = z.object({
  type: z.enum(['action_checkin', 'insight', 'framework', 'goals']),
  // The action description or insight line to build the message around. Optional
  // for a framework (the leaf provides the substance).
  trigger_excerpt: z.string().max(2000).optional(),
  // Required for a framework: the surfaceable garden leaf id to re-surface.
  framework_slug: z.string().max(200).optional(),
  // Goals nudge: the goal title to focus on, or '__all__' for every goal.
  goal_focus: z.string().max(300).optional(),
  // Goals nudge: the flavor — reminder (with a small action), assessment
  // (invite adjusting the goals), or win (name a recent win on the goal).
  goal_angle: z.enum(['reminder', 'assessment', 'win']).optional(),
})

// AI-draft a single manual nudge in the coach's voice from a chosen anchor (an
// open action, a captured insight, a surfaceable framework, or the client's
// engagement goals). Returns { subject, body } WITHOUT persisting — the modal
// previews it, the coach edits, then creates.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = getSupabaseAdmin()
    const coach = await requireClientCoach(supabase, params.id)
    const body = await readJson(req, Schema)

    const { data: client } = await supabase
      .from('clients')
      .select('name, coaching_goals')
      .eq('id', params.id)
      .maybeSingle()
    if (!client) throw new ApiError(404, 'Client not found')

    // A framework needs its live garden context (and enforces the surfacing gate).
    let frameworkContext = null
    let goalsContext = null
    if (body.type === 'framework') {
      if (!body.framework_slug) throw new ApiError(400, 'Choose a framework to re-surface.')
      frameworkContext = await loadFrameworkContext(supabase, coach.id, body.framework_slug)
      if (!frameworkContext) throw new ApiError(404, 'That framework isn’t a surfaceable leaf.')
    } else if (body.type === 'goals') {
      if (!body.goal_focus || !body.goal_angle) throw new ApiError(400, 'Choose a goal and an angle.')
      const allGoals = ((client.coaching_goals ?? []) as {
        title?: string
        description?: string
        metrics?: string[]
      }[]).filter((g) => g?.title)
      if (allGoals.length === 0) {
        throw new ApiError(400, 'This client has no coaching goals on file — set their goals first.')
      }
      const selected =
        body.goal_focus === '__all__' ? allGoals : allGoals.filter((g) => g.title === body.goal_focus)
      if (selected.length === 0) throw new ApiError(404, 'That goal isn’t on the client’s goal list.')
      goalsContext = {
        angle: body.goal_angle,
        goals: selected.map((g) => ({
          title: g.title as string,
          description: g.description,
          metrics: g.metrics,
        })),
        allGoals: body.goal_focus === '__all__',
      }
    } else if (!body.trigger_excerpt) {
      throw new ApiError(400, 'Nothing to draft from.')
    }

    const firstName = client.name.split(/\s+/)[0] || client.name
    const draft = await draftNudge({
      clientFirstName: firstName,
      candidate: {
        type: body.type,
        origin: 'manual',
        trigger_excerpt:
          body.trigger_excerpt ||
          frameworkContext?.title ||
          (goalsContext
            ? goalsContext.allGoals
              ? 'All coaching goals'
              : goalsContext.goals[0].title
            : ''),
        rationale: '',
        action_description: body.type === 'action_checkin' ? body.trigger_excerpt : undefined,
        framework_slug: body.type === 'framework' ? body.framework_slug : undefined,
      },
      frameworkContext,
      goalsContext,
    })
    if (!draft) throw new ApiError(502, 'Could not draft a nudge — try again.')

    return NextResponse.json(draft)
  } catch (e) {
    return toErrorResponse(e)
  }
}
