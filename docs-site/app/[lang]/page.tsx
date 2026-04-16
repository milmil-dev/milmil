import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { LandingPage } from '@/components/landing';
import { i18n } from '@/lib/i18n';
import { baseOptions } from '@/lib/nav-options';

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const options = baseOptions(lang);
  return (
    <HomeLayout {...options} nav={{ ...options.nav, transparentMode: 'top' }}>
      <LandingPage lang={lang} />
    </HomeLayout>
  );
}

export function generateStaticParams() {
  return i18n.languages.map((lang) => ({ lang }));
}
