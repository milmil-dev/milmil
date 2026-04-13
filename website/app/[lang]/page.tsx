import { LandingPage } from '@/components/landing';
import { i18n } from '@/lib/i18n';

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return <LandingPage lang={lang} />;
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}
