/**
 * The intake transcript (project_intake_messages). Server only. Callers check
 * project ownership first; this module keys on project id alone.
 */

import { createAdminClient } from '../supabase/admin';
import type { IntakeMessage } from './extract';

export type StoredIntakeMessage = IntakeMessage & { id: string; createdAt: string };

type Row = { id: string; role: 'user' | 'assistant'; content: string; question_keys: unknown; created_at: string };

function toMessage(r: Row): StoredIntakeMessage {
  const keys = Array.isArray(r.question_keys) ? r.question_keys.filter((k): k is string => typeof k === 'string') : [];
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    ...(keys.length > 0 ? { questionKeys: keys } : {}),
    createdAt: r.created_at,
  };
}

export async function listIntakeMessages(projectId: string): Promise<StoredIntakeMessage[]> {
  const { data, error } = await createAdminClient()
    .from('project_intake_messages')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listIntakeMessages: ${error.message}`);
  return ((data ?? []) as Row[]).map(toMessage);
}

export async function appendIntakeMessages(projectId: string, messages: IntakeMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const base = Date.now();
  const { error } = await createAdminClient().from('project_intake_messages').insert(
    messages.map((m, i) => ({
      project_id: projectId,
      role: m.role,
      content: m.content,
      question_keys: m.questionKeys ?? [],
      // Stamped here so two messages written together keep their order.
      created_at: new Date(base + i).toISOString(),
    })),
  );
  if (error) throw new Error(`appendIntakeMessages: ${error.message}`);
}
