import { NextResponse } from 'next/server';
import { mailer, type MailAttachment } from '@/lib/mail/provider';
import {
  CREW_JOIN_EMAIL,
  ROSTER_MAX_FILE_BYTES,
  ROSTER_MAX_TOTAL_BYTES,
  ROSTER_MAX_WORK_PHOTOS,
} from '@/lib/crew';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Applications only carry raw bytes; nothing lives in storage. */
const noStorage = async (path: string): Promise<Buffer> => {
  throw new Error(`roster applications attach buffers only, got storage path ${path}`);
};

/**
 * Public: a contractor applies to join the crew roster. The application is
 * emailed to the crew inbox with the headshot and work photos attached —
 * nothing is stored. The `company` field is a honeypot: bots fill it, people
 * never see it, and a tripped honeypot gets a fake success.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad('expected multipart form data');
  }

  if (form.get('company')) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const website = String(form.get('website') ?? '').trim().slice(0, 200);
  const social = String(form.get('social') ?? '').trim().slice(0, 200);
  const headshot = form.get('headshot');
  const photos = form.getAll('photos').filter((p): p is File => p instanceof File && p.size > 0);

  if (!name) return bad('Name is required');
  if (!EMAIL_RE.test(email)) return bad('A valid email is required');
  if (!website) return bad('Website is required');
  if (!social) return bad('Social media is required');
  if (!(headshot instanceof File) || headshot.size === 0) return bad('A headshot is required');
  if (photos.length === 0) return bad('At least one work photo is required');
  if (photos.length > ROSTER_MAX_WORK_PHOTOS) {
    return bad(`At most ${ROSTER_MAX_WORK_PHOTOS} work photos`);
  }

  const files = [headshot, ...photos];
  for (const f of files) {
    if (!f.type.startsWith('image/')) return bad(`${f.name || 'A file'} is not an image`);
    if (f.size > ROSTER_MAX_FILE_BYTES) return bad(`${f.name || 'A file'} is over 5 MB`);
  }
  if (files.reduce((sum, f) => sum + f.size, 0) > ROSTER_MAX_TOTAL_BYTES) {
    return bad('Images total over 20 MB');
  }

  const attachments: MailAttachment[] = await Promise.all(
    files.map(async (f, i) => ({
      filename: `${i === 0 ? 'headshot' : `work-${i}`}-${f.name || 'photo'}`.slice(0, 120),
      content: Buffer.from(await f.arrayBuffer()),
      contentType: f.type,
    })),
  );

  const text = [
    'Crew roster application',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Website: ${website}`,
    `Social media: ${social}`,
    `Work photos: ${photos.length}`,
    '',
    'Headshot and work photos attached. Reply to reach the applicant.',
  ].join('\n');

  const html = [
    '<h2>Crew roster application</h2>',
    `<p><strong>Name:</strong> ${escapeHtml(name)}<br>`,
    `<strong>Email:</strong> ${escapeHtml(email)}<br>`,
    `<strong>Website:</strong> ${escapeHtml(website)}<br>`,
    `<strong>Social media:</strong> ${escapeHtml(social)}<br>`,
    `<strong>Work photos:</strong> ${photos.length}</p>`,
    '<p>Headshot and work photos attached. Reply to reach the applicant.</p>',
  ].join('\n');

  try {
    await mailer(noStorage).send({
      to: CREW_JOIN_EMAIL,
      replyTo: email,
      subject: `Roster application — ${name}`,
      text,
      html,
      attachments,
    });
  } catch (err) {
    console.error('[crew/roster-applications] send failed', err);
    return NextResponse.json({ error: 'Failed to send application' }, { status: 502 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
