import { notFound } from 'next/navigation';
import { DemoResource } from '@/components/demo-resource';
import { resolveMode } from '@/lib/config';
export default async function ResourcePage({ params, searchParams }: { params: Promise<{kind:string}>; searchParams:Promise<{ref?:string}> }) {
  if (resolveMode() !== 'demo') notFound();
  const { kind } = await params; const { ref } = await searchParams;
  if (!['chat','sop','form','ticket'].includes(kind)) notFound();
  return <DemoResource kind={kind as 'chat'|'sop'|'form'|'ticket'} reference={ref || ''} />;
}
