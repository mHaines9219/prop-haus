/**
 * One intake turn: the user's message → a profile patch → the saved profile →
 * the reply → the re-evaluated checklist.
 *
 * Order matters: short answers to the previous question are resolved in code
 * before the extractor runs, the extractor's patch is merged and normalized,
 * and the profile is saved before the checklist is built, so what the user
 * sees is always what is on disk.
 */

import type { PlanTier } from '../accounts';
import { recordEvents } from '../analytics';
import { getProject } from '../projects';
import { mergeProjectProfile, profileFacts, profileGaps, type ProfileGap, type ProjectProfile } from '../project-profile';
import { updateProjectProfile } from '../project-profile-store';
import type { Checklist } from '../requirements/evaluate';
import { buildChecklist } from '../requirements/store';
import { MAX_QUESTIONS_PER_TURN, composeReply, intakeExtractor, shortAnswerPatch, type IntakeMessage } from './extract';
import { appendIntakeMessages, listIntakeMessages } from './store';

export type IntakeTurn = {
  reply: string;
  questions: ProfileGap[];
  profile: ProjectProfile;
  facts: ReturnType<typeof profileFacts>;
  checklist: Checklist;
  /** Which extractor answered: surfaces "mock" in the UI so nobody mistakes it for the model. */
  provider: 'mock' | 'openrouter';
};

/** Null when the project is not the org's. */
export async function runIntakeTurn(
  orgId: string,
  projectId: string,
  message: string,
  plan: PlanTier = 'free',
  opts: { userId?: string | null } = {},
): Promise<IntakeTurn | null> {
  const project = await getProject(orgId, projectId);
  if (!project) return null;

  const transcript = await listIntakeMessages(projectId);
  const lastAssistant = [...transcript].reverse().find((m) => m.role === 'assistant');
  const before = project.profile;

  const shortPatch = shortAnswerPatch(message, lastAssistant?.questionKeys);
  const afterShort = mergeProjectProfile(before, shortPatch);

  const extractor = intakeExtractor();
  let output;
  try {
    output = await extractor.extract({
      projectName: project.name,
      profile: afterShort,
      transcript,
      message,
      gaps: profileGaps(afterShort),
    });
  } catch (err) {
    console.warn(`[intake] ${extractor.name} extraction failed, keeping the short-answer patch only: ${(err as Error).message}`);
    output = { patch: {}, askedKeys: [] as string[] };
  }

  const profile = mergeProjectProfile(afterShort, output.patch);
  await updateProjectProfile(orgId, projectId, profile);

  const remaining = profileGaps(profile);
  const askedFromModel = output.askedKeys.map((k) => remaining.find((g) => g.key === k)).filter((g): g is ProfileGap => Boolean(g));
  const questions = (askedFromModel.length > 0 ? askedFromModel : remaining).slice(0, MAX_QUESTIONS_PER_TURN);

  const learned = mergeProjectProfile(shortPatch, output.patch);
  const reply = output.reply ?? composeReply(learned, questions);

  const messages: IntakeMessage[] = [
    { role: 'user', content: message },
    { role: 'assistant', content: reply, questionKeys: questions.map((q) => q.key) },
  ];
  await appendIntakeMessages(projectId, messages);

  const built = await buildChecklist(orgId, projectId, plan);
  if (!built) return null;

  await recordEvents({
    orgId,
    userId: opts.userId ?? null,
    type: 'project_intake',
    payload: { projectId, provider: extractor.name, fieldsLearned: Object.keys(learned), open: remaining.length },
  });

  return {
    reply,
    questions,
    profile,
    facts: profileFacts(profile),
    checklist: built.checklist,
    provider: extractor.name,
  };
}
