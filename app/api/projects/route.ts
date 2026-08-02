import { NextResponse } from 'next/server';
import { createProject, type CreateProjectInput } from '@/lib/projects';

export async function POST(req: Request) {
  const body = (await req.json()) as CreateProjectInput;
  if (!body.lines?.length) {
    return NextResponse.json({ error: 'no lines' }, { status: 400 });
  }
  const project = await createProject(body);
  return NextResponse.json({ id: project.id });
}
